# SPEC 01 — Juego base jugable

> **Estado:** Implementado
> **Depende de:** ninguna
> **Fecha:** 2026-08-17
> **Objetivo:** Arkanoid jugable de un solo nivel con paddle, bola, rejilla de bloques, 3 vidas, puntuación, pausa, game over y victoria, en HTML/CSS/JS vanilla sobre los sprites ya presentes en `assets/`, sin audio.

---

## Por qué existe esta spec

El repositorio solo tiene `README.md` y `assets/` (spritesheet, sonidos sin usar todavía y `assets/spritesheet.js` ya escrito). Esta spec fija el esqueleto del juego y las convenciones que heredarán las specs siguientes (niveles, power-ups, high scores). Las decisiones estructurales copian a propósito las del proyecto hermano `03-claude-tetris`: script global único, sin bundler, sin tests.

---

## Alcance

**Dentro:**

- `index.html`, `style.css`, `game.js` nuevos en la raíz. Reutilizan `assets/spritesheet.js` sin modificarlo.
- Canvas fijo de 800×600 con render por spritesheet (`drawSprite`, `drawFrame`).
- Paddle controlado con ratón (eje X del cursor) y con flechas izquierda/derecha.
- Bola con rebote dependiente del punto de impacto en el paddle y aceleración por tramos.
- Un único nivel: rejilla de 10×6 bloques definida como matriz de caracteres.
- Bloques de color (1 golpe) y bloques grises (2 golpes).
- 3 vidas. Bola pegada al paddle hasta que el jugador saca con espacio o clic.
- Puntuación por color de bloque, mostrada en HUD HTML.
- Overlays HTML de pausa, game over y victoria. Botón de reinicio siempre disponible.
- Animación de explosión de 4 frames al destruir un bloque, con el color del bloque.
- Actualizar `README.md` con instrucciones de ejecución.
- Crear `CLAUDE.md` documentando la arquitectura resultante.

**Fuera de alcance (para specs futuras):**

- Múltiples niveles y progresión entre ellos.
- Power-ups / cápsulas que caen al romper bloques.
- Persistencia: récord o tabla de high scores en `localStorage`.
- Audio: los archivos `assets/sounds/ball-bounce.mp3` y `break-sound.mp3` quedan sin usar en esta spec.
- Control táctil y diseño responsive (el canvas es de tamaño fijo).
- Botón o tecla de mute.
- Skins o paletas alternativas.
- Editor de niveles.
- Tests automáticos, linter, `package.json`.

---

## Modelo de datos

Estado global mutable en `game.js`, reiniciado íntegramente por `init()`:

```js
// Constantes de layout (px)
const W = 800, H = 600;
const COLS = 10, ROWS = 6;
const BRICK_W = 64, BRICK_H = 24;
const GRID_X = 80, GRID_Y = 60;          // 80 + 10*64 = 720 → margen 80 a cada lado
const PADDLE_W = 96, PADDLE_H = 16, PADDLE_Y = 560;
const BALL_SIZE = 12;
const PADDLE_SPEED = 520;                 // px/s con teclado
const BALL_SPEED_BASE = 300;              // px/s
const BALL_SPEED_STEP = 20;               // +20 px/s cada 10 bloques rotos
const BALL_SPEED_MAX = 520;
const MAX_BOUNCE_ANGLE = 60 * Math.PI / 180;  // desde la vertical, en los bordes del paddle
const LIVES_START = 3;

// Nivel: una fila por línea, un carácter por bloque
// r=red  p=hotpink  m=magenta  y=yellow  g=green  c=cyan  G=gris(2 golpes)  .=vacío
const LEVEL = [
  'rrrrGGrrrr',
  'pppppppppp',
  'mmmmmmmmmm',
  'yyyyGGyyyy',
  'gggggggggg',
  'cccccccccc',
];

// Puntuación por color
const SCORES = { red: 70, hotpink: 60, magenta: 50, yellow: 40, green: 30, cyan: 20, gray: 100 };

// Estado
let bricks = [];   // [{ x, y, color, hits, alive }]  hits = golpes restantes (1, o 2 en gris)
let paddle = { x: 0, w: PADDLE_W };
let ball   = { x: 0, y: 0, vx: 0, vy: 0, stuck: true };
let explosions = [];   // [{ x, y, color, start }]  start = timestamp del inicio
let score = 0, lives = LIVES_START, broken = 0;
let paused = false, gameOver = false, won = false;
let keys = { left: false, right: false };
let lastTime = 0, animId = null;
```

Convenciones:

- Origen de coordenadas: esquina superior izquierda del canvas.
- `x, y` de bola, paddle y bloques son la esquina superior izquierda del sprite.
- Velocidades en **píxeles por segundo**, integradas con el delta del `requestAnimationFrame` (no por frame).
- El campo `color` de un bloque es la clave literal de `SPRITES.blocks` y de `EXPLOSION_FRAMES`, así que el mismo string sirve para pintar, explotar y puntuar.
- La duración de la explosión es `EXPLOSION_DURATION` (150 ms), ya definida en `assets/spritesheet.js`: 4 frames repartidos en ese total.

