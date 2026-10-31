# 2-minute judges' pitch — customize after implementation

**0:00–0:15 — Pain:** 'Our Downloads folders pile up because sorting is boring. Yet games make repetitive actions fun.'
**0:15–0:30 — Value:** 'FileQuest turns organizing a ZIP archive into a fast arcade experience—while it performs the sorting for real.'
**0:30–1:10 — Live demo:** Use synthetic messy ZIP. Show initial file count and sample paths, play, collect powerups, watch *verified* worker progress, finish sorting and download new ZIP. Open ZIP to prove categories + manifest.
**1:10–1:30 — Technical trust:** React/TypeScript; file processing in Web Worker; safe ZIP validation; local-only privacy; Cloud Run public hosting; unit tests.
**1:30–1:45 — Impact/business:** Easy local-file productivity tool for students and creators; possible paid rule presets/AI categorization later, not yet shipped.
**1:45–2:00 — Close:** 'We don't gamify a progress bar—we gamify a real task.'

Short project description template (only claim what is built):
'FileQuest is a browser-based arcade file organizer. Upload a ZIP of messy files, play a quick game while background processing sorts files into categories, then download an organized ZIP and transparent manifest. Built with React, TypeScript, Web Workers and Google Cloud Run.'

Backup: pre-generate sample ZIP locally with `python scripts/generate_demo_zip.py`, avoid private or real account data. Demonstrate output contents, not just score animation.
