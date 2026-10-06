
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
    start: () => playTone(400, 'square', 0.3, 0.1, 800),
    winnerFanfare: () => {
        playTone(523.25, 'triangle', 0.15, 0.2); // C5
        setTimeout(() => playTone(659.25, 'triangle', 0.15, 0.2), 120); // E5
        setTimeout(() => playTone(783.99, 'triangle', 0.15, 0.2), 240); // G5
        setTimeout(() => playTone(1046.50, 'triangle', 0.45, 0.25), 360); // C6
    }
};

// --- FEATURE STATES ---
let showFootage = true;
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
    btnPlayPause.style.backgroundColor = "";
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
// [{ name, score, aiScore, date, difficulty }]
//   score      = player points
//   aiScore    = points the AI scored that match (scoreline tiebreaker)
//   difficulty = which board the entry belongs to; missing = 'normal' (legacy)
const SCORE_DB_KEY = 'bytecraft_pong_scores_v1';
const MAX_BOARD_ENTRIES = 10; // per difficulty, not overall
const MEDALS = ['🥇', '🥈', '🥉'];
let scoreBoard = []; // every difficulty lives here, tagged and filtered
const scoreList = document.getElementById('score-list');
const scoreDiffLabel = document.getElementById('score-diff-label');
const btnClearScores = document.getElementById('btn-clear-scores');

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

// Legacy rows (saved before boards were split) count as Normal.
function entryDifficulty(entry) {
    return DIFFICULTY_ORDER.includes(entry.difficulty) ? entry.difficulty : 'normal';
}

// One independent leaderboard per difficulty, already ranked and trimmed.
function boardFor(key) {
    return scoreBoard
        .filter((e) => entryDifficulty(e) === key)
        .sort(compareEntries)
        .slice(0, MAX_BOARD_ENTRIES);
}

