"use strict";

// ---- DOM ----
const canvas = document.getElementById("board");
const ctx = canvas.getContext("2d");
const scoreEl = document.getElementById("score");
const livesEl = document.getElementById("lives");
const overlayEl = document.getElementById("overlay");
const overlayTextEl = document.getElementById("overlay-text");
const restartBtn = document.getElementById("restart");
const volumeEl = document.getElementById("volume");
const muteEl = document.getElementById("mute");

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

// ---- Audio ----
const SOUNDS = {
  bounce: "assets/sounds/ball-bounce.mp3",
  break: "assets/sounds/break-sound.mp3",
};
const AUDIO_POOL = 8;                      // clones precargados por sonido (permiten solapamiento sin latencia)
const VOLUME_DEFAULT = 50;                 // 0-100, primera visita
const MUTED_DEFAULT = false;
const STORE_VOLUME = "arkanoid.v1.volume";
const STORE_MUTED = "arkanoid.v1.muted";

// ---- Estado ----
let bricks = [];   // [{ x, y, color, hits, alive }]  hits = golpes restantes (1, o 2 en gris)
let paddle = { x: 0, w: PADDLE_W };
let ball = { x: 0, y: 0, vx: 0, vy: 0, stuck: true };
let explosions = [];   // [{ x, y, color, start }]  start = timestamp del inicio
let score = 0, lives = LIVES_START, broken = 0;
let paused = false, gameOver = false, won = false;
let keys = { left: false, right: false };
let lastTime = 0, animId = null;

// Estado de audio: es preferencia de usuario, no estado de partida, así que
// vive fuera de init() y sobrevive al botón Reiniciar.
let audio = {};                // { bounce: [HTMLAudioElement], break: [...] } pool precargado por sonido
let audioIdx = {};             // { bounce: 0, break: 0 } siguiente elemento del pool a usar
let volume = VOLUME_DEFAULT;   // 0-100
let muted = MUTED_DEFAULT;

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

// ---- Audio ----
// Precarga un pool de AUDIO_POOL elementos por sonido. Clonar en el momento del
// impacto metía latencia audible (cada clon rearranca su carga y decode); con el
// pool ya decodificado el play() es inmediato. Si un mp3 no existe o el navegador
// bloquea la carga el fallo es silencioso: el juego se queda mudo pero jugable.
function loadSounds() {
  audio = {};
  audioIdx = {};
  for (const name in SOUNDS) {
    try {
      const pool = [];
      for (let i = 0; i < AUDIO_POOL; i++) {
        const a = new Audio(SOUNDS[name]);
        a.preload = "auto";
        a.addEventListener("error", () => {});   // evita el error no capturado
        a.load();                                // fuerza la descarga y el decode ya
        pool.push(a);
      }
      audio[name] = pool;
      audioIdx[name] = 0;
    } catch (err) {
      /* sin sonido para esta clave */
    }
  }
}

// Reproduce el siguiente elemento del pool, rotando: así dos sonidos iguales se
// solapan en vez de cortarse. La promesa de play() se ignora (autoplay policy).
function playSound(name) {
  if (muted || volume === 0) return;
  const pool = audio[name];
  if (!pool || pool.length === 0) return;
  try {
    const a = pool[audioIdx[name]];
    audioIdx[name] = (audioIdx[name] + 1) % pool.length;
    a.currentTime = 0;
    a.volume = volume / 100;
    const p = a.play();
    if (p && typeof p.catch === "function") p.catch(() => {});
  } catch (err) {
    /* el audio es accesorio: nunca debe romper el juego */
  }
}

// Lee las preferencias guardadas. Cualquier valor ausente, corrupto o fuera de
// rango cae al default. localStorage puede lanzar (modo privado, file://).
function loadAudioPrefs() {
  try {
    // Ojo: getItem devuelve null si la clave no existe, y Number(null) es 0.
    // Hay que descartar el string vacío o nulo antes de convertir.
    const raw = localStorage.getItem(STORE_VOLUME);
    const v = raw === null || raw === "" ? NaN : Number(raw);
    volume = Number.isFinite(v) && v >= 0 && v <= 100 ? Math.round(v) : VOLUME_DEFAULT;
    muted = localStorage.getItem(STORE_MUTED) === "true";
  } catch (err) {
    volume = VOLUME_DEFAULT;
    muted = MUTED_DEFAULT;
  }
}

// Si localStorage falla el juego sigue: solo pierde la persistencia.
function saveAudioPrefs() {
  try {
    localStorage.setItem(STORE_VOLUME, String(volume));
    localStorage.setItem(STORE_MUTED, muted ? "true" : "false");
  } catch (err) {
    /* sin persistencia */
  }
}

// Ajusta el volumen global (0-100) y sincroniza el slider.
function setVolume(v) {
  if (!Number.isFinite(v)) v = VOLUME_DEFAULT;
  volume = Math.max(0, Math.min(100, Math.round(v)));
  syncVolumeSlider();
  saveAudioPrefs();
}

// Silencia o restaura el audio. `volume` guarda siempre el nivel elegido; el
// slider muestra el volumen efectivo, así que baja a 0 al mutear y vuelve a su
// sitio al desmutear.
function setMuted(m) {
  muted = !!m;
  syncMuteButton();
  syncVolumeSlider();
  saveAudioPrefs();
}

// El slider refleja el volumen efectivo: 0 mientras esté muteado.
function syncVolumeSlider() {
  volumeEl.value = muted ? 0 : volume;
}

// Refleja el estado de mute en el botón: icono y textos accesibles.
function syncMuteButton() {
  muteEl.textContent = muted ? "🔇" : "🔊";
  muteEl.setAttribute("aria-pressed", muted ? "true" : "false");
  muteEl.title = muted ? "Activar sonido (M)" : "Silenciar (M)";
  muteEl.setAttribute("aria-label", muted ? "Activar sonido" : "Silenciar");
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
  if (e.key === "m" || e.key === "M") { setMuted(!muted); e.preventDefault(); }
});

document.addEventListener("keyup", (e) => {
  if (e.key === "ArrowLeft") keys.left = false;
  if (e.key === "ArrowRight") keys.right = false;
});

volumeEl.addEventListener("input", () => {
  // Mover el slider estando muteado quita el mute: si no, el control parecería roto.
  if (muted) {
    muted = false;
    syncMuteButton();
  }
  setVolume(Number(volumeEl.value));
});

muteEl.addEventListener("click", () => {
  muteEl.blur();   // si no, espacio volvería a pulsar el botón en vez de sacar
  setMuted(!muted);
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
  playSound("bounce");
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
    if (b.hits > 0) {
      // Gris al primer golpe: rebotó pero no rompió.
      playSound("bounce");
    } else {
      playSound("break");
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
    playSound("bounce");
  } else if (ball.x + BALL_SIZE >= W) {
    ball.x = W - BALL_SIZE;
    ball.vx = -ball.vx;
    playSound("bounce");
  }
  if (ball.y <= 0) {
    ball.y = 0;
    ball.vy = -ball.vy;
    playSound("bounce");
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
loadSounds();
loadAudioPrefs();
syncMuteButton();
syncVolumeSlider();   // el estado leído manda sobre el value del HTML

loadSpritesheet(() => {
  init();
  animId = requestAnimationFrame(loop);
});
