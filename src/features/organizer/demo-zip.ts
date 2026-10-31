import { strToU8, zipSync } from 'fflate';

/** Twenty synthetic, valid text/code/CSV/JSON/SVG files; never personal data. */
export function createDemoZip(): Uint8Array<ArrayBuffer> {
  const entries: Record<string, Uint8Array> = {
    'desktop/notes.txt': strToU8('Synthetic FileQuest note.\n'),
    'downloads/notes.txt': strToU8('A different note with the same basename.\n'),
    'new folder/invoice.csv': strToU8('item,amount\nstationery,45\n'),
    'old stuff/app.js': strToU8('console.log("Synthetic demo");\n'),
    'images/logo.svg': strToU8('<svg xmlns="http://www.w3.org/2000/svg" width="1" height="1"><path d="M0 0h1v1H0z"/></svg>'),
    'misc/mystery.bin': new Uint8Array([0, 255, 1, 128, 2]),
    'documents/旅行.txt': strToU8('Synthetic Unicode filename.\n'),
    'documents/empty.txt': new Uint8Array(),
    'config/settings.json': strToU8('{"synthetic":true}\n'),
    'nested/a/b/readme.md': strToU8('# Synthetic demo\nAll content is generated locally.\n'),
  };
  for (let index = 1; index <= 10; index++) entries[`folder ${index}/note-${index}.txt`] = strToU8(`Synthetic note ${index}.\n`);
  return zipSync(entries, { level: 0, mtime: new Date(2020, 0, 1) });
}
