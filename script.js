
const videoElement = document.getElementsByClassName('input_video')[0];
const canvasElement = document.getElementsByClassName('output_canvas')[0];
const canvasCtx = canvasElement.getContext('2d');

// --- AUDIO SYSTEM (Web Audio API) ---
const AudioContext = window.AudioContext || window.webkitAudioContext;
let audioCtx;

function initAudio() {
    if (!audioCtx) audioCtx = new AudioContext();
    if (audioCtx.state === 'suspended') audioCtx.resume();
}

function playTone(freq, type, duration, vol = 0.1, freqSweep = null) {
    if (!audioCtx) return;
    const oscillator = audioCtx.createOscillator();
    const gainNode = audioCtx.createGain();
    
    oscillator.type = type;
    oscillator.frequency.setValueAtTime(freq, audioCtx.currentTime);
    
    if (freqSweep) {
        oscillator.frequency.exponentialRampToValueAtTime(freqSweep, audioCtx.currentTime + duration);
    }
    
    gainNode.gain.setValueAtTime(vol, audioCtx.currentTime);
    gainNode.gain.exponentialRampToValueAtTime(0.01, audioCtx.currentTime + duration);
    
    oscillator.connect(gainNode);
    gainNode.connect(audioCtx.destination);
    
    oscillator.start();
    oscillator.stop(audioCtx.currentTime + duration);
}

const sfx = {
    paddle: () => playTone(600, 'square', 0.1),
    wall: () => playTone(300, 'square', 0.1),
    // Friendly, happy double-beep for the player
    playerScore: () => {
        playTone(600, 'sine', 0.1, 0.15, 800);
        setTimeout(() => playTone(800, 'sine', 0.2, 0.15, 1200), 100);
    },
    // Dull, sad descending tone for the AI
    aiScore: () => playTone(150, 'sawtooth', 0.4, 0.2, 50),
    start: () => playTone(400, 'square', 0.3, 0.1, 800)
};

// --- FEATURE STATES ---
let showFootage = true;
let isVertical = false; 
let isSwapped = true;  
let isPlaying = false; 

// --- PLAYER IDENTITY (name gate) ---
const PLAYER_NAME_KEY = 'bytecraft_pong_player_v1';
let playerName = (localStorage.getItem(PLAYER_NAME_KEY) || '').trim();
const nameModal = document.getElementById('name-modal');
const nameForm = document.getElementById('name-form');
const nameInput = document.getElementById('player-name-input');
const playerBadge = document.getElementById('player-badge');
const btnPlayPause = document.getElementById('btn-playpause');

function refreshPlayerBadge() {
    if (!playerName) { playerBadge.hidden = true; return; }
    playerBadge.hidden = false;
    playerBadge.textContent = `Playing as: ${playerName}`;
}

function showNameModal() {
    nameInput.value = playerName;
    nameModal.hidden = false;
    setTimeout(() => nameInput.focus(), 50);
}

function hideNameModal() { nameModal.hidden = true; nameInput.blur(); }

function pauseGame() {
    isPlaying = false;
    btnPlayPause.innerText = "Start (P)";
    btnPlayPause.style.backgroundColor = "#1a5c2b";
}

function setPlayerName(name) {
    playerName = name.trim().slice(0, 20);
    localStorage.setItem(PLAYER_NAME_KEY, playerName);
    refreshPlayerBadge();
    renderBoard();
    hideNameModal();
}

nameForm.addEventListener('submit', (e) => {
    e.preventDefault();
    const value = nameInput.value.trim();
    if (!value) { nameInput.focus(); return; }
    initAudio();
    setPlayerName(value);
    if (pendingAutoStart) {
        // Came from New Game: jump straight into the fresh match.
        pendingAutoStart = false;
        isPlaying = true;
        btnPlayPause.innerText = "Pause (P)";
        btnPlayPause.style.backgroundColor = "#7a2222";
        if (ballHeld) armCountdown(); // fresh 2s so the new user can get ready
        sfx.start();
    }
});

document.getElementById('btn-name').addEventListener('click', () => {
    pauseGame();
    showNameModal();
});

