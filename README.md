# FileQuest

Turn a messy ZIP snapshot into an arcade quest and an organized downloadable copy.
Built for PromptWars × OUTLIER 2026.

## Current milestone

Milestone 3 introduces **File Rush**: steer real file packets to category gates,
build combos, and download the organized ZIP. **Play synthetic demo** generates
20 files locally and starts the game; no external upload is required. Or choose
your own ZIP in the inventory panel and press **Play**.

Every correct route requests exactly **one** file operation. The game waits for
the matching worker `BATCH_RESULT` before awarding points, advancing the packet or
updating its processed counters. Wrong routes and timeouts consume a life without
requesting file work. Slow worker operations freeze the challenge clock.

Use **← / →** or **A / D** to steer, **Space / Enter** to route from the focused
arena, **1–4** to select a gate, and **P / Escape** to pause/resume. Category gates
and the large steering/route buttons support touch and native keyboard clicks.
Focus the arena for its shortcuts. The clock pauses when the window is hidden,
loses focus, or keyboard focus leaves the game panel.

**Calm mode** removes time limits and speed bonuses. Reduced-motion preferences
default to calm and suppress packet movement. Losing all three lives never drops
a file: continue with new lives, switch to calm, or use **Finish sorting without
playing**. That explicit alternative drains the remaining worker batches without
adding game points. Cancel stops processing and discards export.

Files are classified by extension and copied into category folders. Source CRC32
and actual decompressed sizes are checked before counting a file as processed.
The final output is inspected and its stored payload CRCs are checked again
before download. Input bytes remain unchanged; no file contents or names are
sent to a server. The supplied static server has no upload API.

The original filename-only demo and custom path preview remain available in the
collapsible classifier lab. They never influence actual processing counters.
This is local development, not a deployed submission.

## Local development

Requires Node.js 22.13+ and npm. The lockfile pins resolved dependencies.

```sh
npm ci
npm run dev
```

Open the local URL printed by Vite (normally `http://127.0.0.1:5173`).

```sh
npm run lint
npm run typecheck
npm test
npm run build
npm start
```

`npm start` serves the production `dist/` using the supplied `server.mjs` on
`0.0.0.0:$PORT` (default 8080), with `/healthz` for health checks.
`npm run test:watch` runs the classifier tests interactively.

## Architecture and rules

- React renders the workspace; plain CSS supplies the arcade visual style.
- `src/features/organizer/classify.ts` provides pure, typed classification and
  output planning. Extensions follow `docs/PRODUCT_BRIEF.md`, case-insensitively.
  Unrecognized and extensionless files go to `Other/`; no content or AI inference.
- Paths must be relative, use forward slashes and contain no traversal, empty
  segments, control characters, Windows device names or forbidden filename
  characters. Unicode is normalized to NFC. Directory entries are not accepted
  as files. Limits: 1,024 path characters, 240 UTF-8 bytes per source segment,
  and 500 file names per plan.
- Plans are sorted by original path with locale-independent ordering. Output
  collisions, including case and Unicode variants, get ` (2)`, ` (3)`, etc.
  Originals are retained in the plan. Nothing is read, moved or deleted.
- `zip-format.ts` inspects central/local headers, flags, entry bounds and paths
  before decompression. `session.ts` streams bounded `fflate` inflation and ZIP
  packaging in `organizer.worker.ts`. Only successful copies update progress.
- Worker requests: `INIT`, idempotent `REQUEST_BATCH` (1–50 files), and `CANCEL`.
  Responses: `READY`, per-file `PROGRESS`, `BATCH_RESULT`, `COMPLETE`, `CANCEL`,
  `ERROR`. Job IDs prevent stale responses; queued requests serialize mutations.
  Buffers are transferred across the worker boundary. Progress sends a changed
  record rather than cloning the entire manifest after every file.
- The completed ZIP includes `filequest-manifest.json` mapping original paths to
  output paths, categories, statuses, byte sizes and CRC32. Empty directory
  markers are explicitly skipped; empty files are preserved. Empty ZIPs produce
  a manifest-only output. Failure/cancellation never exposes a partial ZIP.
- `src/features/game/engine.ts` owns testable game state, challenge time, gates,
  lives, combos and receipt-based scoring. `FileRush.tsx` renders the DOM arena.
- `packet-request.ts` links a single game action to its exact worker ACK, rejects
  stale/parallel packets and shares a repeated in-flight request. The organizer
  hook suppresses per-file progress until that ACK for game actions; only the
  explicit finish alternative automatically drains file batches. No ZIP core
  rewrite or new dependency was needed for gameplay.

Enforced ZIP limits: 25 MiB input, 500 files, 1,000 total entries including
directory markers, 100 MiB total extracted, 20 MiB per file and a 100:1
per-entry/aggregate compression ratio guard. Actual bytes are checked during
streaming, including against declared sizes; the whole archive is never expanded
upfront. Deflate input quanta are 1 KiB, bounding temporary decoder expansion
before each budget check. Processing yields between files and inside large files.

Supported: classic single-disk stored/deflate ZIPs, ASCII/UTF-8 names, signed or
unsigned data descriptors. Rejected: encryption, ZIP64, split/self-extracting
archives, symlinks/special/reparse entries, overlapping or conflicting headers,
alternate Unicode path extra fields and legacy non-ASCII filename encodings.
Nested archives are preserved as files, not recursively extracted.

Output uses **stored entries**, so downloads may be larger than uploads. It is
bounded to 108 MiB (including up to 4 MiB of manifest). Buffers remain in memory
until the verified output is ready; peak memory can exceed 200 MiB at the maximum
input/extraction limits. Low-memory mobile device behavior is not yet verified.
Original timestamps, permissions and archive metadata are not preserved; file
contents are. See [the pipeline contract](docs/ZIP_PIPELINE.md).

## Demo, deployment and event checks

With a working Python installation, `python scripts/generate_demo_zip.py` creates
an ignored ZIP containing 24 synthetic files that can now be uploaded. Python is
not required for the in-browser 20-file demo. See [the test matrix](docs/TEST_MATRIX.md).

Automated tests cover exact-byte/SHA-256 round trips, manifest correctness,
duplicate names, Unicode, empty inputs, adversarial metadata, runtime extraction
budgets, cancellation and idempotent batch progress. Integration tests bundle the
actual worker entry and run it on a real Node worker thread, verifying buffer
transfer and the extractable output. This does not substitute for browser UI,
download, network-privacy or 390px interaction testing.

Game tests cover correct/wrong routes, combo receipts, slow worker behavior,
pause, calm mode, lost lives, stale/duplicate ACKs, cancellation and explicit
finish. A full File Rush demo also runs through the bundled worker on a real
thread, followed by exact-byte ZIP verification. See [File Rush's contract](docs/FILE_RUSH.md).

The supplied Dockerfile and [Cloud Run instructions](docs/DEPLOY_CLOUD_RUN.md)
are retained. No deployment has been performed and no live URL is claimed.
Cloud Run will host static assets; private file processing stays in the browser.

Before an approved commit or push, run `python scripts/check_submission.py` and
verify public GitHub visibility, exactly one remote branch (`main`), and Git
history below 10 MB. Keep dependencies, build outputs, archives and secrets out
of Git. Deployments, pushes and scored assessments require separate approval;
never automatically submit to the judging portal.
