# SPEC 03 — Cinco niveles con progresión y truco LEVEL

> **Estado:** Implementado
> **Depende de:** SPEC 01, SPEC 02
> **Fecha:** 2026-08-18
> **Objetivo:** Convertir el único nivel de la SPEC 01 en una progresión de cinco niveles con disposiciones de bloques distintas, que se avanzan rompiendo todos los bloques o tecleando `LEVEL` con el juego en pausa, mostrando el número de nivel a la izquierda de los puntos en el HUD.

---

## Por qué existe esta spec

La SPEC 01 dejó "múltiples niveles y progresión entre ellos" explícitamente fuera de alcance y modeló el nivel como una constante única, `LEVEL`, un array de 6 strings de 10 caracteres. Toda la maquinaria de render, colisión y puntuación ya funciona sobre esa matriz: lo único que falta es que haya cinco matrices en vez de una y un estado que diga en cuál estamos.

Esta spec no toca la física, ni el audio, ni el mod elo de bloques. Añade una capa de progresión por encima de lo que ya existe.

El truco `LEVEL` es una herramienta de desarrollo tanto como un huevo de pascua: sin él, verificar el nivel 5 obliga a jugarse los cuatro anteriores en cada prueba.

---

## Alcance

**Dentro:**

- Sustituir la constante `LEVEL` de `game.js` por `LEVELS`, un array de cinco matrices de 6×10 caracteres.
- Cinco disposiciones concretas: la actual (nivel 1), tablero de ajedrez, paraguas, nubes y la cara de Super Mario, con más bloques grises en cada nivel sucesivo.
- Estado `level` (1–5) y función `loadLevel(n)` que monta la rejilla sin tocar puntuación ni vidas.
- Paso de nivel al romper el último bloque: overlay `¡NIVEL N COMPLETADO!`, el bucle se detiene y el jugador continúa con espacio o clic.
- Una vida extra por cada nivel completado, sin tope.
- Truco: teclear `L-E-V-E-L` **con el juego en pausa** completa el nivel actual y carga el siguiente.
- La puntuación se acumula durante toda la partida; `broken` se reinicia en cada nivel, así que la bola vuelve a la velocidad base.
- Completar el nivel 5 (por bloques o por truco) dispara la victoria ya existente.
- Indicador `Nivel: N` en el HUD, a la izquierda de `Puntos:`.
- Actualizar `README.md` (niveles, truco) y `CLAUDE.md` (arquitectura de niveles, restricciones nuevas).

**Fuera de alcance (para specs futuras):**

- Persistencia del nivel alcanzado. No hay claves nuevas en `localStorage`; reiniciar siempre vuelve al nivel 1.
- Selector de nivel en la UI, o variante del truco que salte a un nivel concreto (`LEVEL` + número).
- Más de cinco niveles, o generación procedural de rejillas.
- Cambiar `COLS`, `ROWS`, `BRICK_W` o `BRICK_H` por nivel. Los cinco niveles caben en la misma rejilla 10×6.
- Bloques con más de 2 golpes, bloques indestructibles o nuevos colores.
- Sonido de nivel completado. No se añaden mp3 ni eventos de audio nuevos.
- Cambios en la velocidad de la bola, el paddle o el rebote más allá del reinicio de `broken`.
- Power-ups, high scores, editor de niveles.
- Tests automáticos, linter, `package.json`.

---

## Modelo de datos

Cambios en `game.js`. El modelo de bloque (`{ x, y, color, hits, alive }`), `CHAR_COLORS`, `SCORES` y todo lo de la SPEC 02 quedan intactos.

