# FileQuest — Codex project instructions

## Mission and acceptance criteria
Build a fast, accessible arcade-style experience that **actually sorts files from an uploaded ZIP** into an organized downloadable ZIP while the user plays. User sees real processed/failed/remaining counters. No simulated completion; no destructive local-file writes. Read `docs/PRODUCT_BRIEF.md` before implementing.

## Nonnegotiable event rules
- **Public GitHub repository; only one branch (`main`); under 10 MB of Git repository content/history.** Never create feature branches, fork full sample repositories into this repo, or rewrite Git history without approval.
- Submission must include **public GitHub URL, live Google Cloud Run URL and short description**. A broken Cloud Run URL can disqualify a shortlisted entry.
- At most **two scored assessment submissions**; **only the last counts**. Do not submit on the hackathon portal or trigger scored assessment.
- Prioritize the criteria: problem alignment, correctness, security, code quality, efficiency, tests, accessibility, and sensible Google-service use.
- Event development slots: 11:00–13:00 and 14:00–16:00; pitch 16:00–17:00; submission 17:00–17:30 (local event time). Get deployable MVP well before submission.

## Approved MVP architecture
- React + Vite + TypeScript, lightweight CSS, Canvas (or simple DOM) arcade game.
- `fflate` for ZIP handling and a Web Worker for sorting. Prefer `postMessage` before adding any worker helper dependency.
- Deterministic, explainable filename/extension-based classification; no fabricated AI classification, no backend file upload, no database, no mandatory external API.
- Cloud Run serves compiled static assets via provided `server.mjs` / `Dockerfile`, listening on `0.0.0.0:$PORT` (fallback 8080).
- Recommended directories: `src/features/organizer/` (core + worker), `src/features/game/` (game loop), `src/components/` (UI), `src/lib/` (shared types/helpers), `tests/` (tests). Preserve existing structure if created.

## Real processing contract
- Safely inspect selected ZIP, reject unsafe paths, symlinks/unsupported entries, archives beyond documented count/byte limits and suspicious compression ratios. Enforce decompression budgets **while reading**, not after expanding everything.
- Preserve original contents byte-for-byte in reorganized ZIP; move paths virtually (never overwrite original files). Deterministically resolve duplicate output names.
- Use explicit worker messages: REQUEST_BATCH, BATCH_RESULT, PROGRESS, COMPLETE, CANCEL, ERROR. Each batch request must be idempotent; progress only reflects successful actual classification/packaging work.
- Ensure responsive game input while worker processes files. A player pickup can request the next batch; provide an accessible 'Finish sorting' control, and don't trap users in a game to access their result.
- Report accurate pending / processed / skipped / failed totals; verify the output ZIP is extractable and contains expected files. No animation-derived fake percentage.
- Use only synthetic, documented demo data by default; explain user files remain in-browser.

## Safety, quality, and testing
- Never delete or modify user files. Ask before network transfer, installing major services, deploying/billing actions, pushing, or changing repo permissions. Never commit secrets or `.env` files.
- Validate filenames and ZIP metadata, avoid unsafe HTML and path traversal, consider memory exhaustion/ZIP bombs. Show friendly errors and allow cancellation.
- Responsive at 390px and desktop; semantic HTML, accessible buttons, keyboard/touch alternatives, visible focus, reduced-motion support, readable contrasts.
- Unit test classification, path sanitization, duplicates and limits; integration test worker progress; E2E test upload -> game -> actual output -> download. Run lint, typecheck, tests, build.

## Work procedure
1. Inspect `git status`, current tree and scripts; present the **smallest next milestone** and identify files to touch.
2. Implement one vertical slice at a time following `docs/BUILD_PLAN.md`; do not introduce unnecessary packages or infrastructure.
3. Use specialist agents **only for genuinely independent tasks**. Builders must not edit outside their owned directories. Reviewer agents should be read-only by instruction (not an enforced OS permission).
4. Run relevant commands and report verified results; don't say tests/deployment work without actual output.
5. Before commit/push use `python scripts/check_submission.py` (requires Git). Keep meaningful incremental commits on `main` only; no force-push.
6. Before final handoff verify Cloud Run production URL, README, deployment instructions, GitHub visibility, one remote branch and exact processed ZIP result.

## Response format for each milestone
State: implemented; exact files changed; commands/tests and results; what remains; next action. Do not automatically submit to judging portal.
