# Chaos Run — playable MVP contract

The primary experience is now an original Canvas three-lane runner. File Rush's
modules/tests remain intact; the organizer, deployment filtering and hardened
production server are preserved.

## Playing

- Rush: arrows/A/D steer, 1–3 chooses a lane, P/Escape pauses/resumes. Touch
  buttons and horizontal arena swipes steer. The hovercraft moves smoothly.
- Avoid pink crates and shifting arrow-marked hazards. Energy builds run-score
  combos (up to ×5); S grants a single-hit timed shield, M a timed all-lane magnet,
  and + restores hull health (maximum three). Hits reset combos and grant a brief
  immunity window. Health reaching zero opens game-over.
- Speed rises to a bounded maximum; surviving waves and distance unlock sorting
  credit. The scene bounds active entities and particles and renders with a
  device-pixel ratio capped at two. All art is procedural and original.
- Calm has no wall-clock game motion: move, then Advance/Space to simulate a short
  step. Threats are also described as text. Reduced motion defaults to calm;
  reduced effects suppress background travel, particles and cosmetic animation.
- Pausing/window blur/tab hiding/focus leaving the game panel freezes simulation
  and starts no new earned requests. An in-flight file batch may finish safely.
- Restart resets the runner, not the archive. Verified files and earned credits
  remain, while event IDs stay unique. The completed-quest screen offers download
  and an endless bonus run that emits no file-processing milestones.

## Actual work while running

`ChaosEngine` emits monotonically numbered milestones only from the active game:
energy pickup earns up to 8 files, a survived 10-second wave up to 16, and each
400-metre milestone up to 24. Game score, health and distance are game statistics;
they never stand in for processed file counts.

`WorkScheduler` allows one request in flight and at most 25 files of coalesced
pending credit. Saturation merges/caps credit; it cannot enqueue an unbounded
list of pickups. Old/duplicate event IDs are ignored with a constant-size
high-water mark. Pause/game-over suspend queued credit; restart safely resumes it.

`EarnedBatch` sends the existing `REQUEST_BATCH` with at most 25 actual pending
files, using a `chaos-EVENT_ID` idempotence key. It accepts only a matching job and
request `BATCH_RESULT` whose exact entry IDs all have processed status. Per-file
`PROGRESS` does not resolve the receipt and is withheld by the organizer hook
while the earned request is pending. Counters/categories thus update only after
the worker's successful acknowledgment. Failed copies produce no earned receipt.

The organizer still validates ZIP metadata/paths, enforces streaming budgets,
verifies actual lengths/CRCs, preserves every source file byte and deterministically
handles output collisions. Cancellation discards partial output. Worker yields
use short-lived `MessageChannel` tasks (timer fallback if unavailable), retaining
all checks while avoiding timer clamping for hundreds of small entries.

`Finish sorting without playing` clears queued credit and explicitly drains the
remaining files. An already-earned in-flight batch retains its earned attribution;
later copies appear under Finish/other. This is distinct from run score and earned
file counts. No automatic full-archive job starts alongside ordinary gameplay.

The 120-file demo is generated locally from original text/code/CSV/SVG/JSON/binary
data, including Unicode names and duplicate basenames. The generator supports up
to 500 files for tests. No external file upload or API is required. Existing
20-file and Python-generated 24-file demo paths remain available too.

## Validation and remaining verification

Unit tests cover lane motion, collisions, invulnerability, shields, magnets,
repairs, moving hazards, speed, scores, states, pause/resume, calm, restart and
bonus runs. Scheduler/adapter tests prove one-in-flight backpressure, credit caps,
duplicate/stale/invalid receipts, cancellation, paused credit and finish attribution.
Integration tests use real runner milestones to organize 120- and 500-file ZIPs,
compare every output byte, verify manifests, and exercise restart/error/cancel/
explicit-finish cases. Real worker-thread transport is also tested.

Browser access remains unavailable here. Before release, manually verify:

1. Desktop and 390px visuals, hovercraft movement, readable HUD and overlay layout.
2. Keyboard focus, steering/buttons/swipes, pause during work, hidden-tab pause,
   calm stepping and reduced-motion behavior.
3. Correct collisions, telegraphed moving hazards, power-up feedback and game-over.
4. Restart during processing; confirmed counts must persist without duplicate work.
5. Upload/download in the actual browser, source/output byte equality and manifest.
6. Victory/bonus runs, cancellation/reset, and network privacy (no file bytes or
   names leave the device). Confirm visible Finish/other versus game-earned totals.

Cloud Run configuration is preserved. Local builds/HTTP/worker checks do not prove
a Docker image, browser interaction or public Cloud Run URL. Docker and a configured
Google project/region remain prerequisites for the respective verification steps;
no deployment, commit, push, branch creation or judging submission is authorized
by this milestone.

The completed automated suite has 241 passing tests. One initial 500-file run
exceeded its 20-second deadline with per-file timer yields. Replacing those yields
with posted MessageChannel tasks fixed the timing bottleneck; the full suite then
completed in approximately 10 seconds. Browser performance remains unmeasured.

Production smoke verification also passed on `0.0.0.0:8091`: root, health, SPA,
JS, CSS and the referenced built worker returned 200; missing assets returned
404 and upload POSTs returned 405. The actual minified worker fetched over HTTP
organized a 120-file fixture in five bounded batches, with every file byte and
the manifest verified. This remains a Node worker check, not browser automation.

Files for this milestone:

- `src/features/game/chaos/`: `ChaosRun.tsx`, `RunnerCanvas.tsx`, `model.ts`,
  `render.ts`, `work-scheduler.ts`, `demo.ts`, `chaos.css` (new).
- `src/features/organizer/earned-batch.ts` (new), `useOrganizer.ts`, `session.ts`.
- `src/App.tsx`, `index.html`.
- `tests/game/chaos-model.test.ts`, `chaos-work.test.ts`,
  `chaos-integration.test.ts` (new); `tests/organizer/thread.test.ts`.
- `README.md`, `docs/CHAOS_RUN.md` (new), `docs/TEST_MATRIX.md`,
  `docs/ZIP_PIPELINE.md`.

Existing uncommitted Cloud Run readiness changes were retained. No existing
project files were deleted, no dependencies added, and no Git history was changed.
