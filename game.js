"use strict";

// ---- DOM ----
const canvas = document.getElementById("board");
const ctx = canvas.getContext("2d");
const scoreEl = document.getElementById("score");
const livesEl = document.getElementById("lives");
const overlayEl = document.getElementById("overlay");
const overlayTextEl = document.getElementById("overlay-text");
const restartBtn = document.getElementById("restart");

// ---- Constantes de layout (px) ----
const W = 800, H = 600;
const COLS = 10, ROWS = 6;
const BRICK_W = 64, BRICK_H = 24;
const GRID_X = 80, GRID_Y = 60;          // 80 + 10*64 = 720 -> margen 80 a cada lado
const PADDLE_W = 96, PADDLE_H = 16, PADDLE_Y = 560;
const BALL_SIZE = 12;
const LIFE_ICON = 16;                     // px del icono de vida en el HUD
const PADDLE_SPEED = 520;                 // px/s con teclado
const BALL_SPEED_BASE = 300;              // px/s
const BALL_SPEED_STEP = 20;               // +20 px/s cada 10 bloques rotos
const BALL_SPEED_MAX = 520;
const MAX_BOUNCE_ANGLE = 60 * Math.PI / 180;  // desde la vertical, en los bordes del paddle
const LIVES_START = 3;
const MAX_DT = 0.05;                      // s: acota el delta si la pestaña estuvo en segundo plano
const LAUNCH_ANGLE = 30 * Math.PI / 180;  // desde la vertical, al sacar

// Nivel: una fila por línea, un carácter por bloque
// r=red  p=hotpink  m=magenta  y=yellow  g=green  c=cyan  G=gris(2 golpes)  .=vacío
const LEVEL = [
  "rrrrGGrrrr",
  "pppppppppp",
  "mmmmmmmmmm",
  "yyyyGGyyyy",
  "gggggggggg",
  "cccccccccc",
];

// Carácter del nivel -> clave de color en SPRITES.blocks / EXPLOSION_FRAMES
const CHAR_COLORS = {
  r: "red",
  p: "hotpink",
  m: "magenta",
  y: "yellow",
  g: "green",
  c: "cyan",
  G: "gray",
};

// Puntuación por color
const SCORES = { red: 70, hotpink: 60, magenta: 50, yellow: 40, green: 30, cyan: 20, gray: 100 };

// ---- Estado ----
let bricks = [];   // [{ x, y, color, hits, alive }]  hits = golpes restantes (1, o 2 en gris)
let paddle = { x: 0, w: PADDLE_W };
let ball = { x: 0, y: 0, vx: 0, vy: 0, stuck: true };
let explosions = [];   // [{ x, y, color, start }]  start = timestamp del inicio
let score = 0, lives = LIVES_START, broken = 0;
let paused = false, gameOver = false, won = false;
let keys = { left: false, right: false };
let lastTime = 0, animId = null;

// ---- Inicialización ----
function init() {
  bricks = [];
  for (let row = 0; row < ROWS; row++) {
    for (let col = 0; col < COLS; col++) {
      const ch = LEVEL[row][col];
      const color = CHAR_COLORS[ch];
      if (!color) continue;   // '.' o carácter desconocido -> hueco
      bricks.push({
        x: GRID_X + col * BRICK_W,
        y: GRID_Y + row * BRICK_H,
        color,
        hits: color === "gray" ? 2 : 1,
        alive: true,
      });
    }
  }

  paddle.x = (W - PADDLE_W) / 2;
  paddle.w = PADDLE_W;
  resetBall();

  explosions = [];
  score = 0;
  lives = LIVES_START;
  broken = 0;
  paused = false;
  gameOver = false;
  won = false;
  keys.left = false;
  keys.right = false;
  lastTime = 0;

  updateHUD();
  hideOverlay();
}

// Deja la bola pegada al centro del paddle, sin velocidad, a la espera del saque.
function resetBall() {
  ball.x = paddle.x + paddle.w / 2 - BALL_SIZE / 2;
  ball.y = PADDLE_Y - BALL_SIZE;
  ball.vx = 0;
  ball.vy = 0;
  ball.stuck = true;
}

// Saca la bola hacia arriba con una desviación aleatoria dentro de LAUNCH_ANGLE.
function launchBall() {
  if (!ball.stuck || paused || gameOver || won) return;
  ball.stuck = false;
  const angle = (Math.random() * 2 - 1) * LAUNCH_ANGLE;
  ball.vx = Math.sin(angle) * BALL_SPEED_BASE;
  ball.vy = -Math.cos(angle) * BALL_SPEED_BASE;
}