// --- SCOREBOARD (scores.json seed + localStorage DB) ---
// Browser JS cannot write back to scores.json on disk, so scores.json is the
// read-only seed and localStorage is the writable store with the same shape:
// [{ name, score, aiScore, date }] — score = player points, aiScore = points
// the AI scored in that match (used as a tiebreaker).
const SCORE_DB_KEY = 'bytecraft_pong_scores_v1';
const MAX_BOARD_ENTRIES = 10;
const MEDALS = ['🥇', '🥈', '🥉'];
let scoreBoard = [];
const scoreList = document.getElementById('score-list');

async function loadBoard() {
    let seed = [];
    try {
        const res = await fetch('scores.json', { cache: 'no-store' });
        if (res.ok) {
            const data = await res.json();
            if (Array.isArray(data)) seed = data;
        }
    } catch { /* file:// or offline — fall back to localStorage only */ }
    const storedRaw = localStorage.getItem(SCORE_DB_KEY);
    if (storedRaw === null) {
        scoreBoard = seed;
    } else {
        try {
            const parsed = JSON.parse(storedRaw);
            scoreBoard = Array.isArray(parsed) ? parsed : seed;
        } catch { scoreBoard = seed; }
    }
    sortBoard(); // a hand-edited seed may be unsorted
    renderBoard();
}

function persistBoard() {
    try { localStorage.setItem(SCORE_DB_KEY, JSON.stringify(scoreBoard)); } catch {}
}

function renderBoard() {
    scoreList.innerHTML = '';
    if (scoreBoard.length === 0) {
        const li = document.createElement('li');
        li.className = 'score-empty';
        li.textContent = '🏓 No scores yet — be the first!';
        scoreList.appendChild(li);
        return;
    }
    scoreBoard.forEach((entry, i) => {
        const li = document.createElement('li');
        if (entry.name === playerName) li.classList.add('me');

        const rank = document.createElement('span');
        rank.className = 'score-rank' + (i < 3 ? '' : ' num');
        rank.textContent = MEDALS[i] || `${i + 1}.`;
        li.appendChild(rank);

        const nameSpan = document.createElement('span');
        nameSpan.className = 'score-name';
        nameSpan.textContent = entry.name;
        if (entry.date) nameSpan.title = new Date(entry.date).toLocaleString();
        li.appendChild(nameSpan);

        const pts = document.createElement('span');
        pts.className = 'score-points';
        // Show the full scoreline when known, otherwise just the points.
        pts.textContent = (typeof entry.aiScore === 'number')
            ? `${entry.score}-${entry.aiScore}`
            : `${entry.score}`;
        li.appendChild(pts);
        scoreList.appendChild(li);
    });
}

// Ranking: more points wins, then the better scoreline (5-0 beats 5-1),
// then whoever got there first. Legacy entries with no aiScore/date sort last
// within their score group.
function compareEntries(a, b) {
    if (b.score !== a.score) return b.score - a.score;
    const aAi = typeof a.aiScore === 'number' ? a.aiScore : Infinity;
    const bAi = typeof b.aiScore === 'number' ? b.aiScore : Infinity;
    if (aAi !== bAi) return aAi - bAi;
    return String(a.date || '').localeCompare(String(b.date || ''));
}

function sortBoard() {
    scoreBoard.sort(compareEntries);
    scoreBoard = scoreBoard.slice(0, MAX_BOARD_ENTRIES);
}

function recordPlayerScore() {
    if (!playerName || player.score <= 0) return;
    const stamp = new Date().toISOString();
    const existing = scoreBoard.find((e) => e.name === playerName);
    if (existing) {
        const sameScore = player.score === existing.score;
        const betterScoreline = sameScore && ai.score < (typeof existing.aiScore === 'number' ? existing.aiScore : Infinity);
        if (player.score > existing.score || betterScoreline) {
            existing.score = player.score;
            existing.aiScore = ai.score;
            existing.date = stamp;
        } else return; // same or worse — keep the earlier/better result
    } else {
        scoreBoard.push({ name: playerName, score: player.score, aiScore: ai.score, date: stamp });
    }
    sortBoard();
    persistBoard();
    renderBoard();
}

document.getElementById('btn-clear-scores').addEventListener('click', () => {
    scoreBoard = [];
    persistBoard();
    renderBoard();
});

