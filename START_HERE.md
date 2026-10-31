# FileQuest — hackathon preparation kit (v2)

This is a **Codex configuration and deployment starter**, not a finished game. It replaces the earlier expense-game kit.
Designed for PromptWars × OUTLIER 2026, 31 October 2026. **Do not submit this kit as the final project.**

## Do these steps, in order

1. Create a new **public** GitHub repository (suggested name `filequest-hackathon`). Initialize with README; keep only `main`. Do not fork or clone any large reference repo.
2. `git clone https://github.com/YOUR_USERNAME/filequest-hackathon.git` and `cd filequest-hackathon`.
3. Extract **the contents** of this ZIP into the repo root. Preserve hidden folders `.codex/` and `.agents/` (on Windows enable 'Hidden items'). The ZIP file itself must NOT be committed.
4. Open the folder in VS Code with Codex. Trust the project if you recognize its contents; open a **new Codex session** to load AGENTS.md and custom agents. Agent availability depends on your Codex client.
5. Read `docs/PRODUCT_BRIEF.md`, `docs/BUILD_PLAN.md` and `docs/CODEX_PROMPTS.md`.
6. Give Codex **Prompt 0**, then **Prompt 1**, from `docs/CODEX_PROMPTS.md`. Implement the project progressively; run tests before moving to the next prompt.
7. Install Node.js 22+ and Git. Install Google Cloud CLI and sign in for Cloud Run deployment. Follow `docs/DEPLOY_CLOUD_RUN.md` after the first working vertical slice.
8. Do not submit until `docs/SUBMISSION_CHECKLIST.md` is complete. Two scored assessment attempts maximum; last score counts.

## What is already supplied

- `AGENTS.md` — concise, durable project rules
- `.codex/config.toml`, `.codex/agents/*.toml` — specialized build/review roles; no hard-coded model
- `.agents/skills/*/SKILL.md` — focused workflows for ZIP processing, game integration, Cloud Run readiness
- `docs/*` — architecture, requirements, phased plan, test matrix, demo, tool references, prompts
- `server.mjs`, `Dockerfile`, `.dockerignore` — static frontend server deployed via Cloud Run after Vite app is created
- `.gitignore`, `scripts/check_submission.py` — Git safety and local preflight
- `scripts/generate_demo_zip.py` — makes a small, synthetic, messy ZIP for demos
- `templates/ci.yml` — GitHub Actions CI to copy into `.github/workflows/ci.yml` **once package.json and tests exist**

## Scope / known assumptions

- Proposed winning MVP: **FileQuest**, a ZIP-file organizer integrated with a quick arcade game.
- Browser processes files locally; Cloud Run **hosts the site**. This still is actual file organization; Cloud Run does not need to receive private files.
- No Gemini account/API is required for MVP. Google Gemini categorization is a *stretch feature* with explicit consent and a protected backend only.
- Do not promise OCR, perfect semantic understanding, automatic original-folder modification, cloud storage integration, or AI-powered classification in the MVP.
- The challenge emphasizes *real* chore execution; each progress count represents actual work done.
- Cloud Run costs may apply; check your Google Cloud billing/quota settings before deploying.

Official context: hackathon participant guide provided by organizer, pages 3–8.
