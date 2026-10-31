# Product brief — FileQuest

## One-line pitch
**FileQuest turns that chaotic downloads folder into a quick arcade challenge: play, sort real files, download a clean folder.**

## User story
'I have a messy folder with documents, images, screenshots, code, ZIPs and receipts. I upload a ZIP snapshot, play a 45-second arcade dodge-and-collect game while the app actually organizes the files in a Web Worker, and download an organized ZIP plus a manifest showing what happened.'

## Must-have experience
1. Clear landing page with truthful value proposition and privacy statement ('Files are processed on your device; the server only hosts the app').
2. One-click synthetic demo ZIP creation (or generate offline with supplied script). User can upload `.zip` via dropzone or file picker.
3. Preflight scan shows total supported files, sizes, proposed categories, and rejects unsafe/oversized archives with explicit reason.
4. Press Play: a simple responsive keyboard/touch game; pickups request more sorting work. The worker alone publishes real processed/failed counts.
5. Finish state: category breakdown, original -> output filename preview, downloadable ZIP and `filequest-manifest.json` included inside it. Verify output integrity.
6. Visible 'Finish sorting' and cancel paths. No user original is modified or deleted.
7. A 2-minute demo script and clearly displayed live Cloud Run URL.

## MVP classification (not AI)
Images: png, jpg, jpeg, gif, webp, svg; Documents: pdf, doc, docx, txt, md, rtf; Spreadsheets: csv, xls, xlsx; Code: js, ts, py, java, c, cpp, html, css, json; Archives: zip, tar, gz; Audio: mp3, wav, ogg; Video: mp4, mov, webm; otherwise Other. Filename patterns can refine (e.g. invoice, resume), but never pretend to understand file contents.

## UX concept
Visual theme: neon arcade vs messy desktop. Left: game arena and controls. Right: sorting progress, live classified files, badges for categories, export. Accessible high contrast, readable type, no external image dependencies; original CSS / Canvas art.

## Concrete limits (adjust only with tests)
Input ZIP <= 25 MiB, <= 500 file entries, <= 100 MiB total extracted, <= 20 MiB per entry, compressed-ratio guard e.g. > 100:1 triggers review/rejection. Memory use depends on ZIP library; streaming + explicit abort required. Document any narrower safe limits found in testing.

## Honest boundaries
- ZIP upload/download is **not direct editing of the original computer folder**. The chore is genuinely performed on a downloadable copy.
- No real email access, expense accounts, cloud drives, OCR, semantic AI classification, continuous filesystem changes or magic background access.
- No external API, account signup, billing or Gemini required for the working MVP.

## Stretch features only after deployed MVP
1. Duplicate detection with SHA-256 and optional review before removal from output (default preserve all entries).
2. User-editable sorting rules and undo history/manifest.
3. Optional, explicit user-consented AI categorization using Google Gemini on **metadata only**, with secrets in Cloud Run, rate limit/cost guard and deterministic fallback; never expose keys in the frontend.
