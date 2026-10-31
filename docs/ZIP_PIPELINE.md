# ZIP organization contract — Milestone 2

The existing filename preview remains independent of actual ZIP processing.
The user selects a file (or generates the synthetic demo locally); the browser
reads at most 25 MiB and transfers its buffer to a dedicated worker. There is no
file-upload endpoint, database, external classifier or user-file network request.

## Inspection and accepted format

`zip-format.ts` parses classic ZIP central and local records, checking their
agreement, bounds, descriptors and complete non-overlapping local-record coverage.
It validates paths before decoding file contents. Only stored and deflate methods
are accepted. Encryption flags, ZIP64, split/self-extracting archives, alternate
Unicode path extra fields, legacy non-ASCII encodings, symlinks, device entries
and reparse points are rejected. UTF-8 decoding is fatal on malformed sequences.
Unsupported archives fail as a whole; nothing is silently exported from them.

Limits: input 25 MiB; files 500; all entries including directories 1,000;
uncompressed file 20 MiB; uncompressed total 100 MiB; compression ratio 100:1.
The plain filename planner is not an archive security boundary.

## Processing and output

`OrganizerSession` reuses `planFiles` for fixed category roots and deterministic,
case-insensitive, NFC-normalized collisions. Source identity is the ZIP entry ID,
so repeated identical source paths are not collapsed into a JavaScript object.
Source order is retained in the manifest. Directory markers are skipped with a
reason and empty files are copied. Directory payloads must be stored empty or
the canonical two-byte empty deflate stream; unusual directory payloads fail.

Deflated entries are read in 1 KiB compressed quanta using `fflate.Inflate`, never
an unbounded `unzipSync`. Every callback checks actual size, aggregate bytes and
ratio before packaging. A lying header cannot force its declared size to be
allocated. A single decoder quantum can temporarily expand by roughly 1 MiB
before its callback; malicious data is rejected before that chunk is retained.
Stored input is copied in 64 KiB quanta. Work yields between files and periodically
inside large entries so cancellation can be handled by the worker event loop.

For a file to become `processed`, actual length and CRC32 must match the source
metadata and all its contents must have passed into the output ZIP stream. Final
CRC32 checks on stored output payloads, output path/count/size checks and a valid
central directory are required before `COMPLETE`. CRC32 detects ordinary ZIP
corruption; this is not content-based deduplication or semantic classification.

Stored output avoids recompression, with an output cap of 108 MiB and manifest
cap of 4 MiB. It can be larger than the input. The pipeline retains output chunks
and assembles a final buffer, so peak memory can exceed 200 MiB near the limits.
The worker is terminated after completion, failure, cancellation, replacement or
component unmount. Object URLs are revoked on replacement/reset/unmount.

Timestamps are fixed to 2020-01-01 for repeatability. Original file bytes are
preserved; timestamps, empty directories, permissions and original ZIP compression
metadata are intentionally not restored. No original is modified or deleted.

## Protocol and observable progress

Each worker owns one job. `INIT {jobId, buffer}` emits `READY` with inspected
entries and zero processed files. `REQUEST_BATCH {jobId, requestId, maxFiles}`
accepts 1–50 files. The worker serializes requests. Repeated request IDs return
the original entry IDs with current totals and never copy or count files twice.

`PROGRESS` carries authoritative totals and at most one changed manifest entry.
`BATCH_RESULT` acknowledges a batch with the current manifest. The final batch
also finalizes and verifies the ZIP before a single `COMPLETE` transfers the
output buffer. During finalization, the state is `packaging`, even if all source
files have been copied. The UI exposes no download until it receives `COMPLETE`.

`CANCEL` aborts pending/in-flight processing and acknowledges a cancelled manifest.
The client then terminates the worker. No partial download survives cancellation
or an error. Previously completed copies remain honestly counted; cancelled
entries remain in `remaining`, with explicit `cancelled` row statuses. A failed
copy increments `failed`, and later unattempted files remain pending. Preflight
errors have no inspected manifest or invented failed-file counts.

For any inspected job:

`total = processed + skipped + failed + remaining`

Game integration can call the same small batch request for a pickup and observe
acknowledgments. `Finish sorting` drains batches without requiring gameplay.

## Verification and remaining browser work

Vitest tests independently reopen output with `fflate.unzipSync` on bounded,
synthetic test fixtures and compare bytes/SHA-256 with every source. Additional
tests cover path attacks, duplicate raw names, Unicode, limits, malicious size
claims, CRC corruption, unsupported metadata, progress and cancellation. A Vite
bundle of the real worker entry runs in a Node worker thread to check actual
structured cloning, buffer transfer, batch execution and cancellation.

Browser tests still need to exercise the real file picker/dropzone, keyboard-only
operation, 390px layout, reduced-motion behavior, Blob download, cancel/retry/reset
and network inspection during a user-file round trip. Node worker tests do not
prove those browser behaviors. Cloud Run deployment and public GitHub validation
are outside this milestone and have not been performed.