---

## Plan de implementación

1. Crear `index.html`: `<canvas id="board" width="800" height="600">`, HUD (`#score`, `#lives`), overlay `#overlay` con `#overlay-text`, botón `#restart`, y los `<script>` de `assets/spritesheet.js` y `game.js` en ese orden. Crear `style.css` con el centrado, el fondo oscuro y el overlay oculto por defecto. Verificación manual: abrir en navegador, se ve el canvas vacío y el HUD.
2. En `game.js`: `'use strict'`, cachear IDs del DOM en el top level, definir constantes y estado. Implementar `init()` (construye `bricks` desde `LEVEL`, resetea todo) y `draw()` pintando solo los bloques con `drawSprite(ctx, 'block_' + color, ...)` dentro de `loadSpritesheet(...)`. Verificación: se ve la rejilla de 10×6 con los 6 colores y los grises.
3. Implementar `resetBall()` (bola centrada sobre el paddle, `stuck = true`) y el pintado de paddle y bola en `draw()`. Verificación: paddle y bola visibles en su posición inicial.
4. Implementar input: `mousemove` sobre el canvas centra el paddle en el cursor (con clamp a `[0, W - PADDLE_W]`), `keydown`/`keyup` de flechas alimentan `keys`, y espacio o clic lanzan la bola si está pegada. Implementar `loop(ts)` con `requestAnimationFrame` y delta en segundos, moviendo solo el paddle. Verificación: el paddle se mueve con ratón y teclado y no sale del canvas.
5. Añadir movimiento de la bola y rebote contra las tres paredes (izquierda, derecha, techo). Si la bola está `stuck`, sigue al paddle. Verificación: al sacar, la bola rebota indefinidamente contra las paredes y atraviesa bloques y paddle.
6. Implementar colisión bola-paddle: si la bola desciende y solapa el paddle, calcular el offset relativo `(centroBola - centroPaddle) / (w/2)` acotado a `[-1, 1]`, derivar el ángulo con `MAX_BOUNCE_ANGLE` y reasignar `vx`/`vy` manteniendo el módulo de la velocidad actual. Verificación: golpear con el centro devuelve la bola casi vertical, golpear con el borde la desvía mucho.
7. Implementar colisión bola-bloque: recorrer los bloques vivos, detectar solape AABB, decidir si el eje reflejado es X o Y según el solape menor, decrementar `hits` y marcar `alive = false` cuando llegue a 0. Sumar `SCORES[color]` solo al destruir. Un impacto por frame como máximo. Verificación: los bloques desaparecen, los grises tras dos golpes, y el marcador sube.
8. Implementar la aceleración: al destruir un bloque incrementar `broken` y recalcular el módulo de la velocidad como `min(BALL_SPEED_BASE + floor(broken / 10) * BALL_SPEED_STEP, BALL_SPEED_MAX)`, reescalando `vx`/`vy` sin cambiar la dirección. Verificación: tras 10 bloques la bola va perceptiblemente más rápida.
9. Implementar pérdida de bola: si `ball.y > H`, restar una vida, actualizar el HUD y llamar a `resetBall()`; si `lives === 0`, poner `gameOver = true` y mostrar el overlay. Verificación: dejar caer la bola tres veces termina la partida.
10. Implementar victoria: cuando no queda ningún bloque vivo que no sea decorativo, poner `won = true` y mostrar el overlay con la puntuación final. Verificación: romper todos los bloques muestra el mensaje de victoria.
11. Implementar pausa con `Esc` y `P`: alterna `paused`, cancela `animId`, muestra el overlay y al reanudar **resetea `lastTime`** para no arrastrar el delta acumulado. Enganchar `#restart` a `init()`. Verificación: pausar, esperar unos segundos, reanudar y comprobar que la bola no salta de posición.
12. Añadir explosiones: al destruir un bloque, hacer push a `explosions` con su color y el timestamp; en `draw()` pintar el frame correspondiente con `drawFrame` y descartar las entradas caducadas. Verificación: al romper un bloque se ve la animación de 4 frames de su color y desaparece.
13. Actualizar `README.md` (cómo ejecutar, controles) y crear `CLAUDE.md` con la arquitectura y las restricciones al modificar, siguiendo el formato de `03-claude-tetris/CLAUDE.md`.

---

## Criterios de aceptación

