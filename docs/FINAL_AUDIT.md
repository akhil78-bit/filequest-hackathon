# Final security and engineering audit — 31 October 2026

Verdict: the targeted fixes pass local automated and production-asset checks.
No unresolved Critical/High finding was identified in this review. This is not
a security certification or a submission-ready live release: browser interaction,
Linux container execution and public Cloud Run verification remain outstanding.
No commits, pushes, branches, worktrees, deployments or assessment submissions
were made. Existing gameplay mechanics, classification and ZIP limits remain.

## Findings and evidence

| Finding | Assessment | Fix and executed evidence |
| --- | --- | --- |
| DEFLATE trailing-payload amplification | High availability risk in client ZIP handling; attacker must persuade a user to select/process an archive | A one-byte valid stream padded to 1 MiB retained 1,048,574 pending bytes and recopied 536,344,578 bytes in the unguarded decoder. Check the actual stream end after each 1 KiB push. Tests reject padding on the first push, report zero processed/one failed and suppress output; the actual minified production worker rejects the same attack. |
| Untyped worker inputs and unbounded pending requests | Medium defensive boundary weakness; dedicated worker is not a public network endpoint | Validate message discriminator, IDs, ArrayBuffer/25 MiB limit and batch size before allocation/scheduling. Unknown commands cannot fall through to copying. At most eight outstanding requests; cancellation bypasses the queue. Ten malformed-input cases, oversized input, unknown-command and 100-request flood regressions pass. |
| Cancellation after worker finalization | Medium reliability race | Cancel still acknowledges cancelled if worker completion won the race; completed counts remain truthful, retained output is discarded and later batches cannot export again. Regression completes 20 files, cancels before client acceptance and verifies the final state. |
| Focus leaving on-screen game controls | Medium accessibility/reliability | Move blur/key handling from only the arena to the whole game panel. Text controls retain native behavior; calm Space/Enter remains arena-only. Focus an appearing state panel only if document/game still owns focus. Lint/types pass; actual keyboard and screen-reader behavior still needs browser testing. |
| Missing CSP form/base restrictions | Low defense in depth | Add `form-action 'none'` and `base-uri 'none'`; production/server tests verify headers. React rendering of hostile archive names, errors and manifest fields remains escaped in an SSR regression. No exploitable XSS was demonstrated. |

No Critical vulnerability was found. Severity above is this application's risk
assessment, not an assigned CVE rating. The resource finding was reproduced
with bounded synthetic data; no user archive was used or transmitted.

## Verification performed

| Command/check | Result |
| --- | --- |
| `npm.cmd ci --offline --no-audit --no-fund` | Pass during this audit; 177 packages installed from the existing lockfile/cache |
| `npm.cmd run lint` | Pass, exit 0 |
| `npm.cmd run typecheck` | Pass, exit 0 |
| `npm.cmd test` | Pass, 265 tests / 11 files, 9.75 seconds on the final run |
| `npm.cmd run build` | Pass; Vite 7.3.7, 45 modules |
| `npm.cmd audit --omit=dev --fetch-retries=0 --fetch-timeout=30000` | Pass, zero reported vulnerabilities |
| Full dependency audit | Exit 1: 11 Moderate affected-package records stemming from one development-only minimatch advisory; zero High/Critical |
| Production HTTP + fetched worker smoke | Pass: root, health, SPA, JS/CSS/worker, CSP, missing-asset 404, upload POST 405; 121 files in five real batches, exact exported bytes and manifest, malicious padded DEFLATE rejected |
| Repository preflight | Only local/remote main; no forbidden tracked artifacts; history comfortably below 10 MB |
| Secret signature scan | No private-key, AWS access-key, GitHub-token or Google API-key signatures found in current unignored files or reachable historical blobs; not an exhaustive secret detector |
| Browser connector | Unavailable; no browser E2E pass claimed |

Build outputs: worker 23.23 kB; main JavaScript 281.75 kB (90.27 kB gzip);
CSS 18.41 kB (5.04 kB gzip); HTML 0.67 kB. No dependencies or heavy assets added.
The local production server and worker processes used for smoke checks were stopped.

The initial implementation of the DEFLATE guard rejected two legitimate stored
block streams because fflate leaves its final-block flag unset until it finishes
a block. The check was corrected; those regressions and independent zlib streams
now pass. Final lint/type/test/build checks have no failures. The full dependency
audit's development-only advisory remains explicitly unresolved.

