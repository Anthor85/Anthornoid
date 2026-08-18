# SPEC 02 — Audio de efectos y control de volumen

> **Estado:** Aprobado
> **Depende de:** SPEC 01
> **Fecha:** 2026-08-18
> **Objetivo:** Reproducir los dos mp3 de `assets/sounds/` en los rebotes de la bola y en la destrucción de bloques, con un slider de volumen y un botón de mute en el HUD junto a las vidas, persistidos en `localStorage`.

---

## Por qué existe esta spec

La SPEC 01 dejó `assets/sounds/ball-bounce.mp3` y `assets/sounds/break-sound.mp3` en el repositorio sin usar, con el audio explícitamente fuera de alcance ("primero la mecánica y el feedback visual"). Esta spec cierra ese hueco: añade la capa de sonido y su control de usuario, sin tocar la mecánica de juego.

Es también la primera spec que escribe en `localStorage`, así que fija la convención de claves (`arkanoid.v1.*`) que heredará la futura spec de high scores.

---

## Alcance

**Dentro:**

- Capa de audio en `game.js`: precarga de los dos mp3 y una única función de reproducción.
- `ball-bounce.mp3` en: rebote contra pared izquierda, derecha y techo; rebote contra el paddle; y golpe a un bloque gris que **no** lo destruye.
- `break-sound.mp3` al destruir un bloque (cualquier color, incluido el gris en su segundo golpe).
- Slider de volumen `<input type="range">` en el HUD, a la derecha de las vidas.
- Botón de mute con icono 🔊 / 🔇 a la izquierda del slider, y tecla `M` equivalente.
- Persistencia de volumen y mute en `localStorage` con claves planas versionadas.
- Degradación silenciosa: si el audio no carga o el navegador bloquea la reproducción, el juego sigue funcionando sin errores en consola ni aviso al usuario.
- Actualizar `README.md` (controles: tecla `M`) y `CLAUDE.md` (arquitectura de la capa de audio, restricciones).

**Fuera de alcance (para specs futuras):**

- Música de fondo.
- Sonidos para perder una vida, game over, victoria, lanzar la bola o pausar. Solo los tres eventos pedidos.
- Nuevos archivos de audio: se usan exclusivamente los dos mp3 ya presentes.
- Web Audio API (`AudioContext`, nodos de ganancia, panning). Se usa el elemento `Audio`.
- Persistencia de puntuación o high scores, aunque esta spec introduzca `localStorage`.
- Variación de tono/pitch según la velocidad de la bola o el color del bloque.
- Silenciado automático al perder el foco de la pestaña.
- Tests automáticos, linter, `package.json`.

---

## Modelo de datos

Añadidos a `game.js`. No se modifica ninguna estructura existente de la SPEC 01.

```js
// IDs del DOM nuevos, cacheados en el top level junto a los existentes
const volumeEl = document.getElementById("volume");
const muteEl   = document.getElementById("mute");

// Constantes de audio
const SOUNDS = {
  bounce: "assets/sounds/ball-bounce.mp3",
  break:  "assets/sounds/break-sound.mp3",
};
const AUDIO_POOL = 8;                   // clones precargados por sonido
const VOLUME_DEFAULT = 50;              // 0–100, primera visita
const MUTED_DEFAULT  = false;
const STORE_VOLUME = "arkanoid.v1.volume";
const STORE_MUTED  = "arkanoid.v1.muted";

// Estado de audio (fuera de init(): sobrevive a reinicios de partida)
let audio = {};                // { bounce: [HTMLAudioElement], break: [...] }  pool precargado por sonido
let audioIdx = {};             // { bounce: 0, break: 0 }  siguiente elemento del pool a usar
let volume = VOLUME_DEFAULT;   // 0–100
let muted  = MUTED_DEFAULT;
```

Convenciones:

