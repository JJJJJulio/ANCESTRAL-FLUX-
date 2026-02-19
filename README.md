# ANCESTRAL-FLUX-

Sketch generativo artistico en **Processing 3.5.4 (Python Mode)**.

## Estado actual

- Todo el sistema esta contenido en un unico archivo: `CHAKANA-FLUX.py`.
- Incluye preview estable, render HD y export de frames.
- Controles en vivo:
  - `1/2/3`: modos de comportamiento
  - `G`: glow por capas ON/OFF
  - `L`: lineas de proximidad ON/OFF
  - `P`: paleta dinamica ON/OFF
  - `H`: campo de fuerza del mouse ON/OFF
  - `E`: export ON/OFF

## Imagen de referencia (MUY IMPORTANTE)

- Agrega tu imagen dentro de la carpeta `data/` del sketch de Processing.
- Nombre recomendado: `shape.png`.
- Si no existe `shape.png`, el sketch intentara cargar automaticamente la primera imagen `.png/.jpg/.jpeg` que encuentre en `data/`.

## Troubleshooting (error de parseo)

Si en la linea 1 ves texto como `diff --git a/...`, no estas ejecutando el sketch sino un **parche git pegado por error**.

- En Processing, abre el archivo real `CHAKANA-FLUX.py` (no el diff del PR).
- El archivo debe empezar con `# -*- coding: utf-8 -*-`.
- Las primeras lineas **no** deben incluir `diff --git`, `index`, `---`, `+++` ni `@@`.

## Export

- Resolucion de export: `1920x1080`
- FPS: `60`
- Duracion: `10s`
- Frames en: `outputs/chakana-flux/<timestamp>/frames/`
