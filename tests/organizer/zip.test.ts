import { createHash } from 'node:crypto';
import { strFromU8, unzipSync, zipSync } from 'fflate';
import { describe, expect, it } from 'vitest';
import { createDemoZip } from '../../src/features/organizer/demo-zip';
import type { Manifest } from '../../src/features/organizer/protocol';
import { CancelledError, OrganizerSession } from '../../src/features/organizer/session';
import { ArchiveError, crc32, inspectZip, ZIP_LIMITS } from '../../src/features/organizer/zip-format';
import { centralOffset, fixtureZip, text } from './fixtures';

const noPause = async () => {};
async function organize(bytes: Uint8Array) {
  const progress: Manifest[] = [];
  const session = new OrganizerSession(bytes, (manifest) => progress.push(manifest), noPause);
  await session.requestBatch('all', 50);
  return { bytes: new Uint8Array(session.takeOutput()), manifest: session.snapshot(), progress };
}
const sha256 = (bytes: Uint8Array) => createHash('sha256').update(bytes).digest('hex');

describe('real ZIP round trips', () => {
  it('copies all 20 demo files byte-for-byte and exports a truthful manifest', async () => {
    const input = createDemoZip(), before = input.slice(), original = unzipSync(input);
    const result = await organize(input), output = unzipSync(result.bytes);
    expect(input).toEqual(before);
    expect(Object.keys(output)).toHaveLength(21);
    expect(result.manifest.progress).toMatchObject({ phase: 'complete', processed: 20, failed: 0, skipped: 0, remaining: 0 });
    for (const record of result.manifest.entries) {
      expect(record.status).toBe('processed');
      expect(sha256(output[record.outputPath!]!)).toBe(sha256(original[record.originalPath]!));
    }
    expect(JSON.parse(strFromU8(output['filequest-manifest.json']!))).toEqual(result.manifest);
    expect(result.progress.filter((manifest) => manifest.progress.phase === 'processing').map((manifest) => manifest.progress.processed))
      .toEqual(Array.from({ length: 20 }, (_, index) => index + 1));
    expect(result.progress.at(-1)?.progress.phase).toBe('packaging');
  });

  it('handles nested, Unicode, case-colliding and identical duplicate paths without loss', async () => {
    const sources = [
      { path: 'a/photo.PNG', data: new Uint8Array([0, 1, 255]) },
      { path: 'b/photo.png', data: new Uint8Array([2, 128, 3]) },
      { path: 'deep/nested/旅行.txt', data: text('Unicode text: नमस्ते!') },
      { path: 'same.txt', data: text('one') }, { path: 'same.txt', data: text('two') },
      { path: 'a/café.txt', data: text('NFC') }, { path: 'b/cafe\u0301.txt', data: text('NFD') },
      { path: 'filequest-manifest.json', data: text('{"original":true}') },
    ];
    const result = await organize(fixtureZip(sources)), output = unzipSync(result.bytes);
    for (const record of result.manifest.entries) expect(output[record.outputPath!]).toEqual(sources[record.id]!.data);
    expect(new Set(result.manifest.entries.map((entry) => entry.outputPath!.toLowerCase())).size).toBe(sources.length);
    expect(output['Code/filequest-manifest.json']).toEqual(text('{"original":true}'));
  });

  it.each(['signed', 'unsigned'] as const)('supports %s streaming data descriptors', async (descriptor) => {
    const result = await organize(fixtureZip([{ path: 'notes.txt', method: 8, descriptor, data: text('Actual deflated contents!') }]));
    expect(unzipSync(result.bytes)['Documents/notes.txt']).toEqual(text('Actual deflated contents!'));
  });

  it('supports ordinary deflate ZIPs produced by fflate', async () => {
    const data = Uint8Array.from({ length: 65536 }, (_, index) => (index * 17 + (index >>> 4)) & 255);
    const input = zipSync({ 'nested/test.bin': data });
    const result = await organize(input);
    expect(unzipSync(result.bytes)['Other/test.bin']).toEqual(data);
  });

  it('preserves empty files and reports directory markers separately as skipped', async () => {
    const result = await organize(fixtureZip([
      { path: 'folder/', attrs: 0x41ed0010 }, { path: 'folder/empty.txt' }, { path: 'file.bin', data: new Uint8Array([0]) },
    ]));
    const output = unzipSync(result.bytes);
    expect(output['Documents/empty.txt']).toHaveLength(0);
    expect(result.manifest.progress).toMatchObject({ total: 3, processed: 2, skipped: 1, remaining: 0 });
    expect(result.manifest.entries[0]).toMatchObject({ outputPath: null, category: null, status: 'skipped' });
  });

  it.each([{ sources: [] }, { sources: [{ path: 'empty/' }] }])('exports a manifest for empty/directory-only ZIPs: $sources', async ({ sources }) => {
    const result = await organize(fixtureZip(sources));
    expect(Object.keys(unzipSync(result.bytes))).toEqual(['filequest-manifest.json']);
    expect(result.manifest.progress.processed).toBe(0);
    expect(result.manifest.progress.remaining).toBe(0);
  });

  it('produces repeatable output bytes for the same input', async () => {
    const input = createDemoZip();
    expect((await organize(input)).bytes).toEqual((await organize(input)).bytes);
  });

  it('exports the full 500-entry boundary across multiple batches without collisions', async () => {
    const session = new OrganizerSession(fixtureZip(Array.from({ length: 500 }, () => ({ path: 'note.txt', data: text('same bytes') }))), () => {}, noPause);
    for (let index = 0; index < 10; index++) await session.requestBatch(`batch-${index}`, 50);
    const output = unzipSync(new Uint8Array(session.takeOutput()));
    expect(Object.keys(output)).toHaveLength(501);
    expect(output['Documents/note (500).txt']).toEqual(text('same bytes'));
    expect(session.snapshot().progress).toMatchObject({ processed: 500, remaining: 0, failed: 0, phase: 'complete' });
  });

  it.each([0, 8])('preserves a large multi-chunk file with compression method %s', async (method) => {
    let seed = 123456789;
    const data = Uint8Array.from({ length: 1024 * 1024 + 19 }, () => {
      seed ^= seed << 13; seed ^= seed >>> 17; seed ^= seed << 5;
      return seed & 255;
    });
    const result = await organize(fixtureZip([{ path: 'big.bin', data, method }]));
    expect(sha256(unzipSync(result.bytes)['Other/big.bin']!)).toBe(sha256(data));
    expect(result.manifest.progress.processedBytes).toBe(data.length);
  });

  it('keeps generated duplicate filenames within the UTF-8 path budget', async () => {
    const name = `${'é'.repeat(118)}.txt`;
    const result = await organize(fixtureZip([{ path: `a/${name}` }, { path: `b/${name}` }]));
    expect(Object.keys(unzipSync(result.bytes))).toHaveLength(3);
    for (const entry of result.manifest.entries) expect(new TextEncoder().encode(entry.outputPath!.split('/')[1]).length).toBeLessThanOrEqual(240);
  });
});