- `volume` se guarda en `0–100` (lo que muestra el slider); al reproducir se divide por 100 para el `.volume` del elemento `Audio`, que va en `0–1`.
- `volume` guarda siempre el **nivel elegido**; el slider muestra el **volumen efectivo**, así que baja a 0 al mutear y vuelve a `volume` al desmutear. `volume` no se pierde: mutear no lo toca.
- Mover el slider estando muteado quita el mute y fija ese nivel. Un `volume` de 0 con `muted = false` también resulta en silencio.
- Cada clave de `audio` guarda un **pool** de `AUDIO_POOL` elementos ya cargados y decodificados. `playSound` rota por el pool con `audioIdx`, así el solapamiento no corta el sonido anterior y la reproducción es inmediata.
- El estado de audio **no** se reinicia en `init()` ni con el botón Reiniciar: es preferencia de usuario, no estado de partida.
- Claves de `localStorage` con prefijo `arkanoid.v1.` y valores planos como string. Cualquier valor ausente, no numérico o fuera de rango cae al default sin lanzar.

---

## Plan de implementación

1. **HTML y CSS del control.** En `index.html`, dentro de `#hud` y después de `#lives-box`, añadir un `<span id="sound-box">` con `<button id="mute" type="button">🔊</button>` y `<input id="volume" type="range" min="0" max="100" step="1" value="50">`. En `style.css` estilar `#sound-box` en línea con el resto del HUD (mismo `gap`, botón tipo icono sin borde ni fondo, slider estrecho de ~100 px). Verificación: el HUD muestra icono y slider junto a las vidas, alineados, y el botón Reiniciar sigue pegado a la derecha.
2. **Precarga y reproducción.** En `game.js`, añadir las constantes y el estado de audio e implementar `loadSounds()` (crea `AUDIO_POOL` elementos `Audio(src)` por clave, con `preload = "auto"`, `load()` para forzar descarga y decode, y el evento `error` silenciado) y `playSound(name)`: sale si `muted`, si `volume === 0` o si el pool no existe; si no, toma el siguiente elemento rotando `audioIdx`, lo rebobina con `currentTime = 0`, le asigna `volume / 100` y llama a `play()` ignorando el rechazo de la promesa, todo dentro de `try/catch`. Verificación: desde la consola del navegador, `playSound("bounce")` suena, y dos llamadas seguidas producen dos sonidos solapados.
3. **Enganchar los eventos de juego.** Llamar a `playSound("bounce")` en el rebote de pared (izquierda, derecha y techo) y dentro de `hitPaddle()` cuando se confirma el impacto. En `hitBricks()`, tras decrementar `hits`: `playSound("break")` si el bloque queda destruido, `playSound("bounce")` si sobrevive (gris al primer golpe). Verificación: jugar una partida — suena en cada pared, en cada toque de paddle, y el gris hace "bounce" y luego "break".
4. **Slider de volumen.** Implementar `setVolume(v)`: acota a `[0, 100]`, asigna `volume`, sincroniza `volumeEl.value` y persiste. Enganchar el evento `input` de `#volume` a `setVolume(Number(volumeEl.value))`. Verificación: mover el slider cambia el volumen de los rebotes en tiempo real; a 0 no se oye nada.
5. **Mute (botón y tecla).** Implementar `setMuted(m)`: asigna `muted`, sincroniza botón y slider, y persiste. El pintado del botón vive en `syncMuteButton()` (texto `🔇`/`🔊`, `aria-pressed`, `title`, `aria-label`) y el del slider en `syncVolumeSlider()` (`0` si `muted`, `volume` si no), para poder aplicar el estado inicial sin volver a persistirlo. Enganchar el `click` de `#mute` y la tecla `M` (en el mismo `keydown` que `Esc`/`P`) a `setMuted(!muted)`. Tras usar el botón, quitarle el foco (`muteEl.blur()`) para que la barra espaciadora no lo vuelva a pulsar en lugar de sacar la bola. En el `input` del slider, si estaba muteado se quita el mute antes de aplicar el nuevo volumen. Verificación: el icono alterna, el slider cae a 0 al mutear y vuelve a su sitio al desmutear; pulsar `M` hace lo mismo; arrastrar el slider estando muteado desmutea; tras clicar el botón, espacio sigue sacando la bola.
6. **Persistencia.** Implementar `loadAudioPrefs()` (lee las dos claves, valida y cae a los defaults) y `saveAudioPrefs()` (escribe ambas), las dos envueltas en `try/catch` porque `localStorage` puede lanzar en modo privado o bajo `file://`. Llamar a `loadAudioPrefs()` al arrancar, antes de aplicar el estado inicial al slider y al botón, y a `saveAudioPrefs()` desde `setVolume` y `setMuted`. Verificación: bajar el volumen a 20, mutear, recargar la página → el slider marca 20 y el icono está en 🔇.
7. **Documentación.** Actualizar `README.md` (mencionar el control de sonido y la tecla `M` en los controles) y `CLAUDE.md` (sección de audio en la arquitectura, más las restricciones: todo ID nuevo del DOM requiere su constante, el estado de audio queda fuera de `init()`, y las claves de `localStorage` usan el prefijo `arkanoid.v1.`). Verificación: releer ambos archivos y comprobar que no queda ninguna frase que diga que el juego no tiene audio.

