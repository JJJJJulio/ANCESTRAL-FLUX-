# ANCESTRAL-FLUX-

Proyecto generativo artistico inspirado en CHAKANA.

## Contenido

- `CHAKANA-FLUX.py`: version Processing Python Mode (single-file).
- `index.html` + `web-sketch.js` + `styles.css`: pagina web interactiva con la misma logica visual base (particulas, trails, glow, links y modos).

## Pagina web

Abrir `index.html` en navegador o servir con HTTP local.

Controles web:
- `1..5` modos
- `P` paleta dinamica Bauhaus ON/OFF
- `V` lineas ON/OFF
- `G` glow ON/OFF
- `T` trails ON/OFF
- `C` variacion de paleta
- `R` nueva seed

Interaccion del mouse (protagonica):
- mover mouse: deforma y arrastra el flujo
- mantener click: activa vortice intenso y mayor energia visual

Imagen de referencia:
- si existe `shape.png` junto a `index.html`, se usa como mascara base
- si no existe, el sistema usa texto "CHAKANA" como forma fallback
update