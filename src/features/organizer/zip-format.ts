import { MAX_FILE_ENTRIES, validateFilePath } from './classify';

const MiB = 1024 * 1024;
export const ZIP_LIMITS = Object.freeze({
  inputBytes: 25 * MiB,
  fileEntries: MAX_FILE_ENTRIES,
  allEntries: 1000,
  entryBytes: 20 * MiB,
  totalBytes: 100 * MiB,
  ratio: 100,
});
export const MAX_OUTPUT_BYTES = 108 * MiB;
export interface ZipLimits {
  inputBytes: number;
  fileEntries: number;
  allEntries: number;
  entryBytes: number;
  totalBytes: number;
  ratio: number;
}

export class ArchiveError extends Error {
  constructor(message: string) { super(message); this.name = 'ArchiveError'; }
}

export interface ZipEntry {
  id: number;
  originalPath: string;
  directory: boolean;
  method: number;
  compressedSize: number;
  size: number;
  crc: number;
  dataOffset: number;
}

const crcTable = Uint32Array.from({ length: 256 }, (_, index) => {
  let value = index;
  for (let bit = 0; bit < 8; bit++) value = (value >>> 1) ^ ((value & 1) ? 0xedb88320 : 0);
  return value >>> 0;
});

export function updateCrc(crc: number, bytes: Uint8Array): number {
  for (const byte of bytes) crc = (crc >>> 8) ^ crcTable[(crc ^ byte) & 255]!;
  return crc >>> 0;
}
export const crc32 = (bytes: Uint8Array) => (updateCrc(0xffffffff, bytes) ^ 0xffffffff) >>> 0;

