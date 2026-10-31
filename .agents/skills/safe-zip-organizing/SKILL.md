---
name: safe-zip-organizing
description: Use when implementing, reviewing, or testing FileQuest ZIP upload, file classification, path safety, duplicate handling, worker progress and real ZIP export. Avoid for visual UI work.
---
# Safe real-file organizing workflow

1. Define observable contract: input ZIP -> inspected entry manifest -> deterministic category map -> sanitized output names -> output ZIP -> validation. Files remain local; do not alter originals.
2. Choose the smallest robust `fflate` import. Use a Web Worker; never use `unzipSync` on unbounded untrusted inputs. Budget entry count, ZIP bytes, uncompressed total bytes, per-entry bytes and compression ratio, aborting streams as soon as a limit is hit.
3. Normalize filenames: reject absolute and drive paths, backslashes interpreted as separators, `..`, NUL, invalid or empty segments and symlink-like entries. Use explicit safe roots in output (`Documents/`, `Images/`, `Videos/`, `Audio/`, `Code/`, `Archives/`, `Other/`).
4. Classify by actual extension/filename rules. Make every decision explainable; unsupported stays `Other/`, not claimed to be AI-analyzed.
5. Preserve original content byte-for-byte; deterministic duplicate naming e.g. `foo (2).txt`, stable ordering. Add `filequest-manifest.json` mapping old/new names, category and status; prevent manifest collision.
6. Processing must be independent of frame rate. Batch acknowledgments and progress come from *real processing*; no fake timers. Implement cancel, reset, retry errors and no concurrent write corruption.
7. Cover security cases in tests. Generate tiny synthetic ZIP via `scripts/generate_demo_zip.py`. Open the produced ZIP and compare content checksums to the input.
8. Report: count of successfully copied real files, skipped or rejected count, any uncertainties, executed tests and size limits.
