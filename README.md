# FileQuest: Chaos Run

Turn a messy ZIP snapshot into an arcade quest and an organized downloadable copy.
Built for PromptWars × OUTLIER 2026.

## Current milestone

Milestone 4 introduces **Chaos Run**: an original neon three-lane endless runner.
Pilot a hovercraft, dodge crates and shifting hazards, collect energy, shield
your hull, activate magnets and repair damage. Speed and combo multipliers rise
as you survive. **Play instant demo** generates 120 synthetic files locally and
starts a genuine ZIP-organizing quest. Or choose your own ZIP in the inventory
panel and run with its files.

Energy pickups earn up to 8 files of sorting credit, survived 10-second waves up
to 16, and 400-metre milestones up to 24. Real work runs in the organizer worker
while the runner keeps playing. The scheduler keeps **one batch in flight and
at most 25 files of pending credit**, with exact-entry batch acknowledgments,
idempotent request IDs and stale-response protection. File counts never advance
from the animation, distance or run score: they wait for successful worker ACK.
Hundreds of files can be processed in a few dozen batches rather than hundreds
of individual actions. Credits coalesce at the 25-file cap under backpressure.

Use **← / →** or **A / D** to steer, **1–3** to select a lane, **P / Escape** to
pause/resume, or swipe horizontally on the arena. Native touch/keyboard buttons
also steer. Window blur, hidden tabs and keyboard focus leaving the game panel
pause the runner and new requests; already-earned in-flight work may finish.

**Calm mode** has no wall-clock motion or reaction deadline: select a lane, then
press **Advance** or Space/Enter from the arena. Reduced-motion preferences
default to calm; reduced effects disable camera motion, particles and cosmetic
animation. Health reaching zero opens game-over with restart/continue-in-calm
and explicit Finish controls. Restart resets run stats and keeps processed files,
pending work and unique event IDs. No archive is restarted or corrupted.

**Finish sorting without playing** explicitly drains remaining batches. Those
copies are counted separately from game-earned files and do not increase run
score. Cancel stops processing and discards the incomplete export. Victory appears
only after verified ZIP completion, with a prominent download and optional
endless bonus run. Bonus runs earn game points and never request more file work.

Files are classified by extension and copied into category folders. Source CRC32
and actual decompressed sizes are checked before counting a file as processed.
The final output is inspected and its stored payload CRCs are checked again
before download. Input bytes remain unchanged; no file contents or names are
sent to a server. The supplied static server has no upload API.

The original filename-only demo and custom path preview remain available in the
collapsible classifier lab. They never influence actual processing counters.
This is local development, not a deployed submission.

Final security review and verified local results are recorded in
[the audit report](docs/FINAL_AUDIT.md), including the DEFLATE resource-exhaustion
fix, remaining development-dependency advisory and required browser/release checks.

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
- `src/features/game/chaos/model.ts` owns the deterministic fixed-step runner;
  `RunnerCanvas.tsx` and `render.ts` draw original procedural art without assets.
  `ChaosRun.tsx` provides responsive HUD, controls, modes and inventory UI.
- `work-scheduler.ts` coalesces earned work with bounded backpressure.
  `earned-batch.ts` validates the matching job/request and exact processed entry
  IDs before releasing a receipt. The organizer hook suppresses per-file
  `PROGRESS` until the earned batch's `BATCH_RESULT`.
- The original File Rush modules, packet adapter and tests remain intact as
  reference coverage. There are no new dependencies. Posted `MessageChannel`
  tasks avoid per-file timer clamping while retaining cancellation/budget checks;
  ports close after each yield. Worker inputs are runtime-validated and its queue
  is capped at eight outstanding requests (gameplay normally uses only one).

Enforced ZIP limits: 25 MiB input, 500 files, 1,000 total entries including
directory markers, 100 MiB total extracted, 20 MiB per file and a 100:1
per-entry/aggregate compression ratio guard. Actual bytes are checked during
streaming, including against declared sizes; the whole archive is never expanded
upfront. Deflate input quanta are 1 KiB, bounding temporary decoder expansion
before each budget check. Processing yields between files and inside large files.
The decoder must reach exactly one DEFLATE end boundary; trailing compressed
payloads are rejected immediately. This guard depends on pinned `fflate` 0.8.3
decoder state and must be revalidated before changing that dependency.

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
not required for the in-browser demos. See [the test matrix](docs/TEST_MATRIX.md).

Automated tests cover exact-byte/SHA-256 round trips, manifest correctness,
duplicate names, Unicode, empty inputs, adversarial metadata, runtime extraction
budgets, cancellation and idempotent batch progress. Integration tests bundle the
actual worker entry and run it on a real Node worker thread, verifying buffer
transfer and the extractable output. This does not substitute for browser UI,
download, network-privacy or 390px interaction testing.

Chaos tests cover lanes, collision immunity, shifting hazards, shields/magnets/
repairs, scoring, particles, modes, pause, restart, bonus play and bounded earned
work. Integration tests organize 120- and 500-file ZIPs through actual runner
milestones and verify every exported byte and manifest. Additional tests check
cancellation, corrupt inputs, assisted completion and real worker-thread messaging.
See [the Chaos Run contract](docs/CHAOS_RUN.md) and the retained
[File Rush contract](docs/FILE_RUSH.md).

The supplied Dockerfile and [Cloud Run instructions](docs/DEPLOY_CLOUD_RUN.md)
are retained. No deployment has been performed and no live URL is claimed.
Cloud Run will host static assets; private file processing stays in the browser.

Deployment preparation now includes an explicit `.gcloudignore` source allowlist,
Docker-context secret exclusions and HTTP regression tests for port binding,
health/HEAD, SPA fallback, missing assets, MIME/cache/security headers and rejected
upload methods. The server fails startup without its production index. See the
Cloud Run playbook for exact PowerShell deployment commands and the release
verification checklist. Google Cloud project/region are not configured here;
Docker image execution and live browser verification remain outstanding.

Before an approved commit or push, run `python scripts/check_submission.py` and
verify public GitHub visibility, exactly one remote branch (`main`), and Git
history below 10 MB. Keep dependencies, build outputs, archives and secrets out
of Git. Deployments, pushes and scored assessments require separate approval;
never automatically submit to the judging portal.

Latest redesign, local browser verification, and deployment caveats: [final review](docs/FINAL_REVIEW.md). Vercel static hosting is configured in `vercel.json`; Cloud Run remains the required hackathon hosting target.