```js
// ID del DOM nuevo, cacheado en el top level junto a los existentes
const levelEl = document.getElementById("level");

// La constante LEVEL de la SPEC 01 pasa a ser el primer elemento de LEVELS.
// r=red  p=hotpink  m=magenta  y=yellow  g=green  c=cyan  G=gris(2 golpes)  .=vacío
const LEVELS = [
  [ // 1 — el de la SPEC 01. 4 grises.
    "rrrrGGrrrr",
    "pppppppppp",
    "mmmmmmmmmm",
    "yyyyGGyyyy",
    "gggggggggg",
    "cccccccccc",
  ],
  [ // 2 — tablero de ajedrez. 6 grises.
    "r.r.G.r.r.",
    ".p.p.p.G.p",
    "m.G.m.m.m.",
    ".y.y.G.y.y",
    "g.g.G.g.g.",
    ".c.c.c.c.G",
  ],
  [ // 3 — paraguas: copa roja y mango magenta. 8 grises.
    "...rGGr...",
    "..rrGGrr..",
    ".GrrrrrrG.",
    "....mm....",
    "....mm....",
    "..GGm.....",
  ],
  [ // 4 — dos nubes cian con base gris. 10 grises.
    ".cc....cc.",
    "ccGc..cGcc",
    ".GG....GG.",
    "...cccc...",
    "..cccccc..",
    "...GGGG...",
  ],
  [ // 5 — cara de Super Mario: gorra roja, ojos y bigote grises. 14 grises.
    "..rrrrrr..",
    ".rrrrrrrr.",
    ".yyGyyGyy.",
    ".yyyyyyyy.",
    ".GGGGGGGG.",
    "..yGGGGy..",
  ],
];
const LEVEL_COUNT = LEVELS.length;   // 5
const CHEAT_CODE = "LEVEL";

// Estado de partida (todo dentro de init(), como el resto)
let level = 1;              // 1..LEVEL_COUNT
let levelClear = false;     // nivel superado, esperando espacio o clic
let cheatBuf = "";          // letras acumuladas del truco, solo en pausa
```

Convenciones:

- `level` es **1-indexado** en el estado y en el HUD; el acceso al array es `LEVELS[level - 1]`.
- Las cinco matrices cumplen la misma restricción que la SPEC 01: exactamente `ROWS` strings de `COLS` caracteres, y todo carácter distinto de `.` existe en `CHAR_COLORS`.
- `levelClear` es un cuarto estado de parada junto a `paused`, `gameOver` y `won`. Con `levelClear === true` el bucle está detenido y el overlay visible.
- `cheatBuf` acumula solo mientras `paused === true`. Cualquier tecla que rompa el prefijo de `CHEAT_CODE` lo vacía. No hay timeout.
- La puntuación (`score`) y las vidas (`lives`) **no** se tocan al cambiar de nivel; `broken`, `bricks`, `explosions` y la bola sí se reinician.
- No se persiste nada nuevo. `localStorage` sigue guardando solo `arkanoid.v1.volume` y `arkanoid.v1.muted`.

---

## Plan de implementación