describe('archive rejection before decompression', () => {
  it.each(['../secret.txt', 'a/../../secret.txt', '/absolute.txt', 'C:/drive.txt', 'a\\b.txt', 'a//b.txt', 'a/./b.txt', 'bad\0.txt', 'NUL.txt', 'a/bad?.txt'])('rejects %j', (path) => {
    expect(() => inspectZip(fixtureZip([{ path }]))).toThrow();
  });
  it.each([new Uint8Array(), text('not a ZIP'), fixtureZip([{ path: 'a.txt' }]).slice(0, -1)])('rejects empty, invalid or truncated bytes', (bytes) => {
    expect(() => inspectZip(bytes)).toThrow(ArchiveError);
  });
  it.each([
    { path: 'encrypted.txt', flags: 1 }, { path: 'strong.txt', flags: 64 },
    { path: 'unsupported.txt', method: 99 }, { path: 'link.txt', attrs: 0xa1ff0000 },
    { path: 'fifo.txt', attrs: 0x11ff0000 }, { path: 'device.txt', attrs: 0x21ff0000 },
    { path: 'dir.txt', attrs: 16 }, { path: 'volume.txt', attrs: 8 }, { path: 'reparse.txt', attrs: 0x400 },
    { path: 'dir/', data: text('hidden content') },
    { path: 'zip64.txt', extra: new Uint8Array([1, 0, 0, 0]) },
    { path: 'alternate.txt', extra: new Uint8Array([0x75, 0x70, 0, 0]) },
    { path: 'aes.txt', extra: new Uint8Array([1, 0x99, 0, 0]) },
    { path: 'badextra.txt', extra: new Uint8Array([2, 0, 9, 0]) },
    { path: 'legacy.txt', rawName: new Uint8Array([0x82, 0x2e, 0x74]), flags: 0 },
    { path: 'badutf8.txt', rawName: new Uint8Array([0xff, 0x2e, 0x74]) },
    { path: 'directory/', method: 8, compressed: new Uint8Array([1, 0]) },
  ])('rejects unsupported metadata: $path', (entry) => {
    expect(() => inspectZip(fixtureZip([entry]))).toThrow(ArchiveError);
  });

  it('rejects input larger than 25 MiB before parsing', () => {
    expect(() => inspectZip(new Uint8Array(ZIP_LIMITS.inputBytes + 1))).toThrow('input byte limit');
  });
  it('accepts exactly 500 files and rejects 501', () => {
    const entries = Array.from({ length: 500 }, (_, index) => ({ path: `${index}.txt` }));
    expect(inspectZip(fixtureZip(entries))).toHaveLength(500);
    expect(() => inspectZip(fixtureZip([...entries, { path: 'extra.txt' }]))).toThrow('500 file');
  });
  it('caps directory markers too', () => {
    expect(() => inspectZip(fixtureZip(Array.from({ length: 1001 }, (_, index) => ({ path: `${index}/` }))))).toThrow('total entry limit');
  });
  it('enforces per-entry and total extracted metadata budgets', () => {
    const compressed = new Uint8Array(210000);
    const allowed = { path: 'large.bin', method: 8, compressed, size: ZIP_LIMITS.entryBytes };
    expect(inspectZip(fixtureZip([allowed]))).toHaveLength(1);
    expect(() => inspectZip(fixtureZip([{ ...allowed, size: ZIP_LIMITS.entryBytes + 1 }]))).toThrow('20 MiB');
    expect(() => inspectZip(fixtureZip(Array.from({ length: 6 }, (_, index) => ({ ...allowed, path: `${index}.bin` }))))).toThrow('100 MiB');
  });
  it('enforces compression ratio, including the exact boundary', () => {
    const entry = { path: 'data.txt', method: 8, compressed: new Uint8Array(10), size: 1000 };
    expect(inspectZip(fixtureZip([entry]))).toHaveLength(1);
    expect(() => inspectZip(fixtureZip([{ ...entry, size: 1001 }]))).toThrow('100:1');
    expect(() => inspectZip(zipSync({ 'bomb.txt': new Uint8Array(1024 * 1024) }))).toThrow('100:1');
  });
  it('rejects local filename/header mismatches, overlap and split archives', () => {
    const input = fixtureZip([{ path: 'a.txt' }, { path: 'b.txt' }]);
    const nameMismatch = input.slice(); nameMismatch[30] = 98;
    expect(() => inspectZip(nameMismatch)).toThrow('filenames disagree');
    const headerMismatch = input.slice(); headerMismatch[6] = 1;
    expect(() => inspectZip(headerMismatch)).toThrow('headers disagree');
    const overlap = input.slice(); new DataView(overlap.buffer).setUint32(centralOffset(overlap) + 46 + 5 + 42, 0, true);
    expect(() => inspectZip(overlap)).toThrow();
    const split = input.slice(); split[split.length - 18] = 1;
    expect(() => inspectZip(split)).toThrow('Multi-disk');
    const trailing = new Uint8Array([...input, 0]);
    expect(() => inspectZip(trailing)).toThrow('trailing data');
  });
});