const PADDLE_LONG = 100;
const PADDLE_SHORT = 20;

// --- KEYBOARD SHORTCUTS ---
document.addEventListener('keydown', (e) => {
    if (e.key.toLowerCase() !== 'p') return;
    // Only bail if the name field itself has focus — otherwise a name like
    // "Poppy" would toggle play. The card being merely visible must NOT block
    // the shortcut; the button handler decides (no name yet -> show the card).
    if (document.activeElement === nameInput) return;
    e.preventDefault();
    btnPlayPause.click();
});

// --- MATCH RULES (first to 5 wins) ---
const WIN_SCORE = 5;
let gameOver = false;
let winner = null; // 'player' | 'ai' | null

function endMatch(matchWinner) {
    gameOver = true;
    winner = matchWinner;
    isPlaying = false;
    btnPlayPause.innerText = "Play Again (P)";
    btnPlayPause.style.backgroundColor = "#1a5c2b";
    ball.x = canvasElement.width / 2;
    ball.y = canvasElement.height / 2;
    ball.vx = 0;
    ball.vy = 0;
    ballHeld = true;
    recordPlayerScore(); // make sure the final name + score lands on the board
    if (matchWinner === 'player') sfx.playerScore();
    else sfx.aiScore();
    showGameOverModal(); // session ends here: score + rank + New Game button
}

// --- BUTTON EVENT LISTENERS ---

// Returns true when the match just ended.
function checkMatchEnd() {
    if (player.score >= WIN_SCORE) { endMatch('player'); return true; }
    if (ai.score >= WIN_SCORE) { endMatch('ai'); return true; }
    return false;
}

// --- GAME-OVER SCREEN (session ends after one match) ---
const gameoverModal = document.getElementById('gameover-modal');
const gameoverTitle = document.getElementById('gameover-title');
const gameoverScore = document.getElementById('gameover-score');
const gameoverRank = document.getElementById('gameover-rank');

function playerRank() {
    const idx = scoreBoard.findIndex((e) => e.name === playerName);
    return idx === -1 ? null : idx + 1;
}

function showGameOverModal() {
    const name = (playerName || 'Player').slice(0, 20);
    const won = winner === 'player';
    gameoverTitle.textContent = won ? `🏆 ${name} won!` : '🤖 AI wins — you didn\'t win';
    gameoverScore.textContent = `${name} ${player.score}-${ai.score} AI`;
    const rank = playerRank();
    const medal = rank !== null && rank <= 3 ? ` ${MEDALS[rank - 1]}` : '';
    gameoverRank.textContent = rank === null
        ? 'Unranked — outside the top 10'
        : `Your rank: #${rank}${medal}`;
    gameoverModal.hidden = false;
}

function hideGameOverModal() { gameoverModal.hidden = true; }

// Set when the next name entry should kick off a match immediately.
let pendingAutoStart = false;

function startNewMatch() {
    initAudio();
    hideGameOverModal();
    resetGame();
    // New session = new identity: clear the old name so a new user must type theirs.
    playerName = '';
    localStorage.removeItem(PLAYER_NAME_KEY);
    refreshPlayerBadge();
    renderBoard();
    pendingAutoStart = true;
    showNameModal(); // prefilled empty since playerName was cleared
}

document.getElementById('btn-newgame').addEventListener('click', startNewMatch);
btnPlayPause.addEventListener('click', (e) => {
    if (!playerName) { showNameModal(); return; }
    initAudio();
    if (gameOver) {
        startNewMatch(); // new session: resets, then prompts for the (new) player name
        return;
    }
    isPlaying = !isPlaying;
    e.target.innerText = isPlaying ? "Pause (P)" : "Start (P)";
    e.target.style.backgroundColor = isPlaying ? "#7a2222" : "#1a5c2b"; 
    if (isPlaying) {
        if (ballHeld) armCountdown(); // fresh 2s every (re)start so the user can get ready
        sfx.start();
    }
});

document.getElementById('btn-footage').addEventListener('click', () => {
    showFootage = !showFootage;
});

document.getElementById('btn-mode').addEventListener('click', (e) => {
    isVertical = !isVertical;
    e.target.innerText = isVertical ? "Change Mode (Horizontal)" : "Change Mode (Vertical)";
    updatePaddleDimensions();
    resetGame();
});

