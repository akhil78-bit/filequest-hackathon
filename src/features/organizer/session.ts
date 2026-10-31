import { Inflate, Zip, ZipPassThrough, strToU8 } from 'fflate';
import { planFiles } from './classify';
import type { Manifest, ManifestEntry, Phase } from './protocol';
import { ArchiveError, crc32, inspectZip, MAX_OUTPUT_BYTES, updateCrc, ZIP_LIMITS } from './zip-format';
import type { ZipEntry, ZipLimits } from './zip-format';

export class CancelledError extends Error {
  constructor() { super('Sorting cancelled. No partial ZIP is available.'); this.name = 'CancelledError'; }
}

const yieldTask = () => new Promise<void>((resolve) => setTimeout(resolve, 0));
const fixedDate = () => new Date(2020, 0, 1);

/** One transaction. A failed/cancelled archive is never offered for download. */
export class OrganizerSession {
  private entries: ZipEntry[];
  private records: ManifestEntry[];
  private phase: Phase = 'ready';
  private aborted = false;
  private active = false;
  private cursor = 0;
  private extracted = 0;
  private outputChunks: Uint8Array[] = [];
  private outputBytes = 0;
  private zipEnded = false;
  private zip: Zip;
  private results = new Map<string, number[]>();
  private output: Uint8Array<ArrayBuffer> | null = null;

  constructor(
    private input: Uint8Array,
    private publish: (manifest: Manifest) => void = () => {},
    private pause: () => Promise<void> = yieldTask,
    private limits: ZipLimits = ZIP_LIMITS,
  ) {
    this.entries = inspectZip(input, limits);
    // Preserve duplicate source entry identity, including identical original paths.
    const plans = planFiles(this.entries.filter((entry) => !entry.directory).map((entry) => entry.originalPath));
    const byPath = new Map<string, typeof plans>();
    for (const plan of plans) {
      const queue = byPath.get(plan.originalPath) ?? [];
      queue.push(plan); byPath.set(plan.originalPath, queue);
    }
    this.records = this.entries.map((entry) => {
      const plan = byPath.get(entry.originalPath)?.shift();
      return {
        id: entry.id, originalPath: entry.originalPath,
        outputPath: plan?.outputPath ?? null, category: plan?.category ?? null,
        bytes: entry.size, crc32: entry.crc.toString(16).padStart(8, '0'),
        status: entry.directory ? 'skipped' : 'pending',
        reason: entry.directory ? 'Directory marker omitted; file paths are reorganized.' : plan!.reason,
      };
    });
    this.zip = new Zip((error, chunk, final) => {
      if (error) throw new ArchiveError('Could not package the organized ZIP.');
      this.outputBytes += chunk.length;
      if (this.outputBytes > MAX_OUTPUT_BYTES) throw new ArchiveError('Organized ZIP exceeds the output memory budget.');
      this.outputChunks.push(chunk);
      if (final) this.zipEnded = true;
    });
  }

  snapshot(): Manifest {
    const count = (status: ManifestEntry['status']) => this.records.filter((entry) => entry.status === status).length;
    const processed = count('processed'), skipped = count('skipped'), failed = count('failed');
    return {
      schemaVersion: 1, rules: 'extension-v1',
      progress: {
        phase: this.phase, total: this.records.length, processed, skipped, failed,
        remaining: this.records.length - processed - skipped - failed,
        processedBytes: this.records.filter((entry) => entry.status === 'processed').reduce((sum, entry) => sum + entry.bytes, 0),
        totalBytes: this.records.reduce((sum, entry) => sum + entry.bytes, 0),
      },
      entries: this.records.map((entry) => ({ ...entry })),
    };
  }

  private checkCancelled() { if (this.aborted) throw new CancelledError(); }

  cancel() {
    if (this.phase === 'complete' || this.phase === 'error' || this.phase === 'cancelled') return;
    this.aborted = true;
    this.phase = 'cancelled';
    for (const record of this.records) if (record.status === 'pending') {
      record.status = 'cancelled'; record.reason = 'Cancelled before successful processing.';
    }
    this.zip.terminate(); this.outputChunks = []; this.output = null;
    // Input cannot be released during the current push; cancellation is observed at the next yield.
    if (!this.active) this.input = new Uint8Array();
  }

  private async copy(entry: ZipEntry, record: ManifestEntry) {
    const destination = new ZipPassThrough(record.outputPath!);
    destination.mtime = fixedDate();
    this.zip.add(destination);
    let actual = 0, checksum = 0xffffffff;
    const consume = (chunk: Uint8Array, final: boolean) => {
      this.checkCancelled();
      actual += chunk.length;
      this.extracted += chunk.length;
      // Check every output chunk BEFORE retaining/packaging it. Metadata alone is insufficient.
      if (actual > entry.size || actual > this.limits.entryBytes || this.extracted > this.limits.totalBytes
        || actual > Math.max(1, entry.compressedSize) * this.limits.ratio) {
        throw new ArchiveError('Decompression stopped: actual bytes exceed the declared size or extraction budget.');
      }
      checksum = updateCrc(checksum, chunk);
      if (final && (actual !== entry.size || ((checksum ^ 0xffffffff) >>> 0) !== entry.crc)) {
        throw new ArchiveError('File integrity check failed: decompressed size or CRC32 does not match.');
      }
      destination.push(chunk, final);
    };
    const compressed = this.input.subarray(entry.dataOffset, entry.dataOffset + entry.compressedSize);
    if (entry.method === 0) {
      if (!compressed.length) consume(compressed, true);
      for (let offset = 0; offset < compressed.length; offset += 65536) {
        consume(compressed.subarray(offset, offset + 65536), offset + 65536 >= compressed.length);
        if (offset % (1024 * 1024) === 0) { await this.pause(); this.checkCancelled(); }
      }
    } else {
      const inflater = new Inflate(consume);
      if (!compressed.length) throw new ArchiveError('Invalid ZIP: empty deflate stream.');
      // A small compressed quantum bounds temporary inflation even when metadata lies.
      // DEFLATE's maximum expansion is roughly 1032:1; never push an entire entry.
      for (let offset = 0; offset < compressed.length; offset += 1024) {
        this.checkCancelled();
        inflater.push(compressed.subarray(offset, offset + 1024), offset + 1024 >= compressed.length);
        if (offset % 16384 === 0) { await this.pause(); this.checkCancelled(); }
      }
    }
  }