---

## Criterios de aceptación

- [ ] Al rebotar contra la pared izquierda, la derecha o el techo suena `ball-bounce.mp3`.
- [ ] Al rebotar contra el paddle suena `ball-bounce.mp3`.
- [ ] Al destruir un bloque de color suena `break-sound.mp3`.
- [ ] El primer golpe a un bloque gris (que no lo destruye) suena `ball-bounce.mp3`; el segundo, que sí lo destruye, suena `break-sound.mp3`.
- [ ] Perder una vida, el game over, la victoria, sacar la bola y pausar no reproducen ningún sonido.
- [ ] Dos bloques destruidos con muy poca diferencia de tiempo producen dos sonidos solapados, sin que el segundo corte al primero.
- [ ] El HUD muestra, entre las vidas y el botón Reiniciar, un botón de icono de sonido y un slider de volumen.
- [ ] Mover el slider cambia el volumen del siguiente sonido reproducido.
- [ ] Con el slider a 0 no se oye ningún sonido.
- [ ] El botón de mute alterna entre 🔊 y 🔇 y silencia / restaura el audio.
- [ ] La tecla `M` hace exactamente lo mismo que el botón de mute.
- [ ] Mutear baja el slider a 0; desmutear lo devuelve al nivel que tenía antes, y el volumen se restaura con él.
- [ ] Arrastrar el slider estando muteado quita el mute, el icono vuelve a 🔊 y se oye al nivel arrastrado.
- [ ] Tras hacer clic en el botón de mute, la barra espaciadora sigue sacando la bola en vez de re-pulsar el botón.
- [ ] Recargar la página conserva el volumen y el estado de mute.
- [ ] La primera visita (sin datos en `localStorage`) arranca con volumen 50 y sin mutear.
- [ ] El botón Reiniciar no cambia el volumen ni el estado de mute.
- [ ] Con los mp3 renombrados o ausentes, el juego arranca y se juega con normalidad, sin errores no capturados en consola.
- [ ] Abrir `index.html` por `file://` no rompe el juego aunque el navegador bloquee el audio o `localStorage`.

---

## Decisiones