// ---- HUD y overlay ----
function updateHUD() {
  scoreEl.textContent = score;
  drawLives();
}

// Las vidas se pintan como mini-bolas: un canvas por vida con el sprite de la bola.
function drawLives() {
  livesEl.textContent = "";
  for (let i = 0; i < lives; i++) {
    const c = document.createElement("canvas");
    c.width = LIFE_ICON;
    c.height = LIFE_ICON;
    c.className = "life";
    drawSprite(c.getContext("2d"), "ball", 0, 0, LIFE_ICON, LIFE_ICON);
    livesEl.appendChild(c);
  }
}

function showOverlay(text) {
  overlayTextEl.textContent = text;
  overlayEl.classList.remove("hidden");
}

function hideOverlay() {
  overlayEl.classList.add("hidden");
}

// ---- Render ----
function draw() {
  ctx.clearRect(0, 0, W, H);

  for (const b of bricks) {
    if (!b.alive) continue;
    drawSprite(ctx, "block_" + b.color, b.x, b.y, BRICK_W, BRICK_H);
  }

  drawExplosions();

  drawSprite(ctx, "paddle", paddle.x, PADDLE_Y, paddle.w, PADDLE_H);
  drawSprite(ctx, "ball", ball.x, ball.y, BALL_SIZE, BALL_SIZE);
}

// Pinta las explosiones vivas y descarta las que ya han cumplido su duración.
function drawExplosions() {
  const now = performance.now();
  const frameTime = EXPLOSION_DURATION / 4;

  explosions = explosions.filter((e) => now - e.start < EXPLOSION_DURATION);

  for (const e of explosions) {
    const frames = EXPLOSION_FRAMES[e.color];
    if (!frames) continue;
    const i = Math.min(3, Math.floor((now - e.start) / frameTime));
    drawFrame(ctx, frames[i], e.x, e.y, BRICK_W, BRICK_H);
  }
}

// ---- Input ----
function clampPaddle() {
  paddle.x = Math.max(0, Math.min(W - paddle.w, paddle.x));
}

canvas.addEventListener("mousemove", (e) => {
  const rect = canvas.getBoundingClientRect();
  paddle.x = e.clientX - rect.left - paddle.w / 2;
  clampPaddle();
});

canvas.addEventListener("mousedown", () => {
  launchBall();
});

document.addEventListener("keydown", (e) => {
  if (e.key === "ArrowLeft") { keys.left = true; e.preventDefault(); }
  if (e.key === "ArrowRight") { keys.right = true; e.preventDefault(); }
  if (e.code === "Space") { launchBall(); e.preventDefault(); }
  if (e.key === "Escape" || e.key === "p" || e.key === "P") { togglePause(); e.preventDefault(); }
});

document.addEventListener("keyup", (e) => {
  if (e.key === "ArrowLeft") keys.left = false;
  if (e.key === "ArrowRight") keys.right = false;
});

restartBtn.addEventListener("click", () => {
  restartBtn.blur();   // si no, espacio volvería a pulsar el botón en vez de sacar
  restart();
});

// ---- Velocidad de la bola ----
// Sube un escalón por cada 10 bloques rotos, con tope en BALL_SPEED_MAX.
function currentSpeed() {
  return Math.min(BALL_SPEED_BASE + Math.floor(broken / 10) * BALL_SPEED_STEP, BALL_SPEED_MAX);
}

// Reescala vx/vy al módulo objetivo sin tocar la dirección.
function applySpeed() {
  const mag = Math.hypot(ball.vx, ball.vy);
  if (mag === 0) return;
  const speed = currentSpeed();
  ball.vx = ball.vx / mag * speed;
  ball.vy = ball.vy / mag * speed;
}

// ---- Colisiones ----
// Rebote en el paddle: el ángulo de salida depende del punto de impacto.
function hitPaddle() {
  if (ball.vy <= 0) return;   // solo cuando desciende
  if (ball.y + BALL_SIZE < PADDLE_Y || ball.y > PADDLE_Y + PADDLE_H) return;
  if (ball.x + BALL_SIZE < paddle.x || ball.x > paddle.x + paddle.w) return;

  const ballCx = ball.x + BALL_SIZE / 2;
  const paddleCx = paddle.x + paddle.w / 2;
  const offset = Math.max(-1, Math.min(1, (ballCx - paddleCx) / (paddle.w / 2)));
  const angle = offset * MAX_BOUNCE_ANGLE;
  const speed = Math.hypot(ball.vx, ball.vy);

  ball.vx = Math.sin(angle) * speed;
  ball.vy = -Math.cos(angle) * speed;
  ball.y = PADDLE_Y - BALL_SIZE;   // la despega para no encadenar rebotes
}

