import { deflateSync, strToU8 } from 'fflate';
import { crc32 } from '../../src/features/organizer/zip-format';

export interface FixtureEntry {
  path: string;
  data?: Uint8Array;
  method?: number;
  flags?: number;
  attrs?: number;
  size?: number;
  checksum?: number;
  compressed?: Uint8Array;
  rawName?: Uint8Array;
  extra?: Uint8Array;
  descriptor?: 'signed' | 'unsigned';
}

/** Explicit fixture writer retains identical duplicate entry names (object ZIP APIs cannot). */
export function fixtureZip(entries: FixtureEntry[]): Uint8Array<ArrayBuffer> {
  const locals: Uint8Array[] = [], centrals: Uint8Array[] = [];
  let localOffset = 0;
  for (const entry of entries) {
    const name = entry.rawName ?? strToU8(entry.path), extra = entry.extra ?? new Uint8Array();
    const data = entry.data ?? new Uint8Array(), method = entry.method ?? 0;
    const compressed = entry.compressed ?? (method === 8 ? deflateSync(data) : data);
    const checksum = entry.checksum ?? crc32(data), size = entry.size ?? data.length;
    const flags = (entry.flags ?? 0x800) | (entry.descriptor ? 8 : 0);
    const local = new Uint8Array(30 + name.length + extra.length + compressed.length + (entry.descriptor ? entry.descriptor === 'signed' ? 16 : 12 : 0));
    const lv = new DataView(local.buffer);
    lv.setUint32(0, 0x04034b50, true); lv.setUint16(4, 20, true);
    lv.setUint16(6, flags, true); lv.setUint16(8, method, true);
    if (!entry.descriptor) {
      lv.setUint32(14, checksum, true); lv.setUint32(18, compressed.length, true); lv.setUint32(22, size, true);
    }
    lv.setUint16(26, name.length, true); lv.setUint16(28, extra.length, true);
    local.set(name, 30); local.set(extra, 30 + name.length); local.set(compressed, 30 + name.length + extra.length);
    if (entry.descriptor) {
      let cursor = 30 + name.length + extra.length + compressed.length;
      if (entry.descriptor === 'signed') { lv.setUint32(cursor, 0x08074b50, true); cursor += 4; }
      lv.setUint32(cursor, checksum, true); lv.setUint32(cursor + 4, compressed.length, true); lv.setUint32(cursor + 8, size, true);
    }
    const central = new Uint8Array(46 + name.length + extra.length), cv = new DataView(central.buffer);
    cv.setUint32(0, 0x02014b50, true); cv.setUint16(4, 0x314, true); cv.setUint16(6, 20, true);
    cv.setUint16(8, flags, true); cv.setUint16(10, method, true);
    cv.setUint32(16, checksum, true); cv.setUint32(20, compressed.length, true); cv.setUint32(24, size, true);
    cv.setUint16(28, name.length, true); cv.setUint16(30, extra.length, true);
    cv.setUint32(38, entry.attrs ?? 0, true); cv.setUint32(42, localOffset, true);
    central.set(name, 46); central.set(extra, 46 + name.length);
    locals.push(local); centrals.push(central); localOffset += local.length;
  }
  const centralSize = centrals.reduce((sum, entry) => sum + entry.length, 0);
  const out = new Uint8Array(localOffset + centralSize + 22);
  let cursor = 0;
  for (const part of [...locals, ...centrals]) { out.set(part, cursor); cursor += part.length; }
  const end = new DataView(out.buffer);
  end.setUint32(cursor, 0x06054b50, true);
  end.setUint16(cursor + 8, entries.length, true); end.setUint16(cursor + 10, entries.length, true);
  end.setUint32(cursor + 12, centralSize, true); end.setUint32(cursor + 16, localOffset, true);
  return out;
}

export const centralOffset = (bytes: Uint8Array) => new DataView(bytes.buffer, bytes.byteOffset).getUint32(bytes.length - 6, true);
export const text = (value: string) => strToU8(value);