- **Sí:** elemento `Audio` de HTML5. Suficiente para dos efectos cortos, funciona por `file://` en la mayoría de navegadores y no obliga a gestionar el ciclo de vida de un `AudioContext`.
- **No:** Web Audio API. Daría control de pitch, mezcla y latencia, pero exige desbloquear el `AudioContext` con un gesto de usuario y montar un grafo de nodos. Desproporcionado para dos mp3.
- **Sí:** pool fijo de `AUDIO_POOL = 8` elementos precargados por sonido, rotando en cada reproducción. Permite que dos roturas simultáneas suenen a la vez y el `play()` es inmediato porque el elemento ya está decodificado.
- **No:** clonar con `cloneNode()` en cada reproducción (era la decisión original). Se probó y metía retraso audible: cada clon rearranca su propio ciclo de carga y decode antes de sonar. El pool era la mitigación que ya contemplaba la tabla de riesgos.
- **No:** un único elemento por sonido con `currentTime = 0`. Corta el sonido anterior y suena mal cuando la bola encadena bloques.
- **Sí:** `ball-bounce.mp3` también en el golpe al gris que no lo destruye. El sonido comunica "rebotó pero no rompió", que es exactamente lo que ocurre; usar `break-sound` ahí mentiría al jugador.
- **Sí:** slider **y** botón de mute. El slider solo obliga a recordar a mano el valor anterior para silenciar un momento; el botón resuelve ese caso con un clic.
- **Sí:** `muted` como estado separado de `volume`, pero con el slider reflejando el volumen **efectivo**: cae a 0 al mutear y se restaura al desmutear. Cambio pedido durante la implementación sobre la decisión original ("mutear no mueve el slider"): así el control no miente, muestra a 0 lo que de hecho suena a 0. `volume` sigue guardando el nivel elegido, que es lo que evita perderlo.
- **Sí:** arrastrar el slider estando muteado quita el mute. Un slider a 0 que se arrastra y sigue sin sonar parecería un control roto.
- **No:** deshabilitar el slider mientras está muteado. Resuelve la ambigüedad pero deja un control gris que no responde.
- **Sí:** tecla `M` además del botón. Coherente con `Esc`/`P` para pausa: los controles frecuentes tienen atajo.
- **Sí:** persistir en `localStorage` con claves planas versionadas (`arkanoid.v1.volume`, `arkanoid.v1.muted`). Son dos escalares; un JSON obligaría a parsear y validar un objeto sin ganar nada. El prefijo `v1` deja la puerta abierta a migrar sin colisionar.
- **No:** persistir en un objeto JSON único. Se reconsiderará si la spec de high scores necesita guardar estructuras; entonces esa spec tendrá su propia clave.
- **Sí:** el estado de audio vive fuera de `init()`. Es preferencia de usuario, no estado de partida: reiniciar no debe subir el volumen de golpe.
- **Sí:** volumen por defecto 50. Audible sin sobresaltar en la primera carga.
- **Sí:** degradación totalmente silenciosa ante fallo de audio o de `localStorage`. El audio es accesorio; un juego que peta porque no encuentra un mp3 es peor que un juego mudo. Además evita ruido en consola por la autoplay policy.
- **No:** aviso en el HUD cuando el audio falla. Añade UI y casos de prueba para informar de algo que el jugador no puede arreglar.
- **No:** música de fondo ni sonidos de vida perdida / game over / victoria. El usuario pidió tres eventos concretos; ampliarlos es otra spec.
- **Sí:** textos de UI en español, incluidos `title` y `aria-label` del botón de mute. Consistente con la SPEC 01.

---

## Riesgos identificados

| Riesgo | Mitigación |
| --- | --- |
| La autoplay policy del navegador rechaza `play()` antes del primer gesto de usuario | La primera reproducción siempre llega después de un clic o una tecla (sacar la bola), así que en la práctica ya hay gesto. Aun así, la promesa de `play()` se ignora con `.catch()` y todo va en `try/catch`. |
| Chrome bloquea la carga de los mp3 por `file://` | El fallo es silencioso por diseño: el juego sigue jugable. El `README.md` ya recomienda servir por HTTP estático, que es el camino que garantiza el audio. |
| Crear un clon de `Audio` por rebote mete latencia audible | Confirmado en pruebas: se sustituyó por un pool fijo de `AUDIO_POOL = 8` elementos precargados con `load()`, sin cambiar de API. |
| Más de 8 sonidos del mismo tipo solapados reutilizan un elemento que aún suena | El pool rota, así que el más antiguo se rebobina. Con un impacto de bloque por frame como máximo (SPEC 01) el caso es teórico; si se diera, el corte afecta a un sonido ya casi terminado. |
| `localStorage` lanza en modo incógnito o bajo `file://` en algunos navegadores | Lectura y escritura envueltas en `try/catch`; ante fallo se usan los defaults en memoria y el juego funciona igual, solo sin persistir. |
| El botón de mute conserva el foco y la barra espaciadora lo vuelve a pulsar en vez de sacar la bola | `blur()` al botón tras el `click`. Está recogido como criterio de aceptación. |
| Valores corruptos en `localStorage` (editados a mano, de otra versión) rompen el arranque | `loadAudioPrefs()` valida tipo y rango; cualquier valor no válido cae al default. |
| Los sonidos se acumulan en cadenas rápidas de bloques y saturan | El volumen es global y el slider está siempre accesible; además el juego rompe como mucho un bloque por frame (SPEC 01). |

---

## Lo que **no** entra en esta spec

- Música de fondo.
- Sonidos de vida perdida, game over, victoria, saque o pausa.
- Nuevos archivos de audio.
- Web Audio API, pitch variable o mezcla espacial.
- High scores o cualquier otra persistencia que no sean el volumen y el mute.
- Silenciado automático al perder el foco de la pestaña.

Cada uno de ellos, si llega, va en su propia spec.
