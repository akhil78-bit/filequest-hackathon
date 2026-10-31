# Cloud Run deployment playbook

Prepared locally on 31 October 2026. **No deployment or cloud-resource changes
have been performed.** Commands below are for a separately approved release.

## Architecture and verified preparation

Cloud Run hosts compiled static files only. ZIP data, filenames, extraction,
gameplay batches and export remain inside the browser; there is no upload API.

- Dockerfile: Node 22 Alpine, `npm ci` with the lockfile, Vite/TypeScript build,
  then a separate runtime containing only `dist/` and `server.mjs`, as user `node`.
- Server: plain HTTP on `0.0.0.0:$PORT`, default 8080. Cloud Run supplies `PORT`
  and terminates external HTTPS; do not run Vite's development server in production.
- `GET`/`HEAD /healthz`: 200 with `ok` for GET, no-store. Startup fails if the
  production index is missing/unreadable, avoiding a healthy broken container.
- Extensionless app paths fall back to HTML. Missing static assets under
  `/assets/` always return 404. JS/module-worker and CSS MIME types, immutable
  hashed-asset caching, HTML revalidation and security headers are tested.
- CSP permits the same-origin worker and Blob operations. Inline styles are
  retained for packet position; script execution is restricted to same-origin.
- `.gcloudignore` allows only build inputs, source, tests and optional public
  assets into the source upload. `.dockerignore` separately filters local/private
  artifacts from the Docker build context.

On this machine Google Cloud SDK is installed; project and region are **unset**.
Docker is not installed, so a Linux image build/run has not been verified locally.
`gcloud run deploy --source` uses the supplied Dockerfile in Cloud Build and does
not require local Docker. Browser interaction and a live HTTPS URL still require
post-deployment verification.

