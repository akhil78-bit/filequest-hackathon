---
name: cloud-run-release
description: Use before deploying FileQuest to Google Cloud Run or preparing its final public URL, repository-size preflight, and assessment submission readiness.
---
# Cloud Run release routine

1. Confirm `package-lock.json` exists and `npm ci`, `npm run lint`, `npm run typecheck`, `npm test -- --run`, and `npm run build` pass (use actual defined scripts).
2. Check Dockerfile multi-stage copy and `server.mjs` runtime; `0.0.0.0:$PORT`, 8080 default. Test `GET /healthz`, root HTML, JS assets, and a missing route. Confirm public URL after Cloud Run deploy.
3. Verify no ZIP uploads/no secrets, and repo is under 10 MB with one remote branch and `main` current. Run `python scripts/check_submission.py`, then manually verify GitHub Public visibility and `git ls-remote --heads origin`.
4. Verify README includes local setup, sample ZIP generator, tests, Cloud Run deployment and demo steps. Maintain short description and a 2-minute judge pitch.
5. Never claim deploy succeeded based only on a successful build. Use HTTP requests on the Cloud Run URL and test one real ZIP round trip through the deployed page.
6. Require user confirmation for Cloud billing/API enablement, creating cloud resources and public deploy; never auto-submit assessment attempt.