1. **HUD del nivel.** En `index.html`, dentro de `#hud` y **antes** del `<span>` de puntos, añadir `<span>Nivel: <strong id="level">1</strong></span>`. En `game.js`, cachear `levelEl` en el top level y añadir `levelEl.textContent = level;` a `updateHUD()`. En `style.css`, comprobar que el nuevo span hereda el estilo del HUD sin reglas nuevas; si el `gap` queda apretado, ajustarlo. Verificación: el HUD muestra `Nivel: 1  Puntos: 0  Vidas: ●●●` y el botón Reiniciar sigue pegado a la derecha.
2. **`LEVELS` y `loadLevel(n)`.** Sustituir la constante `LEVEL` por el array `LEVELS` con las cinco matrices del modelo de datos. Extraer el montaje de la rejilla que hoy vive en `init()` a `loadLevel(n)`: asigna `level = n`, construye `bricks` desde `LEVELS[n - 1]`, pone `broken = 0`, vacía `explosions`, llama a `resetBall()` y a `updateHUD()`. `init()` pasa a llamar a `loadLevel(1)` tras reiniciar `score`, `lives` y las banderas. Verificación: el juego arranca igual que antes; cambiar a mano la llamada a `loadLevel(3)` en `init()` pinta el paraguas y la partida es jugable.
3. **Detección de nivel completado.** Donde hoy `hitBricks()` (o su comprobación de victoria) detecta que no quedan bloques vivos, bifurcar: si `level < LEVEL_COUNT`, llamar a `completeLevel()`; si no, a la victoria existente. `completeLevel()` pone `levelClear = true`, suma `lives++`, llama a `updateHUD()` y muestra `showOverlay("¡NIVEL " + level + " COMPLETADO!\nPuntuación: " + score)`. El bucle se detiene igual que en pausa: cancelar `animId` y no repintar hasta que se apaguen las explosiones. Verificación: con `loadLevel(4)` forzado a mano y un nivel casi vacío, romper el último bloque muestra el overlay, el juego se para y el HUD sube una vida.
4. **Continuar al nivel siguiente.** Añadir `nextLevel()`: oculta el overlay, pone `levelClear = false`, llama a `loadLevel(level + 1)`, resetea `lastTime` y relanza el bucle. Engancharla al mismo camino que ya usa el jugador para sacar la bola: en `launchBall()` (espacio y clic), si `levelClear` está activo, llamar a `nextLevel()` y salir. Verificación: tras el overlay de nivel completado, espacio o clic carga la rejilla nueva con la bola pegada al paddle; el HUD marca el nivel siguiente y los puntos se conservan.
5. **Truco `LEVEL` en pausa.** En el `keydown` existente, tras las teclas ya gestionadas: si `paused && !gameOver && !won && !levelClear` y `e.key` es una única letra, pasarla a mayúscula y añadirla a `cheatBuf`; recortar `cheatBuf` a los últimos `CHEAT_CODE.length` caracteres y, si coincide con `CHEAT_CODE`, vaciarlo y llamar a `cheatSkipLevel()`. Cualquier otra tecla vacía `cheatBuf`. `togglePause()` también lo vacía al entrar y al salir de pausa. `cheatSkipLevel()`: si `level < LEVEL_COUNT`, quita la pausa (`paused = false`, `hideOverlay()`), carga `loadLevel(level + 1)`, resetea `lastTime` y relanza el bucle, dejando la bola pegada al paddle; si `level === LEVEL_COUNT`, dispara la victoria. Verificación: pausar con `Esc`, teclear `level`, y el juego reanuda en el nivel siguiente con la bola en el paddle; teclear `levex` o `lvel` no hace nada.
6. **Reinicio y estados.** Comprobar que `init()` deja `level = 1`, `levelClear = false` y `cheatBuf = ""`, y que `restart()` funciona desde pausa, game over, victoria **y** desde el overlay de nivel completado (cancelando el `animId` vivo). Comprobar también que el bucle ignora `update()` cuando `levelClear` está activo, igual que hace con `paused`. Verificación: pulsar Reiniciar en cada uno de los cuatro estados devuelve al nivel 1 con 3 vidas y 0 puntos, sin dejar el bucle duplicado.
7. **Documentación.** Actualizar `README.md`: hay cinco niveles, se avanza rompiendo todos los bloques, cada nivel completado da una vida, y el truco es teclear `LEVEL` con el juego en pausa. Actualizar `CLAUDE.md`: `LEVELS` en lugar de `LEVEL`, `loadLevel()` frente a `init()`, el estado `levelClear`, y las restricciones nuevas (las cinco matrices deben cumplir `ROWS`×`COLS`; añadir un nivel es añadir un elemento a `LEVELS`, no tocar `LEVEL_COUNT` a mano). Verificación: releer ambos archivos y comprobar que no queda ninguna frase que hable de "un único nivel".

---

## Criterios de aceptación

