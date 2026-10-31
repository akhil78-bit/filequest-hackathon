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

## Milestone 3 coverage

- `tests/game/engine.test.ts`: category gates, steering, lives/timeouts, ACK-only
  score, repeat-input protection, slow workers, pause/resume, calm mode, combos,
  lost-game retry, replacement, cancellation and late/wrong receipts.
- `tests/game/integration.test.ts`: game actions cause actual one-file worker
  operations; wrong/duplicate/stale actions do not process files; completed demo
  bytes and manifest are correct; corruption/cancel block points/export; explicit
  finish preserves ZIP correctness without fabricated score.
- `tests/organizer/thread.test.ts`: full game over actual worker-thread messaging
  and one-file ACKs, followed by exact-byte extraction verification.

Browser connector unavailable; native Edge control not approved. Browser gameplay,
390px/touch, keyboard focus, reduced-motion appearance and Blob download remain
unverified. No Cloud Run deployment or final GitHub visibility check was performed.

## Milestone 4 — Chaos Run

- `tests/game/chaos-model.test.ts`: lane motion, collision immunity, power-ups,
  changing hazards, bounded entities/particles, speed/scoring, pause/resume, calm,
  restart with unique event IDs, terminal states and bonus play without file work.
- `tests/game/chaos-work.test.ts`: bounded one-active/25-pending-credit scheduler,
  exact worker receipts, duplicate/stale protection, pause, cancel, reset, assisted
  finish attribution, completion and failure handling.
- `tests/game/chaos-integration.test.ts`: runner-driven 120-/500-file ZIP round
  trips, content/manifest integrity, no start-only processing, restart in flight,
  cancellation, corrupt file failure and explicit finish without earned inflation.
- `tests/organizer/thread.test.ts`: Chaos runner/scheduler/adapter over actual
  bundled worker messages, then byte-exact ZIP extraction verification.

Existing organizer, File Rush and deployment server regressions remain in the
suite. Manual Canvas/mobile/keyboard/swipe/reduced-motion/Blob download and live
Cloud Run verification remain outstanding; see `docs/CHAOS_RUN.md`.

## Final security audit

- Padded DEFLATE is rejected on the first decoder quantum, with no successful
  file count or export; the actual bundled worker also rejects it.
- Independent Node zlib streams at levels 0/1/6/9 and lengths spanning 1 KiB,
  64 KiB and 1 MiB boundaries preserve exact bytes and valid manifests.
- Malformed/unknown worker inputs and oversized buffers fail before work;
  request flooding is bounded and cancellation bypasses the queue.
- Completion/cancellation races acknowledge cancellation with truthful counts.
- Server CSP rejects form submissions/base overrides; SSR checks hostile
  archive/manifest/error text stays escaped and cannot create executable HTML.
- Final full suite: 265 passing tests in 11 files. Production HTTP smoke also
  ran the fetched minified worker, preserving 121 files in five batches and
  rejecting a padded archive. See `FINAL_AUDIT.md` for scope and limitations.
