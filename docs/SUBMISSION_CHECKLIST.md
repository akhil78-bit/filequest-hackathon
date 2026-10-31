# FINAL submission checklist — do not submit until checked

## Code + user experience
- [ ] Upload original synthetic ZIP and download new ZIP with real organized files
- [ ] Verify output entries and exact original bytes; manifest maps paths
- [ ] No fake progress; processed/failed/remaining counts consistent across game/worker
- [ ] Invalid ZIP, large ZIP, file count, path safety, cancellation handled
- [ ] Game works keyboard/touch; accessible non-game Finish Sorting route
- [ ] Mobile 390px + desktop checked; visible focus and reduced motion
- [ ] Run actual lint/typecheck/unit/E2E and build; failures fixed, not hidden

## GitHub constraints
- [ ] Repo public (verify URL in logged-out private browser)
- [ ] Exactly **one remote branch** (`git ls-remote --heads origin` shows only refs/heads/main)
- [ ] Current branch is main; no other pushed branches
- [ ] Repository **under 10 MB**, including history (conservative target <8 MB)
- [ ] No .env, secrets, node_modules, dist, ZIP demos, screenshots/videos, or local credentials committed
- [ ] README tells user problem, working solution, local setup, tests and limitations

## Cloud Run — judge DQ risk
- [ ] Google Cloud Run deployment successful; copy the *actual* public HTTPS URL
- [ ] Logged-out browser can open website with no authentication
- [ ] `/healthz`, `/`, JS/CSS assets work; ZIP upload and output work on the deployed site
- [ ] Public demo link put into README and submission form; project description ready

## Portal submission
- [ ] Submit GitHub repo URL + deployed Cloud Run URL + brief project description
- [ ] Maximum 2 scored assessment attempts; only last counts. No experimental second attempt!
- [ ] Final URLs tested just before submission window 5:00–5:30 PM local event time