// Colisión bola-bloque: como mucho un impacto por frame.
function hitBricks() {
  for (const b of bricks) {
    if (!b.alive) continue;
    if (ball.x + BALL_SIZE <= b.x || ball.x >= b.x + BRICK_W) continue;
    if (ball.y + BALL_SIZE <= b.y || ball.y >= b.y + BRICK_H) continue;

    // Se refleja el eje con menor solape: es el lado por el que ha entrado.
    const overlapX = Math.min(ball.x + BALL_SIZE, b.x + BRICK_W) - Math.max(ball.x, b.x);
    const overlapY = Math.min(ball.y + BALL_SIZE, b.y + BRICK_H) - Math.max(ball.y, b.y);

    if (overlapX < overlapY) {
      ball.vx = -ball.vx;
      ball.x += ball.vx > 0 ? overlapX : -overlapX;
    } else {
      ball.vy = -ball.vy;
      ball.y += ball.vy > 0 ? overlapY : -overlapY;
    }

    b.hits--;
    if (b.hits <= 0) {
      b.alive = false;
      score += SCORES[b.color];
      broken++;
      explosions.push({ x: b.x, y: b.y, color: b.color, start: performance.now() });
      applySpeed();
      updateHUD();
      if (bricks.every((br) => !br.alive)) winGame();
    }
    return;
  }
}

// ---- Fin de partida ----
function loseLife() {
  lives = Math.max(0, lives - 1);
  updateHUD();
  if (lives === 0) {
    gameOver = true;
    showOverlay("GAME OVER\nPuntuación: " + score);
  } else {
    resetBall();
  }
}

function winGame() {
  won = true;
  showOverlay("¡VICTORIA!\nPuntuación: " + score);
}

// ---- Pausa ----
function togglePause() {
  if (gameOver || won) return;
  paused = !paused;
  if (paused) {
    if (animId !== null) cancelAnimationFrame(animId);
    animId = null;
    showOverlay("PAUSA");
  } else {
    hideOverlay();
    lastTime = 0;   // sin esto, el delta acumulado durante la pausa daría un salto
    animId = requestAnimationFrame(loop);
  }
}

// ---- Reinicio ----
function restart() {
  if (animId !== null) cancelAnimationFrame(animId);
  animId = null;
  init();
  animId = requestAnimationFrame(loop);
}

// ---- Actualización ----
function update(dt) {
  if (keys.left) paddle.x -= PADDLE_SPEED * dt;
  if (keys.right) paddle.x += PADDLE_SPEED * dt;
  if (keys.left || keys.right) clampPaddle();

  if (ball.stuck) {
    ball.x = paddle.x + paddle.w / 2 - BALL_SIZE / 2;
    ball.y = PADDLE_Y - BALL_SIZE;
    return;
  }

  ball.x += ball.vx * dt;
  ball.y += ball.vy * dt;

  // Paredes: izquierda, derecha y techo. La inferior no rebota.
  if (ball.x <= 0) {
    ball.x = 0;
    ball.vx = -ball.vx;
  } else if (ball.x + BALL_SIZE >= W) {
    ball.x = W - BALL_SIZE;
    ball.vx = -ball.vx;
  }
  if (ball.y <= 0) {
    ball.y = 0;
    ball.vy = -ball.vy;
  }

  hitPaddle();
  hitBricks();

  if (ball.y > H) loseLife();
}

// ---- Bucle ----
function loop(ts) {
  if (!lastTime) lastTime = ts;
  const dt = Math.min((ts - lastTime) / 1000, MAX_DT);
  lastTime = ts;

  if (!paused && !gameOver && !won) update(dt);
  draw();

  // Tras game over o victoria se sigue pintando hasta que se apaga la última
  // explosión; luego el bucle se detiene.
  if (paused || ((gameOver || won) && explosions.length === 0)) {
    animId = null;
    return;
  }
  animId = requestAnimationFrame(loop);
}

// ---- Arranque ----
loadSpritesheet(() => {
  init();
  animId = requestAnimationFrame(loop);
});