function renderBoard() {
    const rows = boardFor(difficultyKey);
    scoreDiffLabel.textContent = difficulty.label;
    btnClearScores.innerText = `Clear ${difficulty.label} Board`;

    scoreList.innerHTML = '';
    if (rows.length === 0) {
        const li = document.createElement('li');
        li.className = 'score-empty';
        li.textContent = `🏓 No ${difficulty.label} scores yet`;
        scoreList.appendChild(li);
        return;
    }
    rows.forEach((entry, i) => {
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

// Groups the array by difficulty, each group ranked. Trimming to the top 10 is
// per board, so it lives in boardFor() rather than here.
function sortBoard() {
    scoreBoard.sort((a, b) =>
        DIFFICULTY_ORDER.indexOf(entryDifficulty(a)) - DIFFICULTY_ORDER.indexOf(entryDifficulty(b))
        || compareEntries(a, b));
}

function recordPlayerScore() {
    if (!playerName || player.score <= 0) return;
    const stamp = new Date().toISOString();
    const existing = scoreBoard.find(
        (e) => e.name === playerName && entryDifficulty(e) === matchDifficulty);
    if (existing) {
        const sameScore = player.score === existing.score;
        const betterScoreline = sameScore && ai.score < (typeof existing.aiScore === 'number' ? existing.aiScore : Infinity);
        if (player.score > existing.score || betterScoreline) {
            existing.score = player.score;
            existing.aiScore = ai.score;
            existing.date = stamp;
        } else return; // same or worse — keep the earlier/better result
    } else {
        scoreBoard.push({
            name: playerName,
            score: player.score,
            aiScore: ai.score,
            date: stamp,
            difficulty: matchDifficulty
        });
    }
    sortBoard();
    persistBoard();
    renderBoard();
}

btnClearScores.addEventListener('click', () => {
    // Only the board on screen — Easy/Normal/Hard are kept apart.
    scoreBoard = scoreBoard.filter((e) => entryDifficulty(e) !== difficultyKey);
    persistBoard();
    renderBoard();
});

const PADDLE_LONG = 100;
const PADDLE_SHORT = 20;

// --- DIFFICULTY ---
// speed    : how fast the AI paddle tracks its target (px/frame)
// deadzone : how far off-target it tolerates before moving (slop/reaction error)
// lead     : 1 = aim where the ball will arrive (predicted), 0 = aim at the ball now
const DIFFICULTIES = {
    easy:   { label: 'Easy',   speed: 3.5, deadzone: 45, lead: 0 },
    normal: { label: 'Normal', speed: 6,   deadzone: 22, lead: 0 },
    hard:   { label: 'Hard',   speed: 9,   deadzone: 8,  lead: 1 }
};
const DIFFICULTY_ORDER = ['easy', 'normal', 'hard'];
let difficultyKey = 'normal';
let difficulty = DIFFICULTIES[difficultyKey];
// The difficulty a match STARTED on — kept so switching difficulty mid-match
// can't file the result under the wrong board.
let matchDifficulty = difficultyKey;

function applyDifficulty() {
    difficulty = DIFFICULTIES[difficultyKey];
    ai.speed = difficulty.speed;
    ai.deadzone = difficulty.deadzone;
}

const btnDifficulty = document.getElementById('btn-difficulty');

function cycleDifficulty() {
    difficultyKey = DIFFICULTY_ORDER[(DIFFICULTY_ORDER.indexOf(difficultyKey) + 1) % DIFFICULTY_ORDER.length];
    applyDifficulty();
    btnDifficulty.innerText = `Difficulty: ${difficulty.label}`;
    renderBoard(); // each difficulty shows its own leaderboard
}

btnDifficulty.addEventListener('click', cycleDifficulty);

// --- HAND MESH OVERLAY (shows the tracked landmarks) ---
const HAND_CONNECTIONS = [
    [0, 1], [1, 2], [2, 3], [3, 4],
    [0, 5], [5, 6], [6, 7], [7, 8],
    [5, 9], [9, 10], [10, 11], [11, 12],
    [9, 13], [13, 14], [14, 15], [15, 16],
    [13, 17], [17, 18], [18, 19], [19, 20],
    [0, 17]
];
let showMesh = false;

const btnMesh = document.getElementById('btn-mesh');

btnMesh.addEventListener('click', () => {
    showMesh = !showMesh;
    btnMesh.innerText = `Hand Mesh: ${showMesh ? 'On' : 'Off'}`;
});

// --- VISUAL EFFECTS (trail, particles, confetti, screen shake) ---
const TRAIL_LEN = 16;
const trail = [];
const particles = [];
const confetti = [];
const CONFETTI_COLORS = ['#ffd700', '#03a6ff', '#5546ff', '#00e676', '#ff007f', '#ffffff', '#ff9100'];
let shakeMag = 0;
let currentRally = 0;
let maxMatchRally = 0;

function addShake(mag) { shakeMag = Math.min(20, shakeMag + mag); }

function spawnConfetti(count = 35) {
    for (let i = 0; i < count; i++) {
        confetti.push({
            x: Math.random() * canvasElement.width,
            y: -10 - Math.random() * 40,
            w: 6 + Math.random() * 8,
            h: 4 + Math.random() * 6,
            color: CONFETTI_COLORS[Math.floor(Math.random() * CONFETTI_COLORS.length)],
            vx: (Math.random() - 0.5) * 4.5,
            vy: 2.2 + Math.random() * 3.8,
            angle: Math.random() * Math.PI * 2,
            rotSpeed: (Math.random() - 0.5) * 0.18,
            life: 1,
            decay: 0.003 + Math.random() * 0.005
        });
    }
}

function updateConfetti() {
    for (let i = confetti.length - 1; i >= 0; i--) {
        const c = confetti[i];
        c.x += c.vx;
        c.y += c.vy;
        c.vy += 0.04; // gentle gravity
        c.angle += c.rotSpeed;
        c.life -= c.decay;
        if (c.life <= 0 || c.y > canvasElement.height + 25) {
            confetti.splice(i, 1);
        }
    }
}

function drawConfetti() {
    for (const c of confetti) {
        canvasCtx.save();
        canvasCtx.globalAlpha = Math.max(0, Math.min(1, c.life));
        canvasCtx.translate(c.x, c.y);
        canvasCtx.rotate(c.angle);
        canvasCtx.fillStyle = c.color;
        canvasCtx.fillRect(-c.w / 2, -c.h / 2, c.w, c.h);
        canvasCtx.restore();
    }
}

// One place to award a point, so scoring, sfx, board and juice stay in sync.
function registerPoint(who, burstX, burstY) {
    currentRally = 0;
    if (who === 'player') {
        player.score++;
        sfx.playerScore();
        recordPlayerScore();
    } else {
        ai.score++;
        sfx.aiScore();
    }
    spawnBurst(burstX, burstY, who === 'player' ? '0, 230, 118' : '255, 82, 82');
    addShake(7);
}

function spawnBurst(x, y, rgb, count = 40, power = 5) {
    for (let i = 0; i < count; i++) {
        const angle = (Math.random() * 2 - 1) * Math.PI;
        const spd = (0.4 + Math.random()) * power;
        particles.push({
            x, y,
            vx: Math.cos(angle) * spd,
            vy: Math.sin(angle) * spd,
            life: 1,
            decay: 0.012 + Math.random() * 0.022,
            size: 1.5 + Math.random() * 3,
            rgb
        });
    }
}

function updateParticles() {
    for (let i = particles.length - 1; i >= 0; i--) {
        const p = particles[i];
        p.x += p.vx;
        p.y += p.vy;
        p.vx *= 0.975;
        p.vy *= 0.975;
        p.life -= p.decay;
        if (p.life <= 0) particles.splice(i, 1);
    }
}

function drawParticles() {
    for (const p of particles) {
        canvasCtx.globalAlpha = Math.max(0, p.life);
        canvasCtx.fillStyle = `rgb(${p.rgb})`;
        canvasCtx.beginPath();
        canvasCtx.arc(p.x, p.y, p.size * p.life, 0, Math.PI * 2);
        canvasCtx.fill();
    }
    canvasCtx.globalAlpha = 1;
}

function drawTrail() {
    for (let i = 0; i < trail.length; i++) {
        const p = trail[i];
        const t = (i + 1) / trail.length; // oldest = faintest
        canvasCtx.globalAlpha = t * 0.5;
        canvasCtx.fillStyle = getBallColor(p.speed, ball.minSpeed, ball.maxSpeed);
        canvasCtx.beginPath();
        canvasCtx.arc(p.x, p.y, ball.radius * t * 0.85, 0, Math.PI * 2);
        canvasCtx.fill();
    }
    canvasCtx.globalAlpha = 1;
}

// --- TELEMETRY HUD ---
const telemetry = { fps: 0, frames: 0, since: 0, inferenceMs: 0, lastSeen: 0, handedness: null, tracked: false };
let frameSentAt = 0;
let cameraActive = false;
let cameraError = null;

function drawTelemetry() {
    const lines = [
        `FPS ${telemetry.fps.toFixed(1)}  ·  AI ${telemetry.inferenceMs.toFixed(1)} ms`,
        telemetry.tracked
            ? `HAND LOCKED${telemetry.handedness ? ' ' + Math.round(telemetry.handedness.score * 100) + '%' : ''}`
            : (cameraError ? 'CAMERA WAITING — Click "Enable Camera"' : 'NO HAND — show your palm'),
        `${difficulty.label.toUpperCase()}  speed ${difficulty.speed}  deadzone ${difficulty.deadzone}  lead ${difficulty.lead}`
    ];
    canvasCtx.save();
    canvasCtx.font = "12px monospace";
    let width = 0;
    for (const line of lines) width = Math.max(width, canvasCtx.measureText(line).width);
    const boxW = width + 18;
    const boxH = lines.length * 16 + 12;
    const x = 12;
    const y = canvasElement.height - boxH - 12;
    canvasCtx.fillStyle = "rgba(6, 3, 26, 0.75)";
    canvasCtx.strokeStyle = "rgba(3, 166, 255, 0.4)";
    canvasCtx.lineWidth = 1;
    canvasCtx.beginPath();
    canvasCtx.rect(x, y, boxW, boxH);
    canvasCtx.fill();
    canvasCtx.stroke();
    canvasCtx.textAlign = "left";
    canvasCtx.fillStyle = "#9fe8ff";
    lines.forEach((line, i) => {
        canvasCtx.fillText(line, x + 9, y + 20 + i * 16);
    });
    canvasCtx.restore();
}

function drawHandMesh(landmarks) {
    const W = canvasElement.width, H = canvasElement.height;
    const px = (lm) => (1 - lm.x) * W; // mirrored to match the drawn feed
    const py = (lm) => lm.y * H;
    canvasCtx.save();
    canvasCtx.strokeStyle = "rgba(3, 166, 255, 0.85)";
    canvasCtx.lineWidth = 2;
    canvasCtx.beginPath();
    for (const [a, b] of HAND_CONNECTIONS) {
        const la = landmarks[a], lb = landmarks[b];
        if (!la || !lb) continue;
        canvasCtx.moveTo(px(la), py(la));
        canvasCtx.lineTo(px(lb), py(lb));
    }
    canvasCtx.stroke();
    canvasCtx.fillStyle = "#00e676";
    for (const lm of landmarks) {
        canvasCtx.beginPath();
        canvasCtx.arc(px(lm), py(lm), 3, 0, Math.PI * 2);
        canvasCtx.fill();
    }
    canvasCtx.restore();
}

// --- KEYBOARD SHORTCUTS ---
document.addEventListener('keydown', (e) => {
    // Only bail if the name field itself has focus — otherwise typing in name would trigger shortcuts
    if (document.activeElement === nameInput) return;
    const key = e.key.toLowerCase();
    if (key === 'p') {
        e.preventDefault();
        btnPlayPause.click();
    } else if (key === 's') {
        e.preventDefault();
        document.getElementById('btn-switch').click();
    } else if (key === 'f') {
        e.preventDefault();
        document.getElementById('btn-fullscreen').click();
    } else if (key === 'd') {
        e.preventDefault();
        document.getElementById('btn-difficulty').click();
    } else if (key === 'm') {
        e.preventDefault();
        document.getElementById('btn-mesh').click();
    } else if (key === 'v') {
        e.preventDefault();
        document.getElementById('btn-footage').click();
    }
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
    btnPlayPause.style.backgroundColor = "";
    ball.x = canvasElement.width / 2;
    ball.y = canvasElement.height / 2;
    ball.vx = 0;
    ball.vy = 0;
    ballHeld = true;
    recordPlayerScore(); // make sure the final name + score lands on the board
    if (matchWinner === 'player') {
        sfx.winnerFanfare();
        spawnConfetti(80);
        addShake(8);
    } else {
        sfx.aiScore();
    }
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
const gameoverRally = document.getElementById('gameover-rally');
const gameoverRank = document.getElementById('gameover-rank');

function playerRank() {
    const idx = boardFor(matchDifficulty).findIndex((e) => e.name === playerName);
    return idx === -1 ? null : idx + 1;
}

function showGameOverModal() {
    const name = (playerName || 'Player').slice(0, 20);
    const won = winner === 'player';
    gameoverTitle.textContent = won ? `🏆 ${name} Won!` : '🤖 AI Wins Match';
    gameoverScore.textContent = `${name} ${player.score} — ${ai.score} AI`;
    if (gameoverRally) {
        gameoverRally.textContent = `Longest Rally: ${maxMatchRally} hits · Speed: ${difficulty.speed}x`;
    }
    const rank = playerRank();
    const medal = rank !== null && rank <= 3 ? ` ${MEDALS[rank - 1]}` : '';
    const board = DIFFICULTIES[matchDifficulty].label;
    gameoverRank.textContent = rank === null
        ? `Unranked on the ${board} board — outside the top ${MAX_BOARD_ENTRIES}`
        : `${board} Leaderboard: #${rank}${medal}`;

    const modalDialog = gameoverModal.querySelector('.modal');
    if (modalDialog) {
        if (won) modalDialog.classList.add('is-winner');
        else modalDialog.classList.remove('is-winner');
    }
    const badge = document.getElementById('gameover-badge');
    if (badge) badge.textContent = won ? '🏆' : '🤖';

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
    e.target.style.backgroundColor = isPlaying ? "#e11d48" : ""; 
    if (isPlaying) {
        if (ballHeld) armCountdown(); // fresh 2s every (re)start so the user can get ready
        sfx.start();
    }
});

function updateFootageButtonText() {
    const btn = document.getElementById('btn-footage');
    if (!btn) return;
    if (cameraError || !cameraActive) {
        btn.innerText = 'Enable Camera (V)';
    } else {
        btn.innerText = showFootage ? 'Hide Footage (V)' : 'Show Footage (V)';
    }
}

document.getElementById('btn-footage').addEventListener('click', async () => {
    if (!cameraActive) {
        await startCamera();
    } else {
        showFootage = !showFootage;
    }
    updateFootageButtonText();
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

// --- POINTER TRACKING VARIABLES (Hand Landmark #8) ---
let targetPointerX = 320; 
let targetPointerY = 240;
let currentPointerX = 320; 
let currentPointerY = 240;
const SMOOTHING_FACTOR = 0.5;

// --- PHYSICS SETTINGS ---
const SUBSTEPS = 10;

// --- BALL LAUNCH COUNTDOWN (2s to get ready) ---
const COUNTDOWN_MS = 2000;
let ballHeld = true;
let countdownEnd = 0;
let pendingVx = 0;
let pendingVy = 0;
let lastCountdownSec = 0;

function computeLaunchVelocity() {
    const speed = ball.minSpeed;
    const directionX = isSwapped ? 1 : -1;
    return { vx: directionX * speed, vy: (Math.random() * 2 - 1) * speed * 0.7 };
}

function armCountdown() {
    ballHeld = true;
    countdownEnd = Date.now() + COUNTDOWN_MS;
    lastCountdownSec = Math.ceil(COUNTDOWN_MS / 1000);
}

// --- GAME VARIABLES ---
const ball = { x: 320, y: 240, vx: 0, vy: 0, radius: 10, speed: 5, minSpeed: 6, maxSpeed: 30 };
const player = { width: PADDLE_SHORT, height: PADDLE_LONG, score: 0 };
const ai = { x: 600, y: 240, width: PADDLE_SHORT, height: PADDLE_LONG, score: 0, speed: 6, deadzone: 22 };

// AI only chases when the ball is coming at it, otherwise it drifts to center.
function ballComingAtAI() {
    if (ballHeld) return false;
    const aiOnLeft = ai.x < canvasElement.width / 2;
    return aiOnLeft ? ball.vx < 0 : ball.vx > 0;
}

// Folds y past the top/bottom walls using a triangle wave — the standard
// trick for predicting a ball's position after N wall bounces.
function foldReflect(value, min, max) {
    const span = max - min;
    if (span <= 0) return min;
    let v = (value - min) % (2 * span);
    if (v < 0) v += 2 * span;
    if (v > span) v = 2 * span - v;
    return min + v;
}

// Where (and when) the ball will reach the AI's line. null if it is moving away.
function predictIntercept() {
    const H = canvasElement.height, r = ball.radius;
    if (Math.abs(ball.vx) < 0.0001) return null;
    const t = (ai.x - ball.x) / ball.vx;
    if (t <= 0) return null;
    return foldReflect(ball.y + ball.vy * t, r, H - r);
}

// Player stays on their own half — the middle line is a wall for the paddle.
function clampPlayerToSide() {
    const W = canvasElement.width;
    const H = canvasElement.height;
    currentPointerX = clamp(currentPointerX, player.width / 2, W - player.width / 2);
    currentPointerY = clamp(currentPointerY, player.height / 2, H - player.height / 2);
    targetPointerX = clamp(targetPointerX, player.width / 2, W - player.width / 2);
    targetPointerY = clamp(targetPointerY, player.height / 2, H - player.height / 2);
    if (isSwapped) currentPointerX = Math.max(currentPointerX, W / 2 + player.width / 2); // player: right half
    else currentPointerX = Math.min(currentPointerX, W / 2 - player.width / 2);           // player: left half
}

function movePlayerToOwnHalf() {
    const W = canvasElement.width;
    const H = canvasElement.height;
    currentPointerX = targetPointerX = isSwapped ? W * 0.75 : W * 0.25;
    currentPointerY = targetPointerY = H / 2;
}

function updatePaddleDimensions() {
    player.width = PADDLE_SHORT;
    player.height = PADDLE_LONG;
    ai.width = PADDLE_SHORT;
    ai.height = PADDLE_LONG;
    movePlayerToOwnHalf();
}

function resetGame() {
    player.score = 0;
    ai.score = 0;
    currentRally = 0;
    maxMatchRally = 0;
    gameOver = false;
    winner = null;
    matchDifficulty = difficultyKey; // results are filed under the match's difficulty
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

function handleRectCollision(rectCenterX, rectCenterY, rectWidth, rectHeight, paddleVelocityX, paddleVelocityY, paddleRgb = '255, 255, 255') {
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

        if (bounced) {
            sfx.paddle();
            currentRally++;
            if (currentRally > maxMatchRally) maxMatchRally = currentRally;
            // Impact feedback: sparks at the contact point + a shake scaled to
            // how hard the ball was hit (fast hits feel violent, soft ones don't).
            addShake(Math.min(7, ball.speed * 0.28));
            spawnBurst(ball.x, ball.y, paddleRgb, 12, 2.6);
        } 

        ball.vx += paddleVelocityX * 0.7; 
        ball.vy += paddleVelocityY * 0.7;

        // Side hit: angle the bounce off where the ball struck the paddle.
        if (minOverlap === overlapLeft || minOverlap === overlapRight) {
            const relativeIntersectY = (rectCenterY - ball.y) / (rectHeight / 2);
            ball.vy -= relativeIntersectY * 4; 
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
    
    // Telemetry: how fast we're rendering and how long inference took.
    const perfNow = performance.now();
    telemetry.frames++;
    if (!telemetry.since) telemetry.since = perfNow;
    if (perfNow - telemetry.since >= 500) {
        telemetry.fps = (telemetry.frames * 1000) / (perfNow - telemetry.since);
        telemetry.frames = 0;
        telemetry.since = perfNow;
    }
    if (frameSentAt) telemetry.inferenceMs = perfNow - frameSentAt;

    if (showFootage && results && results.image) {
        canvasCtx.save();
        canvasCtx.scale(-1, 1);
        canvasCtx.drawImage(results.image, -canvasElement.width, 0, canvasElement.width, canvasElement.height);
        canvasCtx.restore();
    } else {
        canvasCtx.fillStyle = '#050314';
        canvasCtx.fillRect(0, 0, canvasElement.width, canvasElement.height);
    }

    if (results && results.multiHandLandmarks && results.multiHandLandmarks.length > 0) {
        const landmarks = results.multiHandLandmarks[0];
        telemetry.tracked = true;
        telemetry.lastSeen = perfNow;
        const handedness = (results.multiHandedness || results.multiHandednesses);
        if (handedness && handedness[0] && handedness[0][0]) telemetry.handedness = handedness[0][0];
        if (showMesh) drawHandMesh(landmarks);
        if (landmarks && landmarks[8]) {
            const indexTip = landmarks[8]; 
            targetPointerX = (1 - indexTip.x) * canvasElement.width;
            targetPointerY = indexTip.y * canvasElement.height;
        }
    } else {
        telemetry.tracked = false;
    }

    // Screen shake applies to the game layer only, so the camera feed never
    // exposes an unpainted edge at the canvas border.
    if (shakeMag > 0.2) {
        canvasCtx.save();
        canvasCtx.translate((Math.random() - 0.5) * shakeMag, (Math.random() - 0.5) * shakeMag);
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

    let totalAiDy = 0;
    {
        const dead = ai.deadzone;
        let aim;
        if (ballComingAtAI()) {
            const intercept = difficulty.lead > 0 ? predictIntercept() : null;
            aim = intercept === null ? ball.y : intercept;
        } else {
            aim = canvasElement.height / 2; // ball is going away: reset toward the middle
        }

        if (ai.y < aim - dead) totalAiDy = ai.speed;        // aim is below the paddle
        else if (ai.y > aim + dead) totalAiDy = -ai.speed;   // aim is above the paddle
    }

    // Ball trail: exactly one sample per rendered frame while it's live.
    if (isPlaying && !ballHeld) {
        trail.push({ x: ball.x, y: ball.y, speed: ball.speed });
        if (trail.length > TRAIL_LEN) trail.shift();
    }

    for (let i = 0; i < SUBSTEPS; i++) {
        currentPointerX += totalPaddleDx / SUBSTEPS;
        currentPointerY += totalPaddleDy / SUBSTEPS;
        clampPlayerToSide();

        ai.y += totalAiDy / SUBSTEPS;

        // The AI never crosses the middle line.
        ai.x = isSwapped ? 40 : 600;
        ai.y = Math.max(ai.height / 2, Math.min(canvasElement.height - ai.height / 2, ai.y));

        if (isPlaying && !ballHeld) {
            ball.x += ball.vx / SUBSTEPS;
            ball.y += ball.vy / SUBSTEPS;

            if (ball.y - ball.radius <= 0) { ball.vy = Math.abs(ball.vy); ball.y = ball.radius; sfx.wall(); } 
            else if (ball.y + ball.radius >= canvasElement.height) { ball.vy = -Math.abs(ball.vy); ball.y = canvasElement.height - ball.radius; sfx.wall(); }

            if (ball.x < 0) {
                registerPoint(isSwapped ? 'player' : 'ai', 0, ball.y);
                if (!checkMatchEnd()) resetBall();
                break; 
            } else if (ball.x > canvasElement.width) {
                registerPoint(isSwapped ? 'ai' : 'player', canvasElement.width, ball.y);
                if (!checkMatchEnd()) resetBall();
                break; 
            }

            handleRectCollision(currentPointerX, currentPointerY, player.width, player.height, totalPaddleDx, totalPaddleDy, '0, 230, 118');
            handleRectCollision(ai.x, ai.y, ai.width, ai.height, 0, 0, '255, 82, 82'); 
        }
    }

    updateParticles();
    updateConfetti();
    drawTrail();

    canvasCtx.beginPath();
    canvasCtx.moveTo(canvasElement.width / 2, 0);
    canvasCtx.lineTo(canvasElement.width / 2, canvasElement.height);
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
    canvasCtx.arc(ball.x, ball.y, ball.radius, 0, Math.PI * 2);
    canvasCtx.fillStyle = getBallColor(ball.speed, ball.minSpeed, ball.maxSpeed);
    canvasCtx.fill();
    canvasCtx.shadowBlur = ball.speed; 
    canvasCtx.shadowColor = canvasCtx.fillStyle;
    canvasCtx.shadowBlur = 0; 

    drawParticles();
    drawConfetti();

    // Top HUD Score & Rally Display
    canvasCtx.save();
    const displayName = (playerName || 'PLAYER').toUpperCase().slice(0, 10);
    const pScoreText = `${displayName}: ${player.score}`;
    const aiScoreText = `AI: ${ai.score}`;

    // Score box - Player (Left or Right depending on isSwapped)
    const playerOnRight = isSwapped;
    const pX = playerOnRight ? canvasElement.width - 150 : 20;
    const aiX = playerOnRight ? 20 : canvasElement.width - 110;

    // Player Score Badge
    canvasCtx.fillStyle = "rgba(8, 5, 24, 0.75)";
    canvasCtx.strokeStyle = "rgba(0, 230, 118, 0.6)";
    canvasCtx.lineWidth = 1;
    canvasCtx.beginPath();
    canvasCtx.roundRect(pX - 6, 14, 136, 32, 6);
    canvasCtx.fill();
    canvasCtx.stroke();

    canvasCtx.font = "bold 15px monospace";
    canvasCtx.fillStyle = "#00e676";
    canvasCtx.textAlign = "center";
    canvasCtx.fillText(pScoreText, pX + 62, 35);

    // AI Score Badge
    canvasCtx.fillStyle = "rgba(8, 5, 24, 0.75)";
    canvasCtx.strokeStyle = "rgba(255, 82, 82, 0.6)";
    canvasCtx.lineWidth = 1;
    canvasCtx.beginPath();
    canvasCtx.roundRect(aiX - 6, 14, 96, 32, 6);
    canvasCtx.fill();
    canvasCtx.stroke();

    canvasCtx.font = "bold 15px monospace";
    canvasCtx.fillStyle = "#ff5252";
    canvasCtx.fillText(aiScoreText, aiX + 42, 35);

    // Live Center Rally Counter
    if (isPlaying && !ballHeld && currentRally > 0) {
        canvasCtx.fillStyle = "rgba(8, 5, 24, 0.8)";
        canvasCtx.strokeStyle = "rgba(3, 166, 255, 0.7)";
        canvasCtx.lineWidth = 1;
        canvasCtx.beginPath();
        canvasCtx.roundRect(canvasElement.width / 2 - 64, 14, 128, 32, 6);
        canvasCtx.fill();
        canvasCtx.stroke();

        canvasCtx.font = "bold 13px monospace";
        canvasCtx.fillStyle = "#03a6ff";
        canvasCtx.fillText(`⚡ RALLY: ${currentRally}`, canvasElement.width / 2, 35);
    }
    canvasCtx.restore();

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
        if (winner === 'player' && Math.random() < 0.4) {
            spawnConfetti(2); // continuous gentle celebratory confetti
        }
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
        canvasCtx.fillStyle = "rgba(0, 0, 0, 0.4)";
        canvasCtx.fillRect(0, 0, canvasElement.width, canvasElement.height);
        
        canvasCtx.textAlign = "center";
        
        canvasCtx.font = "bold 44px monospace";
        canvasCtx.fillStyle = "#FFFFFF";
        canvasCtx.fillText("PAUSED", canvasElement.width / 2, canvasElement.height / 2 - 24);
        
        canvasCtx.font = "16px 'Quicksand', system-ui, sans-serif";
        canvasCtx.fillStyle = "#E0E0E0";
        canvasCtx.fillText("Move your hand in front of the camera", canvasElement.width / 2, canvasElement.height / 2 + 15);
        canvasCtx.fillText("to control your paddle. Press 'P' to Play/Pause.", canvasElement.width / 2, canvasElement.height / 2 + 38);

        canvasCtx.textAlign = "left"; 
    }

    if (shakeMag > 0.2) {
        canvasCtx.restore(); // release the shake transform
        shakeMag *= 0.88;
    }

    drawTelemetry(); // drawn unshaken, last, so it stays readable
    canvasCtx.restore();
}

const hands = new Hands({locateFile: (file) => {
    return `https://cdn.jsdelivr.net/npm/@mediapipe/hands/${file}`;
}});

hands.setOptions({ maxNumHands: 1, modelComplexity: 0, minDetectionConfidence: 0.5, minTrackingConfidence: 0.5 });
hands.onResults(onResults);

let mediaStream = null;
let isProcessingFrame = false;

function requestVideoProcessing() {
    if (!cameraActive || !videoElement || videoElement.paused || videoElement.ended) return;
    
    if ('requestVideoFrameCallback' in videoElement) {
        videoElement.requestVideoFrameCallback(async () => {
            if (cameraActive && !isProcessingFrame) {
                isProcessingFrame = true;
                frameSentAt = performance.now();
                try {
                    await hands.send({ image: videoElement });
                } catch (e) {}
                isProcessingFrame = false;
            }
            requestVideoProcessing();
        });
    } else {
        const process = async () => {
            if (cameraActive && !isProcessingFrame) {
                isProcessingFrame = true;
                frameSentAt = performance.now();
                try {
                    await hands.send({ image: videoElement });
                } catch (e) {}
                isProcessingFrame = false;
            }
            if (cameraActive) requestAnimationFrame(process);
        };
        requestAnimationFrame(process);
    }
}

async function startCamera() {
    if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) {
        cameraActive = false;
        cameraError = 'Webcam not supported';
        updateFootageButtonText();
        return;
    }
    try {
        cameraError = null;
        mediaStream = await navigator.mediaDevices.getUserMedia({
            video: { width: { ideal: 640 }, height: { ideal: 480 } }
        });
        videoElement.srcObject = mediaStream;
        await videoElement.play();
        cameraActive = true;
        updateFootageButtonText();
        requestVideoProcessing();
    } catch (err) {
        cameraActive = false;
        cameraError = (err && err.name) ? err.name : 'Permission denied';
        updateFootageButtonText();
    }
}

// Fallback render loop when camera is not running frames
function rafLoop() {
    if (!cameraActive) {
        onResults({ image: null, multiHandLandmarks: [] });
    }
    requestAnimationFrame(rafLoop);
}
requestAnimationFrame(rafLoop);

startCamera();
applyDifficulty();
updatePaddleDimensions();
resetBall();
refreshPlayerBadge();
loadBoard();
showNameModal();
