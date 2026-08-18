# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Proyecto

Arkanoid en JavaScript vanilla + HTML5 Canvas. Sin `package.json`, sin bundler, sin transpilador, sin tests, sin linter. 3 archivos propios: `index.html`, `style.css`, `game.js`, más `assets/spritesheet.js` (preexistente, no se toca).

El trabajo se organiza por specs en `specs/`. Esta base corresponde a `specs/01-juego-base.md`.

## Ejecutar

```bash
start index.html              # Windows, abrir directo
python3 -m http.server 8000   # o servidor estático (npx serve . / php -S localhost:8000)
```

No hay build ni test que ejecutar. Verificación = abrir en navegador y jugar.

## Arquitectura (`game.js`)

Un único script global, `"use strict"`, sin módulos. Se carga después de `assets/spritesheet.js`, del que consume `loadSpritesheet`, `drawSprite`, `drawFrame`, `SPRITES`, `EXPLOSION_FRAMES` y `EXPLOSION_DURATION`.

- **Estado global mutable**: `bricks, paddle, ball, explosions, score, lives, broken, paused, gameOver, won, keys, lastTime, animId`. Todo se reinicia en `init()`; `restart()` lo envuelve para el botón del HUD (cancela el `animId` vivo y relanza el bucle, así el reinicio funciona también desde pausa, game over y victoria).
- **Nivel**: `LEVEL` es un array de 6 strings de 10 caracteres. `CHAR_COLORS` traduce cada carácter a una clave de color; un carácter no mapeado (p. ej. `.`) deja hueco. La clave de color es la misma para `SPRITES.blocks`, `EXPLOSION_FRAMES` y `SCORES`, así que un solo string sirve para pintar, explotar y puntuar.
- **Bloques**: `{ x, y, color, hits, alive }`. `hits` son golpes restantes: 2 en `gray`, 1 en el resto. La puntuación se suma solo al destruir, no en cada golpe.
- **Bola**: velocidades en **px/s**, integradas con el delta de `requestAnimationFrame` (nunca por frame). `currentSpeed()` calcula el módulo objetivo a partir de `broken`; `applySpeed()` reescala `vx`/`vy` sin tocar la dirección. `resetBall()` la deja pegada al paddle (`stuck`), `launchBall()` la saca.
- **Colisiones**: `hitPaddle()` deriva el ángulo de salida del offset relativo del impacto, acotado por `MAX_BOUNCE_ANGLE`, conservando el módulo. `hitBricks()` hace AABB contra los bloques vivos, refleja **solo el eje con menor solape** y devuelve tras el primer impacto: una colisión bola-bloque por frame como máximo.
- **Game loop**: `loop(ts)` con delta en segundos acotado por `MAX_DT`. La pausa cancela el `animId` y **resetea `lastTime`** al reanudar para no arrastrar el delta acumulado. Tras game over o victoria el bucle sigue pintando hasta que se apaga la última explosión y entonces se detiene solo.
- **Render**: `draw()` repinta todo cada frame (bloques → explosiones → paddle → bola) con los sprites del spritesheet. `drawExplosions()` filtra las caducadas y elige el frame por tiempo transcurrido sobre `EXPLOSION_DURATION`.
- **HUD y overlays**: en HTML/CSS, no en el canvas. `updateHUD()`, `showOverlay(texto)` y `hideOverlay()` son la única vía de tocar el DOM. Las vidas no son un número: `drawLives()` genera un `<canvas>` de `LIFE_ICON` px por vida dentro de `#lives` y pinta en cada uno el sprite `ball`.

## Restricciones al modificar

- `W`/`H` deben coincidir con `width`/`height` del `<canvas id="board">` en `index.html`, y con el tamaño de `#stage` en `style.css` (el overlay se posiciona sobre él).
- La geometría de la rejilla debe cuadrar: `GRID_X * 2 + COLS * BRICK_W === W`. Si cambia `COLS`, `BRICK_W` o `GRID_X`, revisar los tres a la vez.
- Las filas de `LEVEL` deben ser exactamente `ROWS` strings de `COLS` caracteres, y cada carácter usado debe existir en `CHAR_COLORS`.
- Toda clave de color nueva necesita entrada en `SPRITES.blocks`, `EXPLOSION_FRAMES` y `SCORES`.
- No modificar `assets/spritesheet.js`: es el contrato de render compartido.
- `BALL_SPEED_MAX` está tasado para evitar tunneling (a 60 fps son ~9 px/frame, muy por debajo de `BRICK_H`). Subirlo exige revisar la detección de colisión.
- Los IDs del DOM se cachean al cargar el script (`getElementById` en el top level): cualquier ID nuevo en `index.html` requiere su constante en `game.js`.
- Los archivos de `assets/sounds/` existen pero no se usan: el audio entra en una spec posterior.
- Texto de UI en español (HUD, overlays, botón); comentarios, README y specs también en español.
