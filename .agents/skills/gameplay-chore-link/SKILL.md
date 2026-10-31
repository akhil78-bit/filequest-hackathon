---
name: gameplay-chore-link
description: Use when connecting FileQuest arcade gameplay to genuinely completed file chores and when testing accessibility, state synchronization, game loops or meaningful progress.
---
# Game-to-chore integration

1. Implement a simple 2D dodge-and-collect game with keyboard controls (arrows/A-D and Space) and large on-screen touch controls.
2. The game emits typed `PICKUP`/`PAUSE`/`RESUME`/`FINISH` events; UI requests idempotent worker batches. Only worker BATCH_RESULT updates actual sorted-file count.
3. If files finish quickly, show accurate complete state and let the player enjoy bonus play; if files take longer, keep the game responsive. Do not pretend a pickup processed files before the worker confirms it.
4. Consider progress independent from score; score measures gameplay, processed/remaining measure files. A visible 'Finish organizing' action allows non-game users to complete the work.
5. Add `prefers-reduced-motion` behavior, pause/resume, focus visible and controls usable at 390px.
6. Check that downloaded ZIP is valid and contains exactly the successful entries. A fake demo-only progress mode, if implemented, must be explicitly labeled and excluded from real counters.