- [ ] El HUD muestra `Nivel: N` a la izquierda de `Puntos:`, y `N` es el nivel en curso.
- [ ] Al cargar la página el juego arranca en el nivel 1 con la rejilla de la SPEC 01.
- [ ] Los cinco niveles tienen disposiciones de bloques distintas entre sí: la original, tablero de ajedrez, paraguas, nubes y cara de Super Mario.
- [ ] Cada nivel tiene estrictamente más bloques grises que el anterior (4, 6, 8, 10, 14).
- [ ] Cada una de las cinco matrices tiene exactamente 6 strings de 10 caracteres.
- [ ] Romper el último bloque de un nivel 1–4 muestra el overlay `¡NIVEL N COMPLETADO!` con la puntuación y detiene el juego.
- [ ] Desde ese overlay, espacio o clic carga el nivel siguiente con la bola pegada al paddle.
- [ ] Completar un nivel suma exactamente una vida, y el contador del HUD la refleja.
- [ ] Las vidas no tienen tope: completar cuatro niveles seguidos sin morir deja 7 vidas, y el HUD pinta 7 iconos.
- [ ] La puntuación se acumula entre niveles: no se reinicia al pasar de nivel.
- [ ] Al empezar cada nivel la bola vuelve a su velocidad base, porque `broken` se reinicia.
- [ ] Romper el último bloque del nivel 5 muestra el overlay de victoria de la SPEC 01, no el de nivel completado.
- [ ] Con el juego pausado, teclear `l-e-v-e-l` (en minúsculas o mayúsculas) quita la pausa y carga el nivel siguiente.
- [ ] El truco en el nivel 5 dispara la victoria.
- [ ] Teclear `level` **sin** estar en pausa no hace nada.
- [ ] Teclear el truco en game over, en victoria o en el overlay de nivel completado no hace nada.
- [ ] Una secuencia incorrecta (`levex`, `lvel`) no avanza de nivel; volver a teclear `level` correctamente sí.
- [ ] Pulsar `P`, `Esc` o `M` mientras se teclea el truco no lo dispara ni rompe la pausa de forma inesperada.
- [ ] El botón Reiniciar devuelve al nivel 1 con 3 vidas y 0 puntos desde cualquiera de los cuatro estados: jugando, en pausa, en game over / victoria y en nivel completado.
- [ ] Reiniciar o cambiar de nivel no altera el volumen ni el estado de mute.
- [ ] Perder la última vida en cualquier nivel muestra el game over normal, sin saltar de nivel.
- [ ] No se añaden claves nuevas a `localStorage`.
- [ ] No suena nada nuevo al completar un nivel.
- [ ] La consola no muestra errores en una partida completa del nivel 1 al 5.

---

## Decisiones

- **Sí:** `LEVELS` como array de matrices de caracteres, con la del nivel 1 idéntica a la actual. Reutiliza tal cual el parser de `CHAR_COLORS` y hace que añadir un nivel sea añadir seis strings, sin tocar código.
- **No:** un formato de nivel más rico (JSON con posiciones, golpes y colores por bloque). Daría libertad, pero para cinco rejillas 10×6 el string es más legible y se edita a ojo en el propio archivo.
- **No:** cargar los niveles desde archivos externos. Obligaría a `fetch`, lo que rompe el juego bajo `file://`, que hoy funciona.
- **Sí:** misma rejilla 10×6 en los cinco niveles. Mantiene intacta la restricción `GRID_X * 2 + COLS * BRICK_W === W` del `CLAUDE.md` y evita recalcular la geometría por nivel.
- **Sí:** dificultad creciente solo por número de grises y por forma. Los huecos de las formas hacen los niveles más difíciles de despejar sin tocar la física.
- **No:** subir la velocidad base por nivel. `BALL_SPEED_MAX` está tasado en la SPEC 01 para evitar tunneling; tocarlo obliga a revisar la detección de colisión, y no es lo que pide esta spec.
- **Sí:** `broken` se reinicia en cada nivel. Cada nivel es un reto completo con su propia curva de aceleración; arrastrarlo dejaría el nivel 5 a velocidad máxima desde el primer rebote.
- **Sí:** la puntuación se acumula toda la partida. Es la métrica de la partida completa, no del nivel; reiniciarla haría irrelevantes los cuatro primeros niveles.
- **Sí:** overlay de nivel completado y continuación manual con espacio o clic. Igual que el saque inicial, así que no hay control nuevo que aprender, y evita perder una vida por un cambio de rejilla inesperado.
- **No:** avance automático a los 2 segundos. Un temporizador añade un estado más al bucle y quita al jugador el control del momento de arranque.
- **Sí:** `levelClear` como bandera separada de `paused`. Mezclarlas obligaría a distinguir "pausa del jugador" de "pausa del sistema" en `togglePause()`, `restart()` y el overlay.
- **Sí:** una vida extra por nivel completado, **sin tope**. Decisión explícita del usuario frente a la alternativa de topar en 3: premia llegar lejos y hace el nivel 5 abordable.
- **No:** tope de vidas. Se descarta a sabiendas de que el HUD tendrá que pintar hasta 7 iconos de bola; está recogido en riesgos.
- **Sí:** el truco solo funciona con el juego **en pausa**. Decisión del usuario: elimina de raíz el disparo accidental, ya que durante la partida las manos están en las flechas y el espacio.
- **No:** el truco durante la partida. Era la opción por defecto, pero `L`, `E` y `V` son teclas alcanzables sin querer y el coste de un salto de nivel accidental es alto.
- **No:** timeout entre letras. Con el juego en pausa no hay prisa; un temporizador solo añadiría estado y un caso de prueba difícil de reproducir.
- **No:** variante `LEVEL` + número para saltar a un nivel concreto. Más potente, pero exige un segundo estado de entrada de teclado. Si hace falta, va en otra spec.
- **Sí:** el truco sale de pausa y deja la bola pegada al paddle. Es lo mismo que ocurre al empezar cualquier nivel; devolver el control con la bola en juego sería injusto.
- **Sí:** el truco en el nivel 5 dispara la victoria. La alternativa (ignorarlo) haría parecer que el truco está roto en el último nivel.
- **Sí:** el número de nivel a la izquierda de los puntos, con la etiqueta `Nivel:`. Coherente con `Puntos:` y `Vidas:`; el orden pedido por el usuario coloca lo más estable a la izquierda.
- **No:** mostrar `3/5`. Añade información de progreso, pero rompe la simetría con los otros dos indicadores del HUD.
- **No:** persistir el nivel alcanzado en `localStorage`. Sin selector de nivel no habría dónde usarlo, y arrancar automáticamente en el nivel 4 le quitaría al jugador la partida completa.
- **Sí:** ningún sonido nuevo. La SPEC 02 dejó fuera todo lo que no fuera rebote y rotura; ampliarlo aquí sería colar audio por la puerta de atrás.
- **Sí:** textos de UI en español (`Nivel:`, `¡NIVEL N COMPLETADO!`). Consistente con las SPEC 01 y 02.