document.getElementById('btn-switch').addEventListener('click', () => {
    isSwapped = !isSwapped;
    resetGame();
});

document.getElementById('btn-fullscreen').addEventListener('click', () => {
    if (!document.fullscreenElement) {
        document.documentElement.requestFullscreen().catch(err => {
            console.log(`Error attempting to enable fullscreen: ${err.message}`);
        });
    } else {
        document.exitFullscreen();
    }
});

// --- PHYSICS SETTINGS ---
const SUBSTEPS = 10; 

// --- POINTER TRACKING VARIABLES ---
let targetPointerX = 320; 
let targetPointerY = 240;
let currentPointerX = 320; 
let currentPointerY = 240;
const SMOOTHING_FACTOR = 0.5;

// --- BALL LAUNCH COUNTDOWN (2s to get ready) ---
const COUNTDOWN_MS = 2000;
let ballHeld = true;
let countdownEnd = 0;
let pendingVx = 0;
let pendingVy = 0;
let lastCountdownSec = 0;

function computeLaunchVelocity() {
    const speed = ball.minSpeed;
    if (!isVertical) {
        const directionX = isSwapped ? 1 : -1;
        return { vx: directionX * speed, vy: (Math.random() * 2 - 1) * speed * 0.7 };
    }
    const directionY = isSwapped ? -1 : 1;
    return { vx: (Math.random() * 2 - 1) * speed * 0.7, vy: directionY * speed };
}

function armCountdown() {
    ballHeld = true;
    countdownEnd = Date.now() + COUNTDOWN_MS;
    lastCountdownSec = Math.ceil(COUNTDOWN_MS / 1000);
}

// --- GAME VARIABLES ---
const ball = { x: 320, y: 240, vx: 0, vy: 0, radius: 10, speed: 5, minSpeed: 6, maxSpeed: 30 };
const player = { width: PADDLE_SHORT, height: PADDLE_LONG, score: 0 };
const ai = { x: 600, y: 240, width: PADDLE_SHORT, height: PADDLE_LONG, score: 0, speed: 6 };
const AI_DEADZONE = 22; // AI ignores small offsets — a beatable amount of slop

// AI only chases when the ball is coming at it, otherwise it drifts to center.
function ballComingAtAI() {
    if (ballHeld) return false;
    if (!isVertical) {
        const aiOnLeft = ai.x < canvasElement.width / 2;
        return aiOnLeft ? ball.vx < 0 : ball.vx > 0;
    }
    const aiOnTop = ai.y < canvasElement.height / 2;
    return aiOnTop ? ball.vy < 0 : ball.vy > 0;
}

// Player stays on their own half — the middle line is a wall for the paddle.
function clampPlayerToSide() {
    const W = canvasElement.width;
    const H = canvasElement.height;
    currentPointerX = clamp(currentPointerX, player.width / 2, W - player.width / 2);
    currentPointerY = clamp(currentPointerY, player.height / 2, H - player.height / 2);
    targetPointerX = clamp(targetPointerX, player.width / 2, W - player.width / 2);
    targetPointerY = clamp(targetPointerY, player.height / 2, H - player.height / 2);
    if (!isVertical) {
        if (isSwapped) currentPointerX = Math.max(currentPointerX, W / 2 + player.width / 2); // player: right half
        else currentPointerX = Math.min(currentPointerX, W / 2 - player.width / 2);           // player: left half
    } else {
        if (isSwapped) currentPointerY = Math.min(currentPointerY, H / 2 - player.height / 2); // player: top half
        else currentPointerY = Math.max(currentPointerY, H / 2 + player.height / 2);           // player: bottom half
    }
}

function movePlayerToOwnHalf() {
    const W = canvasElement.width;
    const H = canvasElement.height;
    if (!isVertical) {
        currentPointerX = targetPointerX = isSwapped ? W * 0.75 : W * 0.25;
        currentPointerY = targetPointerY = H / 2;
    } else {
        currentPointerX = targetPointerX = W / 2;
        currentPointerY = targetPointerY = isSwapped ? H * 0.25 : H * 0.75;
    }
}

