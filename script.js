
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

const PADDLE_LONG = 100;
const PADDLE_SHORT = 20;

// --- KEYBOARD SHORTCUTS ---
document.addEventListener('keydown', (e) => {
    if (e.key.toLowerCase() === 'p') {
        document.getElementById('btn-playpause').click();
    }
});

// --- BUTTON EVENT LISTENERS ---
document.getElementById('btn-playpause').addEventListener('click', (e) => {
    initAudio(); 
    isPlaying = !isPlaying;
    e.target.innerText = isPlaying ? "Pause (P)" : "Start (P)";
    e.target.style.backgroundColor = isPlaying ? "#7a2222" : "#1a5c2b"; 
    if (isPlaying) sfx.start();
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
        canvasElement.requestFullscreen().catch(err => {
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

// --- GAME VARIABLES ---
const ball = { x: 320, y: 240, vx: 0, vy: 0, radius: 10, speed: 5, minSpeed: 6, maxSpeed: 30 };
const player = { width: PADDLE_SHORT, height: PADDLE_LONG, score: 0 };
const ai = { x: 600, y: 240, width: PADDLE_SHORT, height: PADDLE_LONG, score: 0, speed: 8 };

function updatePaddleDimensions() {
    player.width = isVertical ? PADDLE_LONG : PADDLE_SHORT;
    player.height = isVertical ? PADDLE_SHORT : PADDLE_LONG;
    ai.width = isVertical ? PADDLE_LONG : PADDLE_SHORT;
    ai.height = isVertical ? PADDLE_SHORT : PADDLE_LONG;
}

function resetGame() {
    player.score = 0;
    ai.score = 0;
    resetBall();
}

function resetBall() {
    ball.x = canvasElement.width / 2;
    ball.y = canvasElement.height / 2;
    ball.speed = ball.minSpeed; 
    
    if (!isVertical) {
        const directionX = isSwapped ? 1 : -1;
        ball.vx = directionX * ball.speed;
        ball.vy = (Math.random() * 2 - 1) * ball.speed * 0.7;
    } else {
        const directionY = isSwapped ? -1 : 1;
        ball.vy = directionY * ball.speed;
        ball.vx = (Math.random() * 2 - 1) * ball.speed * 0.7;
    }
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

    if (isPlaying && ball.speed > ball.minSpeed) {
        ball.speed = Math.max(ball.minSpeed, ball.speed * 0.997);
        const currentVectorSpeed = Math.sqrt(ball.vx * ball.vx + ball.vy * ball.vy);
        ball.vx = (ball.vx / currentVectorSpeed) * ball.speed;
        ball.vy = (ball.vy / currentVectorSpeed) * ball.speed;
    }

    let totalAiDx = 0;
    let totalAiDy = 0;
    if (!isVertical) {
        if (ai.y < ball.y - 15) totalAiDy = ai.speed;
        else if (ai.y > ball.y + 15) totalAiDy = -ai.speed;
    } else {
        if (ai.x < ball.x - 15) totalAiDx = ai.speed;
        else if (ai.x > ball.x + 15) totalAiDx = -ai.speed;
    }

    for (let i = 0; i < SUBSTEPS; i++) {
        currentPointerX += totalPaddleDx / SUBSTEPS;
        currentPointerY += totalPaddleDy / SUBSTEPS;

        ai.x += totalAiDx / SUBSTEPS;
        ai.y += totalAiDy / SUBSTEPS;
        
        if (!isVertical) {
            ai.x = isSwapped ? 40 : 600; 
            ai.y = Math.max(ai.height / 2, Math.min(canvasElement.height - ai.height / 2, ai.y));
        } else {
            ai.y = isSwapped ? 440 : 40; 
            ai.x = Math.max(ai.width / 2, Math.min(canvasElement.width - ai.width / 2, ai.x));
        }

        if (isPlaying) {
            ball.x += ball.vx / SUBSTEPS;
            ball.y += ball.vy / SUBSTEPS;

            if (!isVertical) {
                if (ball.y - ball.radius <= 0) { ball.vy = Math.abs(ball.vy); ball.y = ball.radius; sfx.wall(); } 
                else if (ball.y + ball.radius >= canvasElement.height) { ball.vy = -Math.abs(ball.vy); ball.y = canvasElement.height - ball.radius; sfx.wall(); }

                if (ball.x < 0) {
                    if (!isSwapped) { ai.score++; sfx.aiScore(); } 
                    else { player.score++; sfx.playerScore(); }
                    resetBall(); break; 
                } else if (ball.x > canvasElement.width) {
                    if (!isSwapped) { player.score++; sfx.playerScore(); } 
                    else { ai.score++; sfx.aiScore(); }
                    resetBall(); break; 
                }
            } else {
                if (ball.x - ball.radius <= 0) { ball.vx = Math.abs(ball.vx); ball.x = ball.radius; sfx.wall(); } 
                else if (ball.x + ball.radius >= canvasElement.width) { ball.vx = -Math.abs(ball.vx); ball.x = canvasElement.width - ball.radius; sfx.wall(); }

                if (ball.y < 0) {
                    if (!isSwapped) { player.score++; sfx.playerScore(); } 
                    else { ai.score++; sfx.aiScore(); }
                    resetBall(); break;
                } else if (ball.y > canvasElement.height) {
                    if (!isSwapped) { ai.score++; sfx.aiScore(); } 
                    else { player.score++; sfx.playerScore(); }
                    resetBall(); break;
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
    canvasCtx.strokeStyle = "rgba(255, 255, 255, 0.2)";
    canvasCtx.setLineDash([10, 10]);
    canvasCtx.lineWidth = 2;
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
    canvasCtx.fillText(`PLAYER: ${player.score}`, 20, 40);
    
    canvasCtx.fillStyle = "rgba(255, 82, 82, 1)";
    const aiText = `AI: ${ai.score}`;
    const textMetrics = canvasCtx.measureText(aiText);
    canvasCtx.fillText(aiText, canvasElement.width - textMetrics.width - 20, 40);

    if (!isPlaying) {
        canvasCtx.fillStyle = "rgba(0, 0, 0, 0.5)";
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
