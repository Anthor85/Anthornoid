# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Proyecto

Arkanoid en JavaScript vanilla + HTML5 Canvas. Sin `package.json`, sin bundler, sin transpilador, sin tests, sin linter. 3 archivos propios: `index.html`, `style.css`, `game.js`, más `assets/spritesheet.js` (preexistente, no se toca).

El trabajo se organiza por specs en `specs/`. La base es `specs/01-juego-base.md`; el audio y su control de volumen, `specs/02-audio-y-volumen.md`.

## Ejecutar

```bash
start index.html              # Windows, abrir directo
python3 -m http.server 8000   # o servidor estático (npx serve . / php -S localhost:8000)
```

No hay build ni test que ejecutar. Verificación = abrir en navegador y jugar.

## Arquitectura (`game.js`)

Un único script global, `"use strict"`, sin módulos. Se carga después de `assets/spritesheet.js`, del que consume `loadSpritesheet`, `drawSprite`, `drawFrame`, `SPRITES`, `EXPLOSION_FRAMES` y `EXPLOSION_DURATION`.

- **Estado global mutable**: `bricks, paddle, ball, explosions, score, lives, broken, paused, gameOver, won, keys, lastTime, animId`. Todo se reinicia en `init()`; el estado de audio (`audio, audioIdx, volume, muted`) queda **fuera** de `init()` a propósito, porque es preferencia de usuario y no debe cambiar al reiniciar la partida. `restart()` envuelve a `init()` para el botón del HUD (cancela el `animId` vivo y relanza el bucle, así el reinicio funciona también desde pausa, game over y victoria).
- **Nivel**: `LEVEL` es un array de 6 strings de 10 caracteres. `CHAR_COLORS` traduce cada carácter a una clave de color; un carácter no mapeado (p. ej. `.`) deja hueco. La clave de color es la misma para `SPRITES.blocks`, `EXPLOSION_FRAMES` y `SCORES`, así que un solo string sirve para pintar, explotar y puntuar.
- **Bloques**: `{ x, y, color, hits, alive }`. `hits` son golpes restantes: 2 en `gray`, 1 en el resto. La puntuación se suma solo al destruir, no en cada golpe.
- **Bola**: velocidades en **px/s**, integradas con el delta de `requestAnimationFrame` (nunca por frame). `currentSpeed()` calcula el módulo objetivo a partir de `broken`; `applySpeed()` reescala `vx`/`vy` sin tocar la dirección. `resetBall()` la deja pegada al paddle (`stuck`), `launchBall()` la saca.
- **Colisiones**: `hitPaddle()` deriva el ángulo de salida del offset relativo del impacto, acotado por `MAX_BOUNCE_ANGLE`, conservando el módulo. `hitBricks()` hace AABB contra los bloques vivos, refleja **solo el eje con menor solape** y devuelve tras el primer impacto: una colisión bola-bloque por frame como máximo.
- **Game loop**: `loop(ts)` con delta en segundos acotado por `MAX_DT`. La pausa cancela el `animId` y **resetea `lastTime`** al reanudar para no arrastrar el delta acumulado. Tras game over o victoria el bucle sigue pintando hasta que se apaga la última explosión y entonces se detiene solo.
- **Render**: `draw()` repinta todo cada frame (bloques → explosiones → paddle → bola) con los sprites del spritesheet. `drawExplosions()` filtra las caducadas y elige el frame por tiempo transcurrido sobre `EXPLOSION_DURATION`.
- **Audio**: `loadSounds()` precarga un **pool** de `AUDIO_POOL` elementos `Audio` por sonido (con `load()`, para que estén decodificados) y `playSound(name)` rota por ese pool con `audioIdx`, rebobinando con `currentTime = 0`. El pool existe por dos motivos: permite que dos sonidos iguales se solapen sin cortarse, y evita la latencia que metía clonar con `cloneNode()` en cada impacto. Todo va en `try/catch` y la promesa de `play()` se ignora: si un `.mp3` no carga o el navegador bloquea la reproducción, el juego se queda mudo pero sigue jugable, sin errores en consola.
- **Volumen y mute**: `volume` (0–100) es el nivel elegido y `muted` un flag aparte; el slider muestra el volumen **efectivo**, así que `syncVolumeSlider()` lo pone a 0 mientras haya mute y lo restaura al quitarlo. `syncMuteButton()` pinta el icono y los textos accesibles. `setVolume()` y `setMuted()` son la única vía de cambiar el estado y ambas persisten; las funciones `sync*` solo pintan, para poder aplicar el estado inicial leído sin volver a guardarlo. Mover el slider estando muteado quita el mute. Preferencias en `localStorage` bajo `arkanoid.v1.volume` y `arkanoid.v1.muted`, con `loadAudioPrefs()` / `saveAudioPrefs()` tolerantes a fallo y a valores corruptos.
- **HUD y overlays**: en HTML/CSS, no en el canvas. `updateHUD()`, `showOverlay(texto)` y `hideOverlay()` son la única vía de tocar el DOM. Las vidas no son un número: `drawLives()` genera un `<canvas>` de `LIFE_ICON` px por vida dentro de `#lives` y pinta en cada uno el sprite `ball`.

## Restricciones al modificar

- `W`/`H` deben coincidir con `width`/`height` del `<canvas id="board">` en `index.html`, y con el tamaño de `#stage` en `style.css` (el overlay se posiciona sobre él).
- La geometría de la rejilla debe cuadrar: `GRID_X * 2 + COLS * BRICK_W === W`. Si cambia `COLS`, `BRICK_W` o `GRID_X`, revisar los tres a la vez.
- Las filas de `LEVEL` deben ser exactamente `ROWS` strings de `COLS` caracteres, y cada carácter usado debe existir en `CHAR_COLORS`.
- Toda clave de color nueva necesita entrada en `SPRITES.blocks`, `EXPLOSION_FRAMES` y `SCORES`.
- No modificar `assets/spritesheet.js`: es el contrato de render compartido.
- `BALL_SPEED_MAX` está tasado para evitar tunneling (a 60 fps son ~9 px/frame, muy por debajo de `BRICK_H`). Subirlo exige revisar la detección de colisión.
- Los IDs del DOM se cachean al cargar el script (`getElementById` en el top level): cualquier ID nuevo en `index.html` requiere su constante en `game.js`.
- Toda clave nueva en `SOUNDS` necesita su `.mp3` en `assets/sounds/`; el pool se crea solo, pero un archivo que falte deja ese sonido mudo sin avisar (es intencionado).
- El estado de audio (`audio, audioIdx, volume, muted`) no se toca en `init()`: reiniciar la partida no debe cambiar las preferencias del jugador.
- Las claves de `localStorage` llevan el prefijo `arkanoid.v1.`. Cualquier dato nuevo que se persista (récords, ajustes) debe seguir ese esquema, y todo acceso va en `try/catch`: `localStorage` lanza en modo privado y bajo `file://` en algunos navegadores.
- Nada de audio debe poder romper el juego: `playSound` no lanza nunca y la promesa de `play()` se ignora siempre.
- Texto de UI en español (HUD, overlays, botón); comentarios, README y specs también en español.