function updatePaddleDimensions() {
    player.width = isVertical ? PADDLE_LONG : PADDLE_SHORT;
    player.height = isVertical ? PADDLE_SHORT : PADDLE_LONG;
    ai.width = isVertical ? PADDLE_LONG : PADDLE_SHORT;
    ai.height = isVertical ? PADDLE_SHORT : PADDLE_LONG;
    movePlayerToOwnHalf();
}

function resetGame() {
    player.score = 0;
    ai.score = 0;
    gameOver = false;
    winner = null;
    hideGameOverModal();
    resetBall();
}

function resetBall() {
    ball.x = canvasElement.width / 2;
    ball.y = canvasElement.height / 2;
    ball.speed = ball.minSpeed;
    ball.vx = 0;
    ball.vy = 0;
    const v = computeLaunchVelocity();
    pendingVx = v.vx;
    pendingVy = v.vy;
    armCountdown();
}

function clamp(val, min, max) { return Math.max(min, Math.min(max, val)); }

function getBallColor(currentSpeed, min, max) {
    const ratio = (currentSpeed - min) / (max - min);
    if (ratio < 0.5) {
        const normalized = ratio * 2; 
        const blue = Math.round(255 * (1 - normalized));
        return `rgb(255, 255, ${blue})`;
    } else {
        const normalized = (ratio - 0.5) * 2; 
        const green = Math.round(255 * (1 - normalized));
        return `rgb(255, ${green}, 0)`;
    }
}

function handleRectCollision(rectCenterX, rectCenterY, rectWidth, rectHeight, paddleVelocityX, paddleVelocityY) {
    const left = rectCenterX - rectWidth / 2;
    const right = rectCenterX + rectWidth / 2;
    const top = rectCenterY - rectHeight / 2;
    const bottom = rectCenterY + rectHeight / 2;

    const closestX = clamp(ball.x, left, right);
    const closestY = clamp(ball.y, top, bottom);

    const distanceX = ball.x - closestX;
    const distanceY = ball.y - closestY;
    const distanceSquared = (distanceX * distanceX) + (distanceY * distanceY);

    if (distanceSquared <= ball.radius * ball.radius) {
        let bounced = false;
        const overlapLeft = (ball.x + ball.radius) - left;
        const overlapRight = right - (ball.x - ball.radius);
        const overlapTop = (ball.y + ball.radius) - top;
        const overlapBottom = bottom - (ball.y - ball.radius);

        const minOverlap = Math.min(overlapLeft, overlapRight, overlapTop, overlapBottom);

        if (minOverlap === overlapLeft) { ball.x = left - ball.radius; ball.vx = -Math.abs(ball.vx); bounced = true; } 
        else if (minOverlap === overlapRight) { ball.x = right + ball.radius; ball.vx = Math.abs(ball.vx); bounced = true; } 
        else if (minOverlap === overlapTop) { ball.y = top - ball.radius; ball.vy = -Math.abs(ball.vy); bounced = true; } 
        else if (minOverlap === overlapBottom) { ball.y = bottom + ball.radius; ball.vy = Math.abs(ball.vy); bounced = true; }

        if (bounced) sfx.paddle(); 

        ball.vx += paddleVelocityX * 0.7; 
        ball.vy += paddleVelocityY * 0.7;

        if (!isVertical && (minOverlap === overlapLeft || minOverlap === overlapRight)) {
            const relativeIntersectY = (rectCenterY - ball.y) / (rectHeight / 2);
            ball.vy -= relativeIntersectY * 4; 
        } else if (isVertical && (minOverlap === overlapTop || minOverlap === overlapBottom)) {
            const relativeIntersectX = (rectCenterX - ball.x) / (rectWidth / 2);
            ball.vx -= relativeIntersectX * 4; 
        }

        let rawSpeed = Math.sqrt(ball.vx * ball.vx + ball.vy * ball.vy);
        ball.speed = clamp(rawSpeed, ball.minSpeed, ball.maxSpeed);

        ball.vx = (ball.vx / rawSpeed) * ball.speed;
        ball.vy = (ball.vy / rawSpeed) * ball.speed;
    }
}

