import { strToU8, zipSync } from 'fflate';

/** Small original synthetic files; duplicate basenames and Unicode exercise real organization. */
export function createChaosDemo(count = 120): Uint8Array<ArrayBuffer> {
  if (!Number.isInteger(count) || count < 0 || count > 500) throw new Error('Demo supports 0–500 synthetic files.');
  const types = ['txt', 'js', 'csv', 'svg', 'json', 'bin'] as const;
  const files: Record<string, Uint8Array> = {};
  for (let index = 0; index < count; index++) {
    const extension = types[index % types.length]!;
    const name = index % 17 === 0 ? `旅行-${index}` : `file-${index % 12}`;
    const content = extension === 'svg' ? '<svg xmlns="http://www.w3.org/2000/svg" width="1" height="1"><path d="M0 0h1v1H0z"/></svg>'
      : extension === 'json' ? JSON.stringify({ demo: true, index })
        : extension === 'csv' ? `id,note\n${index},synthetic\n`
          : extension === 'js' ? `export const syntheticFile = ${index};\n`
            : `FileQuest synthetic file ${index}. No personal data.\n`;
    files[`chaos/folder-${Math.floor(index / 12)}/${name}.${extension}`] = extension === 'bin'
      ? new Uint8Array([0, 255, index & 255, 128, 1]) : strToU8(content);
  }
  return zipSync(files, { level: 0, mtime: new Date(2020, 0, 1) });
}
