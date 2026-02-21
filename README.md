# ANCESTRAL-FLUX-

Visual interactivo de partículas con silueta de chakana para GitHub Pages.

## Ejecutar local

```bash
python3 -m http.server 4173
```

Abrir `http://localhost:4173`.

## Verificación para GitHub Pages

- El deploy debe servir desde la raíz (`/(root)`).
- Rutas usadas por la app (todas relativas):
  - `./styles.css`
  - `./web-sketch.js`
  - `./shape.png`
- Si `shape.png` carga bien, la máscara sale de esa imagen.
- Si `shape.png` falla o no tiene alpha útil, la app activa fallback procedural automáticamente y **sigue renderizando chakana**.

## Controles

- Mouse move: flow
- Click sostenido: vortex
- Teclas `1..5`: modos
- Tecla `H`: mostrar/ocultar panel

## Diagnóstico anti-pantalla-negra

El panel muestra:

- `points: N`
- `fps: X`
- `source: shape.png | procedural`

Además hay logs en consola para:

- carga de `shape.png`
- generación de máscara
- conteo de puntos
- inicio del loop de render
  update