function onResults(results) {
    canvasCtx.save();
    canvasCtx.clearRect(0, 0, canvasElement.width, canvasElement.height);
    
    if (showFootage) {
        canvasCtx.save();
        canvasCtx.scale(-1, 1);
        canvasCtx.drawImage(results.image, -canvasElement.width, 0, canvasElement.width, canvasElement.height);
        canvasCtx.restore();
    } else {
        canvasCtx.fillStyle = '#000000';
        canvasCtx.fillRect(0, 0, canvasElement.width, canvasElement.height);
    }

    if (results.multiHandLandmarks && results.multiHandLandmarks.length > 0) {
        const landmarks = results.multiHandLandmarks[0];
        if (landmarks && landmarks[8]) {
            const indexTip = landmarks[8]; 
            targetPointerX = (1 - indexTip.x) * canvasElement.width;
            targetPointerY = indexTip.y * canvasElement.height;
        }
    }

    let totalPaddleDx = (targetPointerX - currentPointerX) * SMOOTHING_FACTOR;
    let totalPaddleDy = (targetPointerY - currentPointerY) * SMOOTHING_FACTOR;

    const now = Date.now();
    if (isPlaying && ballHeld && now >= countdownEnd) {
        ballHeld = false; // launch!
        ball.vx = pendingVx;
        ball.vy = pendingVy;
        ball.speed = ball.minSpeed;
    }
    if (isPlaying && ballHeld) {
        const secs = Math.max(1, Math.ceil((countdownEnd - now) / 1000));
        if (secs !== lastCountdownSec) {
            lastCountdownSec = secs;
            sfx.start();
        }
    }

    if (isPlaying && !ballHeld && ball.speed > ball.minSpeed) {
        ball.speed = Math.max(ball.minSpeed, ball.speed * 0.997);
        const currentVectorSpeed = Math.sqrt(ball.vx * ball.vx + ball.vy * ball.vy);
        ball.vx = (ball.vx / currentVectorSpeed) * ball.speed;
        ball.vy = (ball.vy / currentVectorSpeed) * ball.speed;
    }

    let totalAiDx = 0;
    let totalAiDy = 0;
    if (!isVertical) {
        if (ballComingAtAI()) {
            if (ai.y < ball.y - AI_DEADZONE) totalAiDy = ai.speed;
            else if (ai.y > ball.y + AI_DEADZONE) totalAiDy = -ai.speed;
        } else {
            if (ai.y < 240 - AI_DEADZONE) totalAiDy = ai.speed * 0.5;
            else if (ai.y > 240 + AI_DEADZONE) totalAiDy = -ai.speed * 0.5;
        }
    } else {
        if (ballComingAtAI()) {
            if (ai.x < ball.x - AI_DEADZONE) totalAiDx = ai.speed;
            else if (ai.x > ball.x + AI_DEADZONE) totalAiDx = -ai.speed;
        } else {
            if (ai.x < 320 - AI_DEADZONE) totalAiDx = ai.speed * 0.5;
            else if (ai.x > 320 + AI_DEADZONE) totalAiDx = -ai.speed * 0.5;
        }
    }

    for (let i = 0; i < SUBSTEPS; i++) {
        currentPointerX += totalPaddleDx / SUBSTEPS;
        currentPointerY += totalPaddleDy / SUBSTEPS;
        clampPlayerToSide();

        ai.x += totalAiDx / SUBSTEPS;
        ai.y += totalAiDy / SUBSTEPS;
        
        if (!isVertical) {
            ai.x = isSwapped ? 40 : 600; 
            ai.y = Math.max(ai.height / 2, Math.min(canvasElement.height - ai.height / 2, ai.y));
        } else {
            ai.y = isSwapped ? 440 : 40; 
            ai.x = Math.max(ai.width / 2, Math.min(canvasElement.width - ai.width / 2, ai.x));
        }

        if (isPlaying && !ballHeld) {
            ball.x += ball.vx / SUBSTEPS;
            ball.y += ball.vy / SUBSTEPS;

            if (!isVertical) {
                if (ball.y - ball.radius <= 0) { ball.vy = Math.abs(ball.vy); ball.y = ball.radius; sfx.wall(); } 
                else if (ball.y + ball.radius >= canvasElement.height) { ball.vy = -Math.abs(ball.vy); ball.y = canvasElement.height - ball.radius; sfx.wall(); }

                if (ball.x < 0) {
                    if (!isSwapped) { ai.score++; sfx.aiScore(); } 
                    else { player.score++; sfx.playerScore(); recordPlayerScore(); }
                    if (!checkMatchEnd()) resetBall();
                    break; 
                } else if (ball.x > canvasElement.width) {
                    if (!isSwapped) { player.score++; sfx.playerScore(); recordPlayerScore(); } 
                    else { ai.score++; sfx.aiScore(); }
                    if (!checkMatchEnd()) resetBall();
                    break; 
                }
            } else {
                if (ball.x - ball.radius <= 0) { ball.vx = Math.abs(ball.vx); ball.x = ball.radius; sfx.wall(); } 
                else if (ball.x + ball.radius >= canvasElement.width) { ball.vx = -Math.abs(ball.vx); ball.x = canvasElement.width - ball.radius; sfx.wall(); }

                if (ball.y < 0) {
                    if (!isSwapped) { player.score++; sfx.playerScore(); recordPlayerScore(); } 
                    else { ai.score++; sfx.aiScore(); }
                    if (!checkMatchEnd()) resetBall();
                    break;
                } else if (ball.y > canvasElement.height) {
                    if (!isSwapped) { ai.score++; sfx.aiScore(); } 
                    else { player.score++; sfx.playerScore(); recordPlayerScore(); }
                    if (!checkMatchEnd()) resetBall();
                    break;
                }
            }

            handleRectCollision(currentPointerX, currentPointerY, player.width, player.height, totalPaddleDx, totalPaddleDy);
            handleRectCollision(ai.x, ai.y, ai.width, ai.height, 0, 0); 
        }
    }

    canvasCtx.beginPath();
    if (!isVertical) {
        canvasCtx.moveTo(canvasElement.width / 2, 0);
        canvasCtx.lineTo(canvasElement.width / 2, canvasElement.height);
    } else {
        canvasCtx.moveTo(0, canvasElement.height / 2);
        canvasCtx.lineTo(canvasElement.width, canvasElement.height / 2);
    }
    canvasCtx.strokeStyle = "rgba(255, 255, 255, 0.45)";
    canvasCtx.setLineDash([14, 10]);
    canvasCtx.lineWidth = 3;
    canvasCtx.stroke();
    canvasCtx.setLineDash([]);

    canvasCtx.fillStyle = 'rgba(0, 230, 118, 0.9)'; 
    canvasCtx.fillRect(currentPointerX - player.width / 2, currentPointerY - player.height / 2, player.width, player.height);
    canvasCtx.strokeStyle = '#FFFFFF';
    canvasCtx.lineWidth = 2;
    canvasCtx.strokeRect(currentPointerX - player.width / 2, currentPointerY - player.height / 2, player.width, player.height);

    canvasCtx.fillStyle = 'rgba(255, 82, 82, 0.9)'; 
    canvasCtx.fillRect(ai.x - ai.width / 2, ai.y - ai.height / 2, ai.width, ai.height);
    canvasCtx.strokeStyle = '#FFFFFF';
    canvasCtx.lineWidth = 2;
    canvasCtx.strokeRect(ai.x - ai.width / 2, ai.y - ai.height / 2, ai.width, ai.height);

    canvasCtx.beginPath();
    canvasCtx.arc(ball.x, ball.y, ball.radius, 0, 2 * Math.PI);
    canvasCtx.fillStyle = getBallColor(ball.speed, ball.minSpeed, ball.maxSpeed);
    canvasCtx.fill();
    canvasCtx.shadowBlur = ball.speed; 
    canvasCtx.shadowColor = canvasCtx.fillStyle;
    canvasCtx.shadowBlur = 0; 
    
    canvasCtx.font = "bold 24px monospace";
    canvasCtx.fillStyle = "rgba(0, 230, 118, 1)";
    const displayName = (playerName || 'PLAYER').toUpperCase().slice(0, 12);
    canvasCtx.fillText(`${displayName}: ${player.score}`, 20, 40);
    
    canvasCtx.fillStyle = "rgba(255, 82, 82, 1)";
    const aiText = `AI: ${ai.score}`;
    const textMetrics = canvasCtx.measureText(aiText);
    canvasCtx.fillText(aiText, canvasElement.width - textMetrics.width - 20, 40);

    if (isPlaying && ballHeld) {
        const remaining = Math.max(0, countdownEnd - now);
        const secs = Math.max(1, Math.ceil(remaining / 1000));
        canvasCtx.fillStyle = "rgba(0, 0, 0, 0.45)";
        canvasCtx.fillRect(0, 0, canvasElement.width, canvasElement.height);
        canvasCtx.textAlign = "center";
        canvasCtx.font = "bold 72px monospace";
        canvasCtx.fillStyle = "#FFFFFF";
        canvasCtx.fillText(`${secs}`, canvasElement.width / 2, canvasElement.height / 2);
        canvasCtx.font = "16px system-ui, sans-serif";
        canvasCtx.fillStyle = "#E0E0E0";
        canvasCtx.fillText("Get ready…", canvasElement.width / 2, canvasElement.height / 2 + 34);
        canvasCtx.textAlign = "left";
    }

    if (gameOver) {
        canvasCtx.fillStyle = "rgba(0, 0, 0, 0.45)";
        canvasCtx.fillRect(0, 0, canvasElement.width, canvasElement.height);
        canvasCtx.textAlign = "center";
        const name = (playerName || 'PLAYER').toUpperCase().slice(0, 12);
        if (winner === 'player') {
            canvasCtx.font = "bold 44px monospace";
            canvasCtx.fillStyle = "#00e676";
            canvasCtx.fillText(`🏆 ${name} WON!`, canvasElement.width / 2, canvasElement.height / 2 - 10);
        } else {
            canvasCtx.font = "bold 44px monospace";
            canvasCtx.fillStyle = "#ff5252";
            canvasCtx.fillText("🤖 AI WINS!", canvasElement.width / 2, canvasElement.height / 2 - 10);
            canvasCtx.font = "20px system-ui, sans-serif";
            canvasCtx.fillStyle = "#E0E0E0";
            canvasCtx.fillText("😔 You didn't win this time.", canvasElement.width / 2, canvasElement.height / 2 + 22);
        }
        canvasCtx.font = "20px monospace";
        canvasCtx.fillStyle = "#FFFFFF";
        canvasCtx.fillText(`${player.score}-${ai.score}`, canvasElement.width / 2, canvasElement.height / 2 + 52);
        canvasCtx.font = "16px system-ui, sans-serif";
        canvasCtx.fillStyle = "#E0E0E0";
        canvasCtx.fillText("Press 'P' to play again.", canvasElement.width / 2, canvasElement.height / 2 + 78);
        canvasCtx.textAlign = "left";
    }

    if (!isPlaying && !gameOver) {
        canvasCtx.fillStyle = "rgba(0, 0, 0, 0.25)";
        canvasCtx.fillRect(0, 0, canvasElement.width, canvasElement.height);
        
        canvasCtx.textAlign = "center";
        
        canvasCtx.font = "bold 48px monospace";
        canvasCtx.fillStyle = "#FFFFFF";
        canvasCtx.fillText("PAUSED", canvasElement.width / 2, canvasElement.height / 2 - 20);
        
        canvasCtx.font = "16px system-ui, sans-serif";
        canvasCtx.fillStyle = "#E0E0E0";
        canvasCtx.fillText("Move your hand in front of the camera", canvasElement.width / 2, canvasElement.height / 2 + 25);
        canvasCtx.fillText("to control your paddle. Press 'P' to Play/Pause.", canvasElement.width / 2, canvasElement.height / 2 + 50);

        canvasCtx.textAlign = "left"; 
    }

    canvasCtx.restore();
}

const hands = new Hands({locateFile: (file) => {
    return `https://cdn.jsdelivr.net/npm/@mediapipe/hands/${file}`;
}});

hands.setOptions({ maxNumHands: 1, modelComplexity: 0, minDetectionConfidence: 0.5, minTrackingConfidence: 0.5 });
hands.onResults(onResults);

const camera = new Camera(videoElement, {
    onFrame: async () => { await hands.send({image: videoElement}); },
    width: 640, height: 480
});

camera.start();
updatePaddleDimensions();
resetBall();
refreshPlayerBadge();
loadBoard();
showNameModal();
