#!/usr/bin/env python3
"""Generate an entirely synthetic small messy ZIP; not personal data or a sample of real documents."""
from pathlib import Path
from zipfile import ZipFile, ZIP_DEFLATED
import base64

root = Path(__file__).resolve().parent.parent
out = root / 'filequest-demo.zip'
# A valid one-pixel PNG (different paths intentionally use same content to test duplicates).
png = base64.b64decode('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+/r3sAAAAASUVORK5CYII=')
items = {
  'random/IMG_0001.png': png,
  'downloads/IMG_0001.png': png,
  'desktop/holiday-photo.png': png,
  'desktop/notes from class.txt': b'Data structures: trees, stacks, queues.\n',
  'new folder/invoice_oct.csv': b'date,item,amount\n2026-10-21,stationery,45\n',
  'new folder/budget.csv': b'category,planned\nfood,2000\ntravel,1500\n',
  'old stuff/hello.py': b"print('Hello FileQuest')\n",
  'old stuff/game.js': b'const score = 10;\n',
  'other/final report.md': b'# Synthetic Project Report\nThis is demo content.\n',
  'other/todo.txt': b'Organize my downloads.\n',
  'other/todo copy.txt': b'Organize my downloads.\n',
  'assets/logo.svg': b'<svg xmlns="http://www.w3.org/2000/svg" width="48" height="48"><circle cx="24" cy="24" r="20" fill="#8b5cf6"/></svg>',
  'documents/ideas.json': b'{"topic":"arcade productivity","demo":true}\n',
  'misc/filename.unknown': b'Unrecognized extension safely goes to Other.\n',
  'mystery/readme': b'No file extension.\n',
  'double nested/a/b/attendance.csv': b'id,present\n001,true\n',
}
for i in range(1,9):
    items[f'untitled folder {i}/note_{i:02}.txt'] = f'Synthetic note {i}: cleanup demo.\n'.encode()
with ZipFile(out, 'w', compression=ZIP_DEFLATED) as zf:
    for name, content in sorted(items.items()): zf.writestr(name, content)
print(f'Created: {out} ({out.stat().st_size:,} bytes, {len(items)} synthetic files).')
print('This ZIP is ignored by .gitignore. Upload it to FileQuest to verify a genuine output archive.')
