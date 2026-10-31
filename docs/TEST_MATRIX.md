# Test matrix — must verify real files, not only visuals

| Area | Test | Expected result |
|---|---|---|
| Core | 20-file synthetic ZIP upload | all supported entries inspected; correct counts |
| Core | Export ZIP and unzip again | original file bytes identical, transformed safe internal paths |
| Core | `invoice.csv`, `photo.png`, `app.js`, unknown `.foo` | deterministic expected categories |
| Core | duplicate names after grouping | no silent data loss; stable suffixes |
| Security | `../../secret.txt`, absolute path, drive path, backslashes, NUL | reject/normalize safely, never unsafe output paths |
| Security | corrupt ZIP, encrypted, unsupported compression | friendly error; nothing falsely marked complete |
| Security | >500 entries, oversized entry, high compression ratio, too-large extracted total | stop early and show reason without crash |
| Progress | pickup triggers batch; test worker is slower than animation | processed count updates **only on worker ACK** |
| Progress | rapidly spam pickup + cancel | no duplicate packaging; counts consistent |
| UX | small mobile 390px, landscape, desktop | readable and usable |
| Accessibility | keyboard only, touch, reduced motion, focus | core task achievable without game twitch input |
| Privacy | browser network inspector during ZIP handling | no file bytes sent to server or external endpoint |
| Deploy | Cloud Run public URL `/`, `/healthz`, game assets | successful HTTP; gameplay and ZIP round trip work |
| Repo | one remote branch, public GitHub, size <10MB | verified; no secrets, node_modules or build output committed |

Notes: Some ZIP files may contain unsupported metadata or dangerous entries. Show safe failures rather than silently dropping data. Automated axe scans supplement, not replace manual keyboard tests.

## Milestone 2 coverage

- `tests/organizer/classify.test.ts`: extension rules, strict paths and collisions.
- `tests/organizer/zip.test.ts`: real 20-file synthetic ZIP round trip with
  byte/SHA-256 checks; manifest, Unicode, identical duplicate source entries,
  directory markers, empty archives, descriptors, metadata and runtime budgets,
  corruption, cancellation and idempotent batches.
- `tests/organizer/worker.test.ts`: serialized protocol, stale jobs, batch replay,
  truthful progress, errors, cancellation and exactly one completed output.
- `tests/organizer/thread.test.ts`: actual bundled worker on a real Node thread,
  transferred/detached buffers, extractable verified output and active cancellation.

Not yet browser-verified: file picker/dropzone, downloaded Blob, keyboard/touch,
390px layout, reduced motion and absence of file-data network requests. Gameplay,
public Cloud Run and final GitHub checks are not part of Milestone 2 verification.