---

## Riesgos identificados

| Riesgo | Mitigación |
| --- | --- |
| Las vidas sin tope desbordan el HUD: `drawLives()` pinta un `<canvas>` de `LIFE_ICON` px por vida y con 7+ el `#hud` puede romper la línea | El HUD es flex y `#lives` crece hacia la derecha; en la práctica el máximo real es 7 (4 niveles completados sin morir). Si al probar se descubre que empuja al botón Reiniciar fuera de sitio, la mitigación es dar `flex-shrink: 0` al botón, no topar las vidas. Está como criterio de aceptación. |
| Renombrar `LEVEL` a `LEVELS` deja alguna referencia viva y el juego arranca sin bloques | El símbolo antiguo desaparece: cualquier uso no migrado da `ReferenceError` visible en la primera carga, no un fallo silencioso. |
| Un `LEVELS` mal escrito (fila de 9 caracteres, carácter no mapeado) genera una rejilla torcida o con huecos raros | El parser de la SPEC 01 ignora los caracteres no mapeados, así que el fallo es visual y no rompe. Se verifica a ojo nivel por nivel, y hay un criterio de aceptación específico sobre 6×10. |
| El truco deja el bucle duplicado: sale de pausa relanzando `requestAnimationFrame` sin cancelar el `animId` anterior | `cheatSkipLevel()` reutiliza exactamente el camino de reanudación que ya usa `togglePause()`, incluido el reseteo de `lastTime`. Mismo patrón que `restart()`. |
| El estado `levelClear` se olvida en alguna comprobación del bucle y la bola sigue moviéndose bajo el overlay | Se añade al mismo `if` que ya filtra `paused`, `gameOver` y `won`, en `update()` y en la condición de parada del bucle. |
| Un nivel con forma (paraguas, nubes) deja bloques inalcanzables si la bola se queda en un patrón repetitivo | Las cinco formas dejan siempre las filas inferiores despejadas o parcialmente ocupadas, así que la bola entra por debajo. La aceleración por `broken` rompe además cualquier ciclo estable. |
| Colisión del truco con teclas ya usadas (`P`, `Esc`, `M`, flechas, espacio) | Verificado: `LEVEL` usa `L`, `E` y `V`, ninguna de ellas asignada hoy. Aun así, cualquier tecla fuera del prefijo vacía `cheatBuf`, así que `M` a media secuencia solo la cancela. |

---

## Lo que **no** entra en esta spec

- Persistencia del nivel alcanzado o de cualquier récord.
- Selector de nivel en la UI, o truco que salte a un nivel concreto.
- Más de cinco niveles, o rejillas de tamaño distinto por nivel.
- Bloques nuevos: más golpes, indestructibles o colores adicionales.
- Sonido de nivel completado.
- Power-ups, editor de niveles, high scores.

Cada uno de ellos, si llega, va en su propia spec.