  async requestBatch(requestId: string, maxFiles: number): Promise<{ entryIds: number[]; manifest: Manifest }> {
    this.checkCancelled();
    const prior = this.results.get(requestId);
    if (prior) return { entryIds: [...prior], manifest: this.snapshot() };
    if (!requestId || requestId.length > 100 || !Number.isInteger(maxFiles) || maxFiles < 1 || maxFiles > 50) {
      throw new ArchiveError('Invalid batch request. Choose 1–50 files and a unique request ID.');
    }
    if (this.active) throw new ArchiveError('A batch is already processing.');
    if (this.phase === 'error') throw new ArchiveError('This archive failed. Choose a ZIP to retry.');
    if (this.results.size >= 1000) throw new ArchiveError('Too many batch requests.');
    if (this.phase === 'complete') return { entryIds: [], manifest: this.snapshot() };
    this.active = true;
    const completed: number[] = [];
    let current: ManifestEntry | undefined;
    try {
      this.phase = 'processing';
      while (this.cursor < this.entries.length && completed.length < maxFiles) {
        await this.pause(); this.checkCancelled();
        const entry = this.entries[this.cursor]!;
        current = this.records[this.cursor]!;
        if (!entry.directory) {
          await this.copy(entry, current);
          this.checkCancelled();
          current.status = 'processed';
          completed.push(entry.id);
          this.publish(this.snapshot());
        }
        this.cursor++;
        current = undefined;
      }
      if (this.cursor === this.entries.length) await this.finish();
      this.results.set(requestId, completed);
      return { entryIds: [...completed], manifest: this.snapshot() };
    } catch (cause) {
      if (this.aborted || cause instanceof CancelledError) throw new CancelledError();
      this.phase = 'error';
      if (current?.status === 'pending') {
        current.status = 'failed'; current.reason = cause instanceof Error ? cause.message : 'Processing failed.';
      }
      this.outputChunks = []; this.output = null; this.zip.terminate();
      throw cause instanceof ArchiveError ? cause : new ArchiveError('ZIP processing failed: invalid or corrupt compressed data.');
    } finally {
      this.active = false;
      if (this.output || this.phase === 'error' || this.aborted) this.input = new Uint8Array();
    }
  }

  private async finish() {
    this.checkCancelled();
    this.phase = 'packaging'; this.publish(this.snapshot());
    const finalManifest = this.snapshot(); finalManifest.progress.phase = 'complete';
    const manifestBytes = strToU8(JSON.stringify(finalManifest, null, 2));
    if (manifestBytes.length > 4 * 1024 * 1024) throw new ArchiveError('Manifest exceeds the output budget.');
    const manifestFile = new ZipPassThrough('filequest-manifest.json');
    manifestFile.mtime = fixedDate();
    this.zip.add(manifestFile); manifestFile.push(manifestBytes, true); this.zip.end();
    if (!this.zipEnded) throw new ArchiveError('ZIP finalization did not complete.');
    await this.pause(); this.checkCancelled();
    const output = new Uint8Array(this.outputBytes);
    let offset = 0;
    for (const chunk of this.outputChunks) { output.set(chunk, offset); offset += chunk.length; }
    this.outputChunks = [];
    const outputEntries = inspectZip(output, {
      ...ZIP_LIMITS, inputBytes: MAX_OUTPUT_BYTES, fileEntries: 501,
      totalBytes: 104 * 1024 * 1024,
    });
    const expected = new Map(this.records.filter((entry) => entry.status === 'processed').map((entry) => [entry.outputPath!, entry]));
    if (outputEntries.length !== expected.size + 1) throw new ArchiveError('ZIP output entry count mismatch.');
    for (const entry of outputEntries) {
      this.checkCancelled();
      const record = expected.get(entry.originalPath);
      const wantedCrc = record ? Number.parseInt(record.crc32, 16) : crc32(manifestBytes);
      const wantedSize = record ? record.bytes : manifestBytes.length;
      if ((!record && entry.originalPath !== 'filequest-manifest.json') || entry.method !== 0
        || entry.crc !== wantedCrc || entry.size !== wantedSize) throw new ArchiveError('ZIP output metadata mismatch.');
      let checksum = 0xffffffff;
      for (let position = 0; position < entry.size; position += 1024 * 1024) {
        checksum = updateCrc(checksum, output.subarray(entry.dataOffset + position, entry.dataOffset + Math.min(position + 1024 * 1024, entry.size)));
        await this.pause(); this.checkCancelled();
      }
      if (((checksum ^ 0xffffffff) >>> 0) !== wantedCrc) throw new ArchiveError('ZIP output content verification failed.');
    }
    this.output = output; this.phase = 'complete';
  }

  takeOutput(): ArrayBuffer {
    if (this.phase !== 'complete' || !this.output) throw new ArchiveError('No complete verified ZIP is available.');
    const buffer = this.output.buffer;
    this.output = null;
    return buffer;
  }
}