## Focused criteria review

- Architecture: bounded worker operations, deterministic classifier and pure
  runner remain separated; the new decoder compatibility check is isolated.
- Security: paths/flags/metadata, streaming byte budgets, CRCs and final output
  verification remain enforced. File contents are never rendered as HTML, executed,
  recursively extracted or uploaded. The server accepts only GET/HEAD.
- Efficiency: game entities/particles and DPR remain capped; one earned batch
  plus 25 pending file credits; worker queue now also bounded. Worker termination,
  MessageChannel closure and Blob URL revocation are preserved. Maximum-size
  jobs can still require over 200 MiB client memory; low-memory devices untested.
- Reliability/alignment: real pickups/waves/distance milestones request work;
  exact worker ACKs grant earned counts. Existing 120-/500-file game integrations,
  duplicate/stale protection, pause/restart, corruption, cancellation and explicit
  finish attribution all pass. Export contents remain byte-exact.
- Accessibility: native controls, calm mode, explicit finish, reduced motion and
  visible focus retained; panel-wide blur handling corrected. Automated model/SSR
  checks do not establish WCAG conformance or actual touch/screen-reader usability.
- Google services: Cloud Run serves static assets; private ZIP work stays local.
  No unnecessary Google API, backend upload service or secrets were added.

## Remaining risks and release gates

1. Keep fflate **exactly 0.8.3** until the decoder-state adapter is revalidated.
   Its public callback does not expose consumed-byte/end-of-stream state. The
   guard isolates internal fields, checks their shape and rejects unsupported
   state; tests cover independent encoders and the minified production bundle.
2. Full npm audit reports [GHSA-g3hv-75wg-m249](https://github.com/advisories/GHSA-g3hv-75wg-m249)
   in development-only minimatch. The published fix is 11.0.1, a major change
   outside the current consumers' declared range. No forced downgrade/major
   override was introduced for this last-minute audit. User ZIPs never reach this
   tool; the runtime container contains only Node, dist and server, not node_modules.
   Reassess compatible tooling updates after the release checkpoint.
3. Manually test desktop/390px, touch/swipes, keyboard focus across arena/buttons/
   inventory, screen-reader state feedback, reduced motion, pause/resume, calm,
   cancel/retry and restart during copying. Verify actual browser Blob downloads,
   independently extract/compare a ZIP, inspect console/CSP and network privacy.
   Browser access host was unavailable; no Lighthouse/axe/browser performance
   score is claimed.
4. Google project and region are unset locally. Docker is unavailable. Verify
   billing, IAM and APIs with the owner, build/scan/run the Linux image, then use
   the exact commands in `DEPLOY_CLOUD_RUN.md` only after authorization. Node base
   image vulnerabilities are not covered by npm audit. The non-root multi-stage
   container and `0.0.0.0:$PORT` static server satisfy the reviewed runtime shape;
   no deployed service or public URL has been tested.
5. After approved deployment, test anonymous HTTPS health/root/assets/worker and
   the full upload-game-download flow, record the real URL in README, and complete
   `SUBMISSION_CHECKLIST.md`. GitHub metadata reports public visibility/main;
   verify logged-out access and branch/size constraints again before an approved
   commit/push/submission. CI exists as a template, not an active workflow.

References used for scope: [Cloud Run runtime contract](https://docs.cloud.google.com/run/docs/container-contract)
and [OWASP file upload guidance](https://cheatsheetseries.owasp.org/cheatsheets/File_Upload_Cheat_Sheet.html).

## Exact changed files

- `src/features/organizer/inflate-guard.ts` (new)
- `src/features/organizer/session.ts`
- `src/features/organizer/worker-handler.ts`
- `src/features/game/chaos/ChaosRun.tsx`
- `server.mjs`
- `tests/organizer/zip.test.ts`
- `tests/organizer/worker.test.ts`
- `tests/organizer/thread.test.ts`
- `tests/server.test.ts`
- `tests/ui-security.test.ts` (new)
- `README.md`
- `docs/ZIP_PIPELINE.md`
- `docs/TEST_MATRIX.md`
- `docs/DEPLOY_CLOUD_RUN.md`
- `docs/FINAL_AUDIT.md` (new)