/** Classic single-disk ZIP subset. Never decompresses or trusts declared sizes for allocation. */
export function inspectZip(bytes: Uint8Array, limits: ZipLimits = ZIP_LIMITS): ZipEntry[] {
  const fail = (message: string): never => { throw new ArchiveError(message); };
  if (bytes.length > limits.inputBytes) fail('ZIP exceeds the input byte limit (25 MiB for uploads).');
  if (bytes.length < 22) fail('Invalid ZIP: end-of-directory record is missing.');
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  const need = (offset: number, length: number) => {
    if (offset < 0 || length < 0 || offset + length > bytes.length) fail('Invalid ZIP: truncated record.');
  };
  const u16 = (offset: number) => { need(offset, 2); return view.getUint16(offset, true); };
  const u32 = (offset: number) => { need(offset, 4); return view.getUint32(offset, true); };
  let end = -1;
  for (let offset = bytes.length - 22; offset >= Math.max(0, bytes.length - 65557); offset--) {
    if (u32(offset) === 0x06054b50 && offset + 22 + u16(offset + 20) === bytes.length) {
      end = offset; break;
    }
  }
  if (end < 0) fail('Invalid ZIP: missing end record or unexpected trailing data.');
  if (u16(end + 4) || u16(end + 6) || u16(end + 8) !== u16(end + 10)) {
    fail('Multi-disk ZIP archives are unsupported.');
  }
  const count = u16(end + 10);
  const centralSize = u32(end + 12);
  const centralOffset = u32(end + 16);
  if (count === 65535 || centralSize === 0xffffffff || centralOffset === 0xffffffff) fail('ZIP64 archives are unsupported.');
  if (count > limits.allEntries) fail('ZIP exceeds the total entry limit (including directories).');
  if (centralOffset + centralSize !== end) fail('Invalid ZIP: inconsistent central directory.');

  const checkExtra = (start: number, length: number) => {
    const stop = start + length;
    need(start, length);
    for (let cursor = start; cursor < stop;) {
      if (cursor + 4 > stop) fail('Invalid ZIP extra field.');
      const tag = u16(cursor), size = u16(cursor + 2);
      cursor += 4;
      if (cursor + size > stop) fail('Invalid ZIP extra field length.');
      if ([1, 0x9901, 0x0017, 0x7075].includes(tag)) {
        fail('ZIP64, encryption and alternate Unicode path extra fields are unsupported.');
      }
      cursor += size;
    }
  };
  const decodeName = (raw: Uint8Array, flags: number): string => {
    if (!(flags & 0x800) && raw.some((byte) => byte > 127)) fail('Legacy non-UTF-8 filenames are unsupported. Use a UTF-8 ZIP.');
    try { return new TextDecoder('utf-8', { fatal: true, ignoreBOM: true }).decode(raw); }
    catch { return fail('Invalid UTF-8 filename.'); }
  };
  const entries: ZipEntry[] = [];
  const spans: { start: number; end: number }[] = [];
  let cursor = centralOffset, total = 0, files = 0, compressedTotal = 0;
  for (let id = 0; id < count; id++) {
    need(cursor, 46);
    if (u32(cursor) !== 0x02014b50) fail('Invalid ZIP central directory entry.');
    const flags = u16(cursor + 8), method = u16(cursor + 10);
    const crc = u32(cursor + 16), compressedSize = u32(cursor + 20), size = u32(cursor + 24);
    const nameLength = u16(cursor + 28), extraLength = u16(cursor + 30), commentLength = u16(cursor + 32);
    const localOffset = u32(cursor + 42), attrs = u32(cursor + 38);
    const next = cursor + 46 + nameLength + extraLength + commentLength;
    if (next > end) fail('Invalid ZIP: central entry extends past directory.');
    if (u16(cursor + 6) > 20 || u16(cursor + 34)) fail('Unsupported ZIP version or split entry.');
    if ((flags & ~0x080e) !== 0) fail('Encrypted ZIPs and unsupported ZIP flags are rejected.');
    if (![0, 8].includes(method) || (method === 0 && (flags & 6))) fail('Unsupported ZIP compression. Use stored or deflate ZIP.');
    if ([compressedSize, size, localOffset].includes(0xffffffff)) fail('ZIP64 entries are unsupported.');
    const rawName = bytes.subarray(cursor + 46, cursor + 46 + nameLength);
    const originalPath = decodeName(rawName, flags);
    const directory = originalPath.endsWith('/');
    validateFilePath(directory ? originalPath.slice(0, -1) : originalPath);
    const kind = (attrs >>> 16) & 0xf000;
    if ((kind !== 0 && kind !== 0x8000 && kind !== 0x4000) || (attrs & (8 | 0x400))) fail('Symlinks and special filesystem entries are unsupported.');
    if ((kind === 0x4000 || (attrs & 16)) && !directory) fail('Invalid ZIP: directory attributes conflict with filename.');
    if (directory && (size !== 0 || kind === 0x8000)) fail('Invalid ZIP directory entry.');
    if (size > limits.entryBytes) fail('ZIP entry exceeds the 20 MiB file limit.');
    if (size > Math.max(compressedSize, 1) * limits.ratio) fail('Suspicious ZIP compression ratio exceeds 100:1.');
    if (method === 0 && compressedSize !== size) fail('Invalid stored ZIP entry size.');
    total += size; compressedTotal += compressedSize;
    if (total > limits.totalBytes) fail('ZIP exceeds the 100 MiB extracted byte limit.');
    if (!directory && ++files > limits.fileEntries) fail('ZIP exceeds the 500 file entry limit.');
    checkExtra(cursor + 46 + nameLength, extraLength);

    need(localOffset, 30);
    if (u32(localOffset) !== 0x04034b50 || u16(localOffset + 4) !== u16(cursor + 6)
      || u16(localOffset + 6) !== flags || u16(localOffset + 8) !== method) fail('Invalid ZIP: local and central headers disagree.');
    const localNameLength = u16(localOffset + 26), localExtraLength = u16(localOffset + 28);
    const dataOffset = localOffset + 30 + localNameLength + localExtraLength;
    need(localOffset + 30, localNameLength + localExtraLength);
    if (localNameLength !== rawName.length || rawName.some((byte, index) => byte !== bytes[localOffset + 30 + index])) {
      fail('Invalid ZIP: local and central filenames disagree.');
    }
    checkExtra(localOffset + 30 + localNameLength, localExtraLength);
    let dataEnd = dataOffset + compressedSize;
    if (dataEnd > centralOffset) fail('Invalid ZIP: file data overlaps the central directory.');
    if (directory && (crc !== 0 || (method === 8 && (compressedSize !== 2
      || bytes[dataOffset] !== 3 || bytes[dataOffset + 1] !== 0)))) {
      fail('Unsupported directory payload. Directory markers must be empty.');
    }
    const localValues = [u32(localOffset + 14), u32(localOffset + 18), u32(localOffset + 22)];
    const expected = [crc, compressedSize, size];
    if (flags & 8) {
      if (localValues.some((value, index) => value !== 0 && value !== expected[index])) fail('Invalid ZIP data descriptor header.');
      // An unsigned descriptor's CRC can equal the optional signature value.
      if (u32(dataEnd) === 0x08074b50 && dataEnd + 16 <= centralOffset
        && u32(dataEnd + 4) === crc && u32(dataEnd + 8) === compressedSize && u32(dataEnd + 12) === size) dataEnd += 4;
      if (u32(dataEnd) !== crc || u32(dataEnd + 4) !== compressedSize || u32(dataEnd + 8) !== size) fail('Invalid ZIP data descriptor.');
      dataEnd += 12;
    } else if (localValues.some((value, index) => value !== expected[index])) fail('Invalid ZIP: local sizes or CRC disagree.');
    if (dataEnd > centralOffset) fail('Invalid ZIP entry bounds.');
    spans.push({ start: localOffset, end: dataEnd });
    entries.push({ id, originalPath, directory, method, compressedSize, size, crc, dataOffset });
    cursor = next;
  }
  if (cursor !== end || total > Math.max(compressedTotal, 1) * limits.ratio) fail('Invalid ZIP directory size or excessive total compression ratio.');
  spans.sort((a, b) => a.start - b.start);
  let previousEnd = 0;
  for (const span of spans) {
    if (span.start !== previousEnd) fail('ZIP contains overlapping entries, gaps or an unsupported preamble.');
    previousEnd = span.end;
  }
  if (previousEnd !== centralOffset) fail('Invalid ZIP local entry coverage.');
  return entries;
}