describe('streaming integrity, failure and cancellation', () => {
  it('implements standard CRC32', () => expect(crc32(text('123456789'))).toBe(0xcbf43926));

  it('stops a lying decompression bomb during reading, without publishing successful work', async () => {
    const input = fixtureZip([{ path: 'lying.txt', method: 8, data: new Uint8Array(4 * 1024 * 1024), size: 1 }]);
    const published: Manifest[] = [];
    const session = new OrganizerSession(input, (manifest) => published.push(manifest), noPause);
    await expect(session.requestBatch('one', 1)).rejects.toThrow('Decompression stopped');
    expect(published).toHaveLength(0);
    expect(session.snapshot().progress).toMatchObject({ phase: 'error', processed: 0, failed: 1 });
    expect(() => session.takeOutput()).toThrow('No complete');
  });

  it('detects corruption, retains truthful earlier successes and suppresses partial downloads', async () => {
    const input = fixtureZip([
      { path: 'a.txt', data: text('good') }, { path: 'b.txt', data: text('bad'), checksum: 123 }, { path: 'c.txt' },
    ]);
    const session = new OrganizerSession(input, () => {}, noPause);
    await expect(session.requestBatch('all', 5)).rejects.toThrow('integrity');
    expect(session.snapshot().progress).toMatchObject({ phase: 'error', total: 3, processed: 1, failed: 1, remaining: 1 });
    expect(() => session.takeOutput()).toThrow();
    await expect(session.requestBatch('retry', 5)).rejects.toThrow('failed');
  });

  it('rejects corrupt and missing deflate streams without marking files processed', async () => {
    for (const compressed of [new Uint8Array([255, 255]), new Uint8Array()]) {
      const session = new OrganizerSession(fixtureZip([{ path: 'corrupt.txt', method: 8, compressed, size: 1 }]), () => {}, noPause);
      await expect(session.requestBatch('one', 1)).rejects.toThrow();
      expect(session.snapshot().progress).toMatchObject({ processed: 0, failed: 1, phase: 'error' });
    }
  });

  it('replays a batch without processing or counting it twice', async () => {
    const session = new OrganizerSession(createDemoZip(), () => {}, noPause);
    expect(session.snapshot().progress.processed).toBe(0);
    const first = await session.requestBatch('pickup-1', 5);
    const replay = await session.requestBatch('pickup-1', 50);
    expect(replay).toEqual(first);
    expect(replay.manifest.progress).toMatchObject({ processed: 5, remaining: 15 });
    await session.requestBatch('pickup-2', 5);
    expect((await session.requestBatch('pickup-1', 5)).manifest.progress.processed).toBe(10);
  });

  it.each([0, -1, 51, 1.5, NaN])('rejects invalid batch size %s', async (size) => {
    const session = new OrganizerSession(createDemoZip(), () => {}, noPause);
    await expect(session.requestBatch('invalid', size)).rejects.toThrow('Invalid batch');
    expect(session.snapshot().progress.processed).toBe(0);
  });

  it('cancels at a real operation boundary and keeps totals consistent', async () => {
    const session: OrganizerSession = new OrganizerSession(createDemoZip(), (manifest) => {
      if (manifest.progress.processed === 1) session.cancel();
    }, noPause);
    await expect(session.requestBatch('cancel', 50)).rejects.toBeInstanceOf(CancelledError);
    const snapshot = session.snapshot();
    expect(snapshot.progress).toMatchObject({ phase: 'cancelled', processed: 1, failed: 0, remaining: 19 });
    expect(snapshot.entries.filter((entry) => entry.status === 'cancelled')).toHaveLength(19);
    expect(() => session.takeOutput()).toThrow();
    await expect(session.requestBatch('later', 1)).rejects.toBeInstanceOf(CancelledError);
  });

  it('cancels mid-stream before a large file is counted', async () => {
    let pauses = 0;
    const session: OrganizerSession = new OrganizerSession(fixtureZip([{ path: 'large.bin', data: new Uint8Array(2 * 1024 * 1024) }]), () => {}, async () => {
      if (++pauses === 2) session.cancel();
    });
    await expect(session.requestBatch('large', 1)).rejects.toBeInstanceOf(CancelledError);
    expect(session.snapshot().progress).toMatchObject({ processed: 0, remaining: 1, failed: 0 });
    expect(() => session.takeOutput()).toThrow();
  });
});
