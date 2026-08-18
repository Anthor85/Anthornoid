# Juego Anthornoid

Arkanoid en HTML, CSS y JavaScript vanilla, sin dependencias ni build. Un nivel de 60 bloques, 3 vidas y puntuación.

## Ejecutar

No hay nada que instalar ni compilar. Basta con abrir `index.html` en el navegador:

```bash
start index.html              # Windows, abrir directo con file://
```

Si prefieres servirlo por HTTP:

```bash
python3 -m http.server 8000   # o npx serve .  /  php -S localhost:8000
```

## Controles

| Acción | Tecla / ratón |
| --- | --- |
| Mover el paddle | Mover el ratón sobre el canvas, o flechas ← → |
| Sacar la bola | Espacio o clic |
| Pausar / reanudar | `Esc` o `P` |
| Silenciar / activar sonido | `M`, o el botón 🔊 / 🔇 del HUD |
| Ajustar el volumen | Slider del HUD, junto a las vidas |
| Reiniciar | Botón **Reiniciar** del HUD |

## Cómo se juega

- La bola empieza pegada al paddle. Se saca con espacio o clic.
- El ángulo de rebote depende del punto del paddle donde golpee: por el centro sale casi vertical, por los extremos sale muy abierta (hasta 60º).
- Los bloques de color se rompen de un golpe; los grises necesitan dos.
- Puntuación por bloque: gris 100, rojo 70, rosa 60, magenta 50, amarillo 40, verde 30, cian 20.
- Cada 10 bloques rotos la bola acelera 20 px/s, hasta un tope de 520 px/s.
- Se pierde una vida cuando la bola cae por abajo. Con 0 vidas, game over. Rompiendo los 60 bloques, victoria.

## Sonido

- La bola suena al rebotar en las paredes, en el paddle y al golpear un bloque gris sin romperlo.
- Al destruir un bloque suena el efecto de rotura.
- El volumen y el mute se recuerdan entre sesiones.
- Si abres el juego por `file://` puede que el navegador bloquee la carga de los `.mp3`. El juego funciona igual, solo que mudo; sírvelo por HTTP para oírlo.
# Anthornoid
