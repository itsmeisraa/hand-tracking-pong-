# 🏓 ByteCraft Pong — Hand-Tracking 2D Pong

Classic Pong where **your webcam is the controller**. Google's MediaPipe Hands tracks your
index fingertip and moves your paddle — no mouse, no keyboard. Play a first-to-5 match
against the AI, then see where you land on a local leaderboard.

Still just HTML, CSS and vanilla JavaScript. No build step, no dependencies to install.

## 📸 Screenshot

![Hand-Tracking Pong Gameplay](/screenshot.png)

## ✨ Features

* **🖐️ Hand-Tracking Controls** — MediaPipe Hands follows your index finger (landmark 8) and drives your paddle in real time, with the feed mirrored so moving right moves right.
* **🎯 Three AI Difficulties** — Easy / Normal / Hard, cycling on one button. Each level changes how fast the AI paddle moves and how much tracking slop it has; **Hard** also predicts where the ball will cross its line by solving the trajectory through wall reflections, so it plays the intercept angle instead of chasing the ball.
* **📈 Live Telemetry HUD** — real FPS, camera→render inference latency in ms, hand-lock state and the active difficulty, drawn right on the board. Toggle a **Hand Mesh** overlay to see the 21 tracked landmarks and their skeleton on your own video.
* **💥 Game Feel** — the ball leaves a speed-coloured trail, scoring bursts into particles at the scoring edge, and hard paddle hits shake the screen.
* **🏆 First to 5** — the match ends the moment someone reaches 5 points, with a win/lose screen showing your final scoreline and your leaderboard rank.
* **📊 Local Leaderboard** — a separate top-10 board for each difficulty, so Easy wins never outrank Hard wins. Ranked by points, then by scoreline (`5-0` beats `5-1`), then by whoever got there first. Your own row is highlighted.
* **⌨️ Name Gate** — enter your name before playing; it's remembered for next time (max 20 chars). Starting a new game asks for the next player's name.
* **⏱️ Get-Ready Countdown** — every serve waits 2 seconds with an on-canvas `2 → 1` countdown, so you're never caught flat-footed.
* **🚧 Half-Court Rule** — the dashed centre line is a real boundary: your paddle is locked to your own half, so the AI can never reach around you.
* **🔀 Switch Sides** — flip which half you defend (resets the score).
* **📺 Fullscreen** — one button takes the whole page (masthead, controls, board and scoreboard) fullscreen, auto-sized to the viewport so it never needs scrolling.
* **🎵 Retro Audio** — procedurally synthesised beeps and chimes via the Web Audio API. No audio files.
* **🎥 Footage Toggle** — show or hide the camera feed behind the game.

## 🕹️ How to Play

1. **Serve it over HTTP.** Camera access needs `localhost` or HTTPS — opening `index.html`
   directly (`file://`) will not work:

   ```sh
   python3 -m http.server 8000
   # then open http://localhost:8000
   ```

2. **Allow camera access** when the browser asks, and make sure you have an internet
   connection (the MediaPipe scripts and hand model load from a CDN).
3. **Enter your name** in the card under the scoreboard. The game won't start until you do.
4. **Step back** so your hand is clearly visible, then press **Start** or hit **`P`**.
5. **Move your hand** to move your green paddle. Keep it on your side of the centre line.
6. **Score 5 points** before the red AI paddle does. Your result, scoreline and rank appear
   at the end — then press **New Game** to hand over to the next player.

### Controls

| Control | What it does |
| --- | --- |
| `P` | Play / Pause (and start a new match from the results screen) |
| **Start (P)** / **Pause (P)** | Same as the `P` key |
| **Toggle Footage** | Show/hide the camera feed behind the board |
| **Switch Sides** | Swap which half you defend (resets the score) |
| **Fullscreen** | Fullscreen the entire page |
| **Difficulty** | Cycle the AI: Normal → Hard → Easy — and the scoreboard switches to that difficulty's own board |
| **Hand Mesh** | Show/hide the tracked hand landmarks over the video |
| **Change Name** | Pause and reopen the name prompt |
| **Clear \<Difficulty\> Board** | Wipe only the board on screen |

## 💾 Where the scores live

* `scores.json` is a **read-only seed** — a JSON array of `{ name, score, aiScore, date }`.
  A browser can't write files back to disk, so it is fetched once at page load.
* `localStorage` is the **writable store** (`bytecraft_pong_scores_v1`), same shape, top 10.
  It shadows the seed as soon as it has data, so **Clear Board** then leaves you with an
  empty board. Your name lives separately in `bytecraft_pong_player_v1`.

To ship a pre-filled leaderboard, put entries in `scores.json`, e.g.:

```json
[
  { "name": "Ada", "score": 5, "aiScore": 0, "date": "2026-01-04T10:00:00.000Z" }
]
```

## 🛠️ Built With

* **HTML5 Canvas** — board, paddles, ball and all HUD drawing.
* **Vanilla JavaScript** — game logic, physics and rendering in a single `script.js`.
* **[MediaPipe Hands](https://google.github.io/mediapipe/solutions/hands.html)** — in-browser hand tracking.
* **Web Audio API** — zero-latency synthesised sound effects.
* **Quicksand** via Google Fonts, plus the ByteCraft theme in `style.css`.

## 📁 Project layout

```
index.html   markup, MediaPipe CDN tags, layout
script.js    all game logic (physics, rendering, MediaPipe, scoreboard)
style.css    ByteCraft theme, layout, scoreboard + modals
scores.json  read-only leaderboard seed
Bg.png       background artwork
logo.svg     ByteCraft logo
```

## 🤝 Contributing

Contributions, issues and feature requests are welcome! Feel free to check the issues page.

## 📄 License

This project is open-source and available under the MIT License.
