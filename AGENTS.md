# AGENTS.md — ByteCraft Pong

Static hand-tracking Pong game. No build, no package manager, no tests, no CI.

## Run

Serve over HTTP (camera/`getUserMedia` requires `localhost` or HTTPS; `file://` will fail):

```sh
python3 -m http.server 8000
# open http://localhost:8000
```

Requires webcam permission + internet (MediaPipe CDN). No install step.

## Structure

- `index.html` — entrypoint. Loads MediaPipe CDN scripts in `<head>`, `style.css` in `<head>`, `script.js` at end of `<body>`. Fixed 640×480 `video.input_video` + `canvas.output_canvas`. Contains `.game-layout` (`.container` + `.side-panel`), where `.side-panel` stacks `aside.scoreboard` above the inline `#name-modal.entry-card` (the name prompt is a page panel, NOT an overlay — don't turn it back into a modal).
- `#gameover-modal` is the only remaining `.modal-overlay` (result card, floats centered).
- `script.js` — all game logic (single file, vanilla JS, no modules/bundler): Web Audio SFX, state flags, physics/collision, rendering, MediaPipe `Hands` + `Camera` wiring, plus name-gate and scoreboard modules at top/bottom.
- `scores.json` — scoreboard seed, JSON array of `{ name, score, aiScore, date }` (`aiScore` = points the AI scored that match; missing on legacy entries and treated as worst for that score group). Browser JS cannot write back to this file, so it is read-only: `loadBoard()` fetches it once, then `localStorage['bytecraft_pong_scores_v1']` is the writable DB (same shape, top 10). `Clear Board` persists `[]`, which then shadows the seed on reload.
- Rows render the compact scoreline (`5-1`, `5-3`) via `.score-points`; an entry with no `aiScore` can only show its points. Ranking is `compareEntries()` in three tiers: more points first, then the better scoreline (5-0 outranks 5-1), then earliest `date` (whoever got there first). `recordPlayerScore()` only overwrites a player's existing row when the new match is strictly better on tier 1 or 2 — an equal scoreline keeps the earlier date, so "first" is preserved. Any new match on the board must be re-run through `sortBoard()`.
- Player identity in `localStorage['bytecraft_pong_player_v1']` (max 20 chars). `#name-modal` shows on every load (prefilled); Play/`P` is blocked until a name is set. `Change Name` pauses and reopens the modal.
- First to `WIN_SCORE = 5` wins: scoring branches call `checkMatchEnd()` instead of `resetBall()` directly — on match end `endMatch()` stops play, parks the ball (no countdown), sets the button to "Play Again (P)", records the final name+score, and shows the `#gameover-modal` session screen (`{NAME} won!` / `AI wins — you didn't win`, `{NAME} 5 - 3 AI` scoreline, `Your rank: #N` from `playerRank()`, plus `New Game` button wired to `startNewMatch()` which resets, clears the player name, and prompts for a (new) name via `#name-modal` — submitting the name auto-starts the fresh match with a countdown (`pendingAutoStart` flag). The `P` shortcut delegates to `btnPlayPause.click()` and only bails when `document.activeElement === nameInput`, so typing "p" in a name is safe; do NOT gate it on `nameModal.hidden` — the name card is an always-visible inline panel, so that guard silently killed the shortcut. `hideNameModal()` blurs the input for the same reason. A canvas win overlay with the same info sits behind the modal; the `PAUSED` overlay is suppressed while `gameOver`. Pressing Play/`P` from `gameOver` also resets and restarts.
- AI is beatable but not helpless: `ai.speed = 6` (ball `minSpeed = 6`), `AI_DEADZONE = 22` slop, and `ballComingAtAI()` gating — the AI only chases when the ball moves toward its side, otherwise it drifts to center at half speed. Tune these three knobs for difficulty.
- `style.css` — ByteCraft theme (`--violet`/`--azure`, `Bg.png` backdrop). `.input_video` hidden, canvas has `cursor: none`.
- Assets: `Bg.png`, `logo.svg`, `screenshot.png`.

## Gotchas

- Game loop is `onResults` in `script.js` (driven by MediaPipe camera frames), not `requestAnimationFrame`. Physics/rendering/interpolation all live there; `SUBSTEPS = 10` for ball/paddle integration.
- Player paddle follows MediaPipe landmark 8 (index fingertip), mirrored: `targetPointerX = (1 - x) * width`. Smoothing via `SMOOTHING_FACTOR = 0.5`.
- State flags: `isPlaying` (default `false`, toggled by `#btn-playpause` or `P` key), `isSwapped = true` by default (inverts which side scores for player vs AI — check scoring branches before "fixing"), `isVertical = false` by default. Mode/switch buttons call `resetGame()` (zeroes scores).
- Layout: `.game-layout` is `align-items: stretch` so `.side-panel` (scoreboard + name card) matches the game panel height. `--game-panel-h: 520px` in `:root` is a hard cap on `.side-panel` — 480px canvas + 2*18px padding + 2*2px border. If the canvas `width`/`height` attributes in `index.html` change, update that variable, or a long scoreboard will stretch the page instead of scrolling. The score list itself is the only scroll container (`flex: 1 1 auto; min-height: 0; overflow-y: auto`) with a custom violet→azure scrollbar (WebKit `::-webkit-scrollbar-*` + Firefox `scrollbar-width`/`scrollbar-color`).
- Modals are **cards, not scrims**: `.modal-overlay` is `background: transparent` + `pointer-events: none` with `pointer-events: auto` on `.modal`, so the game, scoreboard and backdrop stay visible/clickable while a result prompt is up. Don't restore a full-page dark overlay or `backdrop-filter` on the overlay. The on-canvas idle dim is deliberately light (`0.25` paused, `0.45` game-over) for the same reason.
- Audio (`AudioContext`) only initializes on Play click (`initAudio()` — browser autoplay policy). SFX are synthesized with `playTone()`; no audio files.
- Play/pause button color is set via inline `style.backgroundColor`, overriding `#btn-playpause` CSS — update both if restyling.
- Fullscreen requests `document.documentElement`, so masthead/controls/game/scoreboard/backdrop are all included. `body:fullscreen` keeps the theme background; do not revert to canvas-only fullscreen.
- MediaPipe scripts pinned to `cdn.jsdelivr.net/npm/@mediapipe/*`; `locateFile` for hand models uses same CDN — keep versions in sync.
- The middle dashed line is a real boundary: `clampPlayerToSide()` in `script.js` locks the player paddle to its own half (right/left in horizontal when swapped/unswapped, top/bottom in vertical). Mode/side switches call `movePlayerToOwnHalf()`.
- Every ball launch has a 2s countdown (`COUNTDOWN_MS`, `ballHeld`/`pendingVx`/`pendingVy`): `resetBall()` holds the ball at center, `onResults` launches when `Date.now() >= countdownEnd` and draws the `secs` + "Get ready…" overlay. Play (re)starts re-arm via `armCountdown()`. Ball physics/decay are skipped while `ballHeld` (also avoids 0/0 NaN in the decay normalize).
- Keep it dependency-free vanilla JS + CDN scripts. Do not add a bundler, framework, or `package.json` without asking.
