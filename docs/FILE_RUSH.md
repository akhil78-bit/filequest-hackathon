# File Rush — gameplay and file-work contract

## One packet, one acknowledged file

The game queue is built from inspected, pending manifest entries in worker order.
Each packet displays the actual filename and four deterministic gates, including
its category. Arrow/A/D controls choose a lane; Space/Enter from the arena routes
it. Number keys select a lane. Clicking/tapping a category gate selects and routes
directly. Repeated keydown events do not create extra actions.

A wrong gate or packet timeout resets the combo and removes one life. It does
not send a worker request or discard the pending file. Three mistakes enter a
recoverable lost state. Retry or calm mode resumes the actual remaining entries;
already confirmed files cannot be scored again.

A correct route synchronously enters `waiting`, disabling further route actions.
`PacketRequest` sends `REQUEST_BATCH {maxFiles: 1, requestId: game-route-ENTRY_ID}`
for the exact next pending entry. Repeating an identical in-flight request shares
its promise. Different parallel/stale entries are rejected. The worker's existing
idempotence and serialized queue provide the second duplicate-processing guard.

Only the matching job/request `BATCH_RESULT` with exactly the expected processed
entry resolves the receipt. Per-file `PROGRESS` messages are suppressed by the
organizer hook while that game request is pending. Score, combo, next packet and
visible processed count therefore cannot advance on an animation or before ACK.
Slow copies do not advance the challenge clock or consume lives/speed bonus.

After the last actual file, finalization/verification must complete before the
download appears. If only trailing directory markers remain, a one-file-capacity
batch automatically completes their skipping/finalization; it processes no
additional file. Empty ZIPs have no invented packets and use explicit finish.

## Time, score and accessible alternatives

Rush gives 8 seconds per packet, decreasing by 180 ms per confirmed route to a
3-second minimum. A confirmed file grants 100 points, up to 225 combo bonus and
up to 100 speed bonus. Calm has no deadline or speed bonus. Score remains separate
from the archive's actual processed/skipped/failed/remaining counters.

Game phases: tutorial, playing, waiting for ACK, paused, lost, finishing, complete,
error and cancelled. Pausing stops the game clock and new requests; an already
requested file can finish safely, with pause applied to the next packet. Window
blur, tab hiding and leaving the game panel with keyboard focus also pause.

Reduced motion defaults to calm and freezes positional packet animation. Gates
have readable labels rather than color-only meanings; controls are native buttons
with visible focus. `Finish sorting without playing` is always available for a
prepared archive. It explicitly switches to the existing batch-draining flow,
freezes game score and preserves file correctness. No automatic full ZIP job runs
alongside normal gameplay. Cancellation/replacement invalidates pending score
receipts; original files remain untouched and no partial ZIP is downloadable.

## Tests and browser verification

`tests/game/engine.test.ts` covers gates, controls, timer/life rules, slow work,
acknowledgments, combos, pause, calm, failures, retry and late responses.
`tests/game/integration.test.ts` drives real organizer worker handlers through
game actions and checks exact file contents and manifest output. The organizer
thread tests run a complete game over real thread messaging and transferred ZIP
data. Existing path/bomb/CRC/cancellation/limit tests remain in the suite.

The browser connector is unavailable in this environment; native Edge control
was not approved. Browser gameplay, layout, touch, reduced-motion appearance and
Blob download have not been verified. Node thread tests do not establish these.

Manual browser checks before release:

1. At desktop and 390px, play the synthetic demo in rush and calm modes. Verify
   steering, gate taps, keyboard focus, three-life failure and resume.
2. Route one correct packet: processed and score remain unchanged until its ACK.
   Try repeated Space/taps, wrong gates, pause while copying and hidden tabs.
3. Lose/retry and finish without playing. Check score is independent of all file
   totals. Cancel/reset/reload and ensure no stale score or partial export appears.
4. Upload a real synthetic ZIP, complete the game, download and independently
   extract it; compare bytes and inspect `filequest-manifest.json`.
5. Use browser network tools to verify that file names/contents are never sent to
   external endpoints; test reduced motion and keyboard-only calm/finish paths.
