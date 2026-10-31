# Build plan — value first, deadline-safe

This order is more important than exact clock estimates. Organizer schedule: development 11–13 and 14–16, pitch 16–17, submission 17–17:30.

## Gate 0 — Setup (finish first)
- Public GitHub repo; only `main` (including remote). Clone to VS Code, extract kit, verify Codex reads AGENTS.md.
- Node.js 22+, Git, npm; optional Google Cloud CLI; create/set Google Cloud project, billing and API access with user's authorization.
- Make first meaningful config commit. No unnecessary services.
**Done when:** `git status` clean, `git branch -a` only main + origin/main, and Codex can summarize these instructions.

## Gate 1 — Working vertical slice (priority #1)
- Scaffold minimal React/Vite/TS app (with scripts build/lint/typecheck/test).
- File uploader and strict ZIP preflight; organizer worker classifies and repacks a small sample ZIP. No game required yet.
- Result manifest, summary and downloadable ZIP. Write unit tests for safe filenames, content preservation, duplicates and corrupted inputs.
- Generate demo data (`python scripts/generate_demo_zip.py`).
**Done when:** a real uploaded ZIP is output with identical original file bytes and transformed internal paths, without artificial progress.

## Gate 2 — Gameplay integration
- Responsive Canvas/DOM arcade game, pickup mechanic, worker-batch integration and processed count only on batch success.
- Game controls, pause, cancel, finish sorting, touch and keyboard input.
**Done when:** playing triggers actual worker operations; download still works if user skips or loses the game.

## Gate 3 — Deploy early
- Use existing Dockerfile and server; `npm run build` then `gcloud run deploy filequest --source . --region REGION --allow-unauthenticated --project PROJECT_ID` after user permission/auth.
- Verify live HTTPS `/`, `/healthz`, static assets, and downloaded ZIP result. Save URL in README.
**Done when:** another browser/private window can use the public Cloud Run URL unauthenticated.

## Gate 4 — Quality + pitch
- Polish visual hierarchy and animation while preserving correct output; handle mobile, errors, loading and empty ZIP.
- Run Vitest, Playwright, responsive/accessibility tests and secret/repo scans.
- README, screenshot if lightweight, architecture diagram in Markdown, 2-minute demo and business model; prepare backup demo ZIP.
**Done when:** all checklist gates pass, URLs confirmed, no unfinished API dependency.

## Gate 5 — Final submission (human action)
- Final Git push on main; verify remote is one branch and repo size safely under 10 MB.
- Open and interact with the deployed URL in an incognito session.
- Submit repo link, Cloud Run deployed URL and short description on platform. Use assessment attempts carefully: last attempt score replaces first; do not auto-submit.

## Kill-list if time is short
Kill: authentication, database, Gemini integration, multiplayer, leaderboard backend, 3D graphics, long animations, custom font downloads, direct local folder modifications, auto-deletion, elaborate dashboards. Keep: real ZIP chore, playable game, working export, Cloud Run and clean tests.
