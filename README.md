# 🏓 Hand-Tracking 2D Pong

A modern, interactive twist on the classic arcade game Pong! This browser-based game uses your webcam and **Google's MediaPipe Hands** to let you control your paddle entirely through hand gestures. No mouse or keyboard required to play!

**[🎮 Play the Live Demo Here!](https://alyhxn.github.io/hand-tracking-pong/)**

## 📸 Screenshot

![Hand-Tracking Pong Gameplay](/screenshot.png)

## ✨ Features

* **🖐️ Hand Gesture Controls:** Uses your webcam to track your index finger in real-time to move the paddle.
* **🤖 AI Opponent:** Play against an automated, dynamic AI paddle.
* **🔄 Rotatable Layouts:** Switch seamlessly between traditional Horizontal mode and a modern Vertical mode.
* **🔀 Switch Sides:** Swap the player and AI sides on the fly.
* **🎵 Native Retro Audio:** Procedurally generated 8-bit sound effects (beeps, boops, and score chimes) using the browser's native Web Audio API—no external audio files needed!
* **⌨️ Keyboard Shortcuts:** Press `P` to instantly Play or Pause the game.
* **📺 Fullscreen Support:** Immersive edge-to-edge gameplay.

## 🕹️ How to Play

1. **Allow Camera Access:** When you open the game, your browser will ask for permission to use your webcam. You must allow this to play.
2. **Step Back:** Make sure your hand is clearly visible in the webcam footage window.
3. **Start the Game:** Click the **Start** button or press **`P`** on your keyboard.
4. **Move Your Hand:** Move your hand up/down or left/right (depending on the layout) to control your green paddle. 
5. **Score Points:** Hit the ball past the red AI paddle to score points!

## 🛠️ Built With

* **HTML5 Canvas:** For rendering the game board, paddles, and ball.
* **Vanilla JavaScript:** Core game logic and physics.
* **[MediaPipe Hands](https://google.github.io/mediapipe/solutions/hands.html):** For lightweight, real-time hand-tracking directly in the browser.
* **Web Audio API:** For zero-latency, synthesized sound effects.

## 🤝 Contributing
Contributions, issues, and feature requests are welcome! Feel free to check the issues page.

## 📄 License
This project is open-source and available under the MIT License.