- [x] Abrir `index.html` directamente en el navegador carga el juego sin errores en consola.
- [x] Se ven 60 bloques en rejilla de 10 columnas × 6 filas, con los 4 grises en las posiciones que indica `LEVEL`.
- [x] El paddle sigue el eje X del ratón y también se mueve con las flechas izquierda y derecha.
- [x] El paddle nunca se sale del canvas por ninguno de los dos lados.
- [x] Al empezar y tras perder una vida la bola queda pegada al paddle y no se mueve hasta pulsar espacio o hacer clic.
- [x] La bola rebota en las paredes izquierda, derecha y superior, y no en la inferior.
- [x] Golpear el paddle en el centro devuelve la bola con ángulo cercano a la vertical; golpearlo en un extremo la devuelve con un ángulo claramente lateral.
- [x] Un bloque de color desaparece al primer impacto; un bloque gris requiere exactamente dos.
- [x] Romper un bloque rojo suma 70 puntos, uno cian 20 y uno gris 100. El HUD refleja el total.
- [x] Tras romper 10 bloques la bola se mueve más rápido, y nunca supera 520 px/s.
- [x] El juego no reproduce ningún sonido.
- [x] Cada bloque roto muestra la animación de explosión de 4 frames en el color del bloque y se borra al terminar.
- [x] Perder la bola resta una vida; con 0 vidas aparece el overlay de game over y el juego se detiene.
- [x] Romper todos los bloques muestra el overlay de victoria con la puntuación final.
- [x] `Esc` o `P` pausan y reanudan; al reanudar la bola continúa desde donde estaba sin salto de posición.
- [x] El botón de reinicio devuelve el juego al estado inicial desde cualquier estado, incluidos pausa, game over y victoria.

---

## Decisiones

- **Sí:** tres archivos (`index.html`, `style.css`, `game.js`) con script global y sin módulos. Consistente con `02-claude-asteroids` y `03-claude-tetris`, y permite abrir el HTML por `file://` sin servidor.
- **No:** módulos ES separados. Obligarían a servir por HTTP y no aportan nada a este tamaño de proyecto.
- **No:** todo inline en un solo HTML. Dificulta releer y diferenciar capas.
- **Sí:** un solo nivel en esta spec, definido como matriz de caracteres. La estructura ya sirve para varios niveles cuando llegue esa spec, sin refactor.
- **Sí:** velocidades en px/s con delta temporal. Hace el juego independiente de la tasa de refresco del monitor.
- **No:** velocidades en px/frame. En pantallas de 144 Hz la bola sería injugable.
- **Sí:** bloque gris = 2 golpes con la puntuación más alta. Aprovecha el sprite gris del spritesheet dándole función, sin introducir un tipo irrompible que complica la condición de victoria.
- **No:** gris irrompible. Requeriría excluirlo del recuento de victoria y en esta spec no aporta.
- **Sí:** rebote en el paddle por punto de impacto, con `MAX_BOUNCE_ANGLE` de 60°. Da control al jugador, que es la mecánica central del género.
- **Sí:** aceleración por tramos de 10 bloques con tope. Evita que la partida se alargue sin tensión, y el tope evita que la bola atraviese bloques por tunneling.
- **Sí:** HUD y overlays en HTML/CSS, no en el canvas. Más fácil de estilar y de leer que `fillText`.
- **Sí:** reutilizar `assets/spritesheet.js` tal cual, sin tocarlo. Ya expone `loadSpritesheet`, `drawSprite`, `drawFrame`, `EXPLOSION_FRAMES` y `EXPLOSION_DURATION`; todo lo que hace falta.
- **No:** audio en esta spec, aunque los `.mp3` ya estén en `assets/sounds/`. Decisión explícita del usuario: primero la mecánica y el feedback visual; el sonido entra en una spec posterior.
- **No:** persistencia de puntuación. Va en su propia spec para no mezclar `localStorage` y versionado de esquema con la mecánica base.
- **No:** power-ups. Es la spec siguiente natural y depende de esta.
- **Sí:** una única colisión bola-bloque por frame. Simplifica la resolución de rebote y es imperceptible a estas velocidades.
- **Sí:** textos de UI, comentarios y documentación en español. Consistente con los proyectos hermanos.

---

## Riesgos identificados

| Riesgo | Mitigación |
| --- | --- |
| Tunneling: a velocidad alta la bola atraviesa un bloque entre dos frames | `BALL_SPEED_MAX` de 520 px/s: a 60 fps son ~9 px por frame, muy por debajo del alto del bloque (24 px). |
| Rebote errático al golpear una esquina de bloque | Reflejar solo el eje con el solape menor, un impacto por frame. |
| La bola se queda en un ángulo casi horizontal y no progresa | Al rebotar en el paddle se fuerza un ángulo máximo de 60° desde la vertical, así que `vy` nunca es despreciable. |
| El spritesheet tarda en cargar y `draw()` pinta vacío | `drawSprite`/`drawFrame` ya salen si `ssLoaded` es falso; el bucle arranca dentro del callback de `loadSpritesheet`. |
| Delta enorme al volver de una pestaña en segundo plano | Al reanudar tras pausa se resetea `lastTime`; además se acota el delta por frame a un máximo. |

---

## Lo que **no** entra en esta spec

- Varios niveles y progresión.
- Audio (efectos de rebote y rotura).
- Power-ups.
- Récord o tabla de high scores en `localStorage`.
- Control táctil y diseño responsive.
- Mute o control de volumen.
- Skins alternativas.

Cada uno de ellos, si llega, va en su propia spec.