Official references: [runtime contract](https://docs.cloud.google.com/run/docs/container-contract),
[source deployment and IAM requirements](https://docs.cloud.google.com/run/docs/deploying-source-code),
[source upload filters](https://docs.cloud.google.com/sdk/gcloud/reference/topic/gcloudignore),
[HTTP health probes](https://docs.cloud.google.com/run/docs/configuring/healthchecks).

## Local preflight — PowerShell

Run from `C:\filequest-hackathon`. Commands below change local build output only.

```powershell
npm.cmd ci
npm.cmd run lint
npm.cmd run typecheck
npm.cmd test
npm.cmd run build
gcloud.cmd meta list-files-for-upload
```

The upload list must contain Dockerfile, server, package/lockfile, TypeScript/Vite
configuration, all `src/` and `tests/` inputs. It must exclude `.git/`, `.codex/`,
`.agents/`, `node_modules/`, `dist/`, docs, archives, credentials and `.env` files.
This command lists files locally; it does not upload or deploy them.

Run Git preflight with a working Python installation:

```powershell
python scripts/check_submission.py
```

If Windows' `python` command is only an unusable app alias, the installed Google
SDK supplies an interpreter; this fallback was verified here:

```powershell
$FileQuestPython = (gcloud.cmd info --format="value(basic.python_location)").Trim()
& $FileQuestPython scripts/check_submission.py
```

For a local production preview:

```powershell
$env:PORT = '8080'
node server.mjs
```

From a second terminal:

```powershell
curl.exe --fail http://127.0.0.1:8080/healthz
curl.exe --fail --head http://127.0.0.1:8080/
curl.exe --fail --head http://127.0.0.1:8080/quest/session
```

Stop this owned preview with Ctrl+C before using the same port again. Optionally,
with Docker already installed, verify the actual Linux container before release:

```powershell
docker build --platform linux/amd64 -t filequest:local .
docker run --rm --name filequest-local -p 127.0.0.1:8080:8080 -e PORT=8080 filequest:local
```

## Approved release commands — do not run until authorized

Choose an existing project with billing enabled. Replace `YOUR_PROJECT_ID`;
`asia-south1` is a proposed Indian region, not an event requirement. These local
variables avoid silently changing the CLI's selected project.

The deployer needs source deployment/build permissions, service-account usage
and permission to grant public invocation. The build identity needs the Cloud Run
Builder role as described in the official source-deployment documentation. If IAM
or organization policy blocks public access, resolve it with the project owner;
do not broaden permissions or disable policy automatically.

The following commands authenticate, enable APIs, upload source and create/update
billable resources and public service access. **They have not been executed.**

```powershell
$FileQuestProject = 'YOUR_PROJECT_ID'
$FileQuestRegion = 'asia-south1'
if ($FileQuestProject -eq 'YOUR_PROJECT_ID') { throw 'Set your approved Google Cloud project ID first.' }

gcloud.cmd auth login
gcloud.cmd services enable run.googleapis.com cloudbuild.googleapis.com artifactregistry.googleapis.com --project $FileQuestProject

gcloud.cmd run deploy filequest `
  --source . `
  --project $FileQuestProject `
  --region $FileQuestRegion `
  --allow-unauthenticated `
  --ingress all `
  --port 8080 `
  --memory 256Mi `
  --cpu 1 `
  --min-instances 0 `
  --max-instances 2 `
  --timeout 60 `
  --startup-probe "httpGet.path=/healthz,httpGet.port=8080,periodSeconds=5,timeoutSeconds=2,failureThreshold=12" `
  --liveness-probe "httpGet.path=/healthz,httpGet.port=8080,periodSeconds=30,timeoutSeconds=2,failureThreshold=3"
```

Scale-to-zero and maximum instances limit capacity; these flags are not a hard
spending cap. Browser ZIP memory usage does not count against container memory.
Build, Artifact Registry storage and request costs may still apply. No database,
Gemini, secret keys, persistent disk or runtime Google API permissions are needed.

## Verify the actual deployment — do not guess its URL

After a successful approved deploy, obtain the returned URL and use unauthenticated
requests (no bearer token or identity header):

```powershell
$FileQuestUrl = (gcloud.cmd run services describe filequest --project $FileQuestProject --region $FileQuestRegion --format="value(status.url)").Trim()
if (-not $FileQuestUrl.StartsWith('https://')) { throw 'Cloud Run did not return an HTTPS service URL.' }
curl.exe --fail --show-error "$FileQuestUrl/healthz"
curl.exe --fail --show-error --head "$FileQuestUrl/"
curl.exe --fail --show-error --head "$FileQuestUrl/quest/session"

$FileQuestPage = Invoke-WebRequest -UseBasicParsing "$FileQuestUrl/"
$FileQuestScript = [regex]::Match($FileQuestPage.Content, 'src="([^"]+)"').Groups[1].Value
$FileQuestStyle = [regex]::Match($FileQuestPage.Content, 'href="([^"]+\.css)"').Groups[1].Value
$FileQuestScriptResponse = Invoke-WebRequest -UseBasicParsing ($FileQuestUrl + $FileQuestScript)
$FileQuestWorker = [regex]::Match($FileQuestScriptResponse.Content, 'assets/organizer\.worker-[A-Za-z0-9_-]+\.js').Value
if (-not $FileQuestScript -or -not $FileQuestStyle -or -not $FileQuestWorker) { throw 'Missing production asset reference.' }
curl.exe --fail --show-error --head ($FileQuestUrl + $FileQuestScript)
curl.exe --fail --show-error --head ($FileQuestUrl + $FileQuestStyle)
curl.exe --fail --show-error --head ($FileQuestUrl + '/' + $FileQuestWorker)
```

Checklist before calling the release working:

- [ ] Anonymous `/`, `/healthz` (`ok`), `/quest/session` and all referenced
  JS/CSS/worker assets return 200, with correct MIME types and security headers.
- [ ] Missing `/assets/not-found.js` returns 404; `POST /upload` returns 405.
- [ ] Open the actual HTTPS URL in an incognito/logged-out browser, with no
  developer account permissions. There are no worker/CSP/console failures.
- [ ] Play the 20-file synthetic demo. Each correct route copies one file only
  after worker ACK; wrong/repeated actions cannot manufacture progress.
- [ ] Download and independently extract the ZIP; compare all file bytes to the
  input and inspect `filequest-manifest.json`. Test a real synthetic ZIP upload too.
- [ ] Cancel/retry, corrupt ZIP rejection, calm mode, explicit Finish sorting,
  keyboard-only operation, reduced motion and 390px/touch all work.
- [ ] Browser network inspection confirms that no filenames or ZIP bytes are
  uploaded; the service hosts static assets only.
- [ ] Run repository preflight again, verify GitHub is public while logged out,
  exactly one remote branch `main`, and complete history below 10 MB.
- [ ] Record the verified Cloud Run HTTPS URL in README before handoff. Commit
  and push only with separate approval. Never trigger a scored assessment here.

No live URL, billing status, cloud IAM readiness or browser end-to-end success is
claimed by local builds or HTTP tests alone.

## Local validation record

Preparation checks executed successfully on 31 October 2026:

- Clean `npm ci --offline --no-audit --no-fund`, lint, typecheck, full suite
  (195 tests) and production build.
- Fourteen HTTP regression cases, including the two reproduced/fixed failures:
  false-positive healthy startup without an index and HTML fallback for missing
  extensionless asset URLs.
- Actual built HTML/JS/CSS/worker served successfully on default port 8080;
  separate server tests verify `0.0.0.0` binding on custom `PORT` values.
- The exact minified production worker fetched over local HTTP ran in a real
  Node worker thread: 20 one-file batches, byte-exact ZIP output including
  Unicode names and basename collisions, and a verified manifest. This is not a
  browser download/CSP execution test.
- `gcloud meta list-files-for-upload` contains the required source/build inputs
  and excludes local tools, Git metadata, dependencies and generated artifacts.
- Repository checker passed using the SDK's bundled Python: only local/remote
  `main`, no obvious forbidden tracked files, reachable raw blobs 383,266 bytes.
  GitHub's unauthenticated repository API reported public visibility and `main`.

Still unverified: Linux Docker image execution (Docker unavailable), Google Cloud
project/billing/IAM prerequisites (project/region unset), live HTTPS deployment,
browser gameplay/CSP/Blob downloads, mobile behavior and network-privacy inspection.
