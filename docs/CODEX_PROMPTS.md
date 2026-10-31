# Copy/paste Codex prompts — execute in order

## Prompt 0 — verify setup and rules (NO implementation)
Read AGENTS.md, START_HERE.md and docs/PRODUCT_BRIEF.md. Inspect repo and Git status. Confirm active branch main, whether organizer constraints are reflected, and list project specialist agents and available skills. Do not change files. Give me a concise milestone plan and the first implementable vertical slice. Do not make assumptions about available CLI auth or Cloud Run project.

## Prompt 1 — scaffold + proven real file output
Implement Gate 1 in docs/BUILD_PLAN.md. Scaffold a lightweight React + Vite + TypeScript app using Node 22, with lint/typecheck/test/build scripts, fflate ZIP handling inside a worker, safe preflight, deterministic category classification, real path normalization, collision handling, accurate counts, output ZIP and manifest, and an upload/download UI. Use scripts/generate_demo_zip.py for sample data. Implement focused unit/integration tests. Keep the Git repository under 10 MB. Do not add gameplay yet. Run tests and build. Report actual ZIP contents verified via roundtrip testing. Do not push/deploy automatically.

## Prompt 2 — chore game integration
Implement Gate 2. Build a smooth arcade dodge-and-collect game with keyboard + on-screen touch controls in src/features/game, and connect pickups to *actual* organizer worker batches via typed messages. Never increment processed counts from animation or game score. Keep UI responsive during sorting and allow cancel/Finish Sorting. Add mobile and accessibility support, tests and browser verification. Use the chore_builder and game_builder in parallel ONLY when they can keep their file scopes separate; otherwise execute sequentially. Report real tested behavior.

## Prompt 3 — reviews and fixes
Run QA, security and Cloud Run reviewers, preferably concurrently. Fix high-severity findings in main agent after reviews. Confirm real zip contents, no ZIP bomb risk, no fake progress, keyboard/touch, 390px responsiveness, no secrets, and `npm run build`. Use /review if available. Provide test commands and results. No auto-push.

## Prompt 4 — deployment (after my cloud authorization)
Read docs/DEPLOY_CLOUD_RUN.md and AGENTS.md. Verify Dockerfile/server.mjs, npm lockfile, /healthz and 0.0.0.0:$PORT. Give me exact gcloud commands for my authenticated account/project and region; identify cost or required API/billing steps. Ask before creating or updating cloud resources. After my approval, deploy. Then test actual public HTTPS URL and a full synthetic ZIP upload/download round trip. Never invent success or a URL.

## Prompt 5 — release readiness
Complete docs/SUBMISSION_CHECKLIST.md: run all defined checks, python scripts/check_submission.py, confirm a single remote main branch, repo public visibility (manually if needed), Git history safely under 10 MB, deployed Cloud Run URL working, synthetic demo ZIP working and README accurate. Create a concise 2-minute pitch from docs/PITCH_DEMO.md and a short final project description. Do not submit assessment attempts automatically.
