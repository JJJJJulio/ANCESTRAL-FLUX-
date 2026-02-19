# -*- coding: utf-8 -*-
# ============================================================
# CHAKANA - ESTETICA EXPANDIDA + EXPORT HD FRAMES
# Processing 3.5.4 | Python Mode (Jython)
# TODO EN UN SOLO ARCHIVO (sin imports)
# ============================================================

# ---------- PREVIEW ----------
PREVIEW_W, PREVIEW_H = 960, 540

# ---------- EXPORT ----------
EXPORT_W, EXPORT_H = 1920, 1080
FPS = 60
DURATION = 10
TOTAL_FRAMES = FPS * DURATION

EXPORT = False          # tecla E
EXPORT_EVERY = 1        # 1 = 60 fps, 2 = 30 fps
EXPORT_FMT = "png"      # "png" calidad, "jpg" mas rapido

# ---------- AJUSTE ----------
PADDING = 140
ALPHA_THR = 20

# ---------- PARTICULAS ----------
STEP = 13
MAXP = 2400
NOISE_GAIN = 2.8
ATTRACTION = 0.03
DAMPING = 0.89
mode = 2

# ---------- FX / TOGGLES ----------
TRAIL_ALPHA = 18
GLOW_ON = True          # G
LINES_ON = True         # L
PALETTE_ON = True       # P  (ciclo dinamico)
MOUSE_FORCE_ON = True   # H  (campo de fuerza)

# ---------- LINKS ----------
LINK_DIST = 34
LINK_DIST2 = LINK_DIST * LINK_DIST
CELL = 42               # grid para acelerar vecindad
MAX_LINKS_PER_PARTICLE = 3
MAX_LINK_SEGMENTS = 2600          # limite global de lineas por frame
LINK_UPDATE_EVERY = 2             # recalcula links cada N frames
LINK_ALPHA_MAX = 62


# ---------- STATE ----------
img_src = None
particles = []
pg = None
export_frame = 0

# salida export por sesion
session_stamp = ""
frames_dir = ""
link_segments = []                # cache de segmentos (x1,y1,x2,y2,alpha)

# paletas (se interpolan dinamicamente)
PALETTES = [
    # fondo claro, tinta oscura, glow calido
    ((247, 243, 236), (28, 22, 20), (252, 169, 79)),
    # noche azul
    ((14, 18, 26), (204, 224, 255), (115, 170, 255)),
    # ritual magenta/indigo
    ((23, 10, 28), (238, 197, 255), (250, 94, 196)),
    # jade / oro
    ((11, 28, 24), (199, 246, 217), (255, 194, 94)),
]


def t_from(k):
    return (k % TOTAL_FRAMES) / float(TOTAL_FRAMES) * TWO_PI


def lerp3(a, b, u):
    return (
        int(lerp(a[0], b[0], u)),
        int(lerp(a[1], b[1], u)),
        int(lerp(a[2], b[2], u)),
    )


def palette_now(t):
    # ciclo suave entre paletas
    if not PALETTE_ON:
        bg, ink, glow = PALETTES[(mode - 1) % len(PALETTES)]
        return bg, ink, glow

    n = len(PALETTES)
    cycle = (sin(t * 0.37) * 0.5 + 0.5) * (n - 0.001)
    i0 = int(cycle)
    i1 = (i0 + 1) % n
    u = cycle - i0

    p0 = PALETTES[i0]
    p1 = PALETTES[i1]

    bg = lerp3(p0[0], p1[0], u)
    ink = lerp3(p0[1], p1[1], u)
    glow = lerp3(p0[2], p1[2], u)
    return bg, ink, glow


class Particle(object):
    def __init__(self, x, y, w, h):
        self.home = PVector(x, y)
        self.pos = PVector(random(w), random(h))
        self.vel = PVector(0, 0)

    def update(self, stability, noise_gain, t):
        # atraccion a home
        fx = (self.home.x - self.pos.x) * (ATTRACTION * stability)
        fy = (self.home.y - self.pos.y) * (ATTRACTION * stability)

        # ruido
        nx = (noise(self.pos.x * 0.009, self.pos.y * 0.009, t * 0.35) - 0.5) * noise_gain * (1.0 - stability)
        ny = (noise(self.pos.y * 0.009, self.pos.x * 0.009, t * 0.35 + 10.0) - 0.5) * noise_gain * (1.0 - stability)

        # campo de fuerza de mouse (en coordenadas HD)
        if MOUSE_FORCE_ON:
            mx = mouseX * (EXPORT_W / float(PREVIEW_W))
            my = mouseY * (EXPORT_H / float(PREVIEW_H))
            dxm = self.pos.x - mx
            dym = self.pos.y - my
            d2 = dxm * dxm + dym * dym + 1.0
            if d2 < 300 * 300:
                inv = 1.0 / sqrt(d2)
                dirx = dxm * inv
                diry = dym * inv

                # clic izquierdo atrae; derecho repele
                if mousePressed and mouseButton == LEFT:
                    mf = -150.0 / d2
                elif mousePressed and mouseButton == RIGHT:
                    mf = 220.0 / d2
                else:
                    mf = 70.0 / d2  # repel suave siempre activo

                fx += dirx * mf
                fy += diry * mf

        self.vel.x = (self.vel.x + fx + nx) * DAMPING
        self.vel.y = (self.vel.y + fy + ny) * DAMPING

        self.pos.x += self.vel.x
        self.pos.y += self.vel.y

        # wrap blando
        if self.pos.x < -20: self.pos.x = EXPORT_W + 20
        if self.pos.x > EXPORT_W + 20: self.pos.x = -20
        if self.pos.y < -20: self.pos.y = EXPORT_H + 20
        if self.pos.y > EXPORT_H + 20: self.pos.y = -20


def setup():
    global pg
    size(PREVIEW_W, PREVIEW_H, P2D)
    frameRate(FPS)
    pixelDensity(2)
    smooth(4)

    load_source_image()
    build_particles_autofit(EXPORT_W, EXPORT_H)

    pg = createGraphics(EXPORT_W, EXPORT_H, P2D)


def load_source_image():
    global img_src

    # Processing 3.5 (Python Mode): primero busca en data/
    tries = ["shape.png", "data/shape.png", "shape.jpg", "data/shape.jpg"]
    for name in tries:
        im = loadImage(name)
        if im is not None and im.width > 0 and im.height > 0:
            img_src = im
            print("Imagen base cargada:", name, im.width, "x", im.height)
            return

    # Fallback: toma la primera imagen disponible en data/
    data_dir = java.io.File(sketchPath("data"))
    if data_dir.exists() and data_dir.isDirectory():
        files = data_dir.listFiles()
        if files is not None:
            for f in files:
                n = f.getName().lower()
                if n.endswith(".png") or n.endswith(".jpg") or n.endswith(".jpeg"):
                    im = loadImage("data/" + f.getName())
                    if im is not None and im.width > 0 and im.height > 0:
                        img_src = im
                        print("Imagen base cargada automaticamente:", f.getName(), im.width, "x", im.height)
                        return

    print("ERROR: no encuentro imagen de referencia en data/.")
    print("Coloca una imagen y nombrala shape.png (recomendado).")
    exit()


def compute_bbox_alpha(im):
    im.loadPixels()
    minx, miny = im.width, im.height
    maxx, maxy = -1, -1
    for y in range(im.height):
        row = y * im.width
        for x in range(im.width):
            c = im.pixels[row + x]
            if alpha(c) > ALPHA_THR:
                if x < minx: minx = x
                if y < miny: miny = y
                if x > maxx: maxx = x
                if y > maxy: maxy = y
    if maxx < 0:
        return 0, 0, im.width - 1, im.height - 1
    return minx, miny, maxx, maxy


def build_particles_autofit(w, h):
    global particles
    particles = []

    im = img_src.copy()
    minx, miny, maxx, maxy = compute_bbox_alpha(im)
    bbox_w = (maxx - minx + 1)
    bbox_h = (maxy - miny + 1)

    avail_w = max(10, w - 2 * PADDING)
    avail_h = max(10, h - 2 * PADDING)
    s = min(avail_w / float(bbox_w), avail_h / float(bbox_h))

    target_w = bbox_w * s
    target_h = bbox_h * s
    ox = (w - target_w) / 2.0
    oy = (h - target_h) / 2.0

    im.loadPixels()
    homes = []
    for y in range(miny, maxy + 1, STEP):
        row = y * im.width
        for x in range(minx, maxx + 1, STEP):
            c = im.pixels[row + x]
            if alpha(c) > ALPHA_THR:
                hx = ox + (x - minx) * s
                hy = oy + (y - miny) * s
                homes.append(PVector(hx, hy))

    if len(homes) > MAXP:
        for i in range(len(homes) - 1, 0, -1):
            j = int(random(i + 1))
            homes[i], homes[j] = homes[j], homes[i]
        homes = homes[:MAXP]

    for hpt in homes:
        particles.append(Particle(hpt.x, hpt.y, w, h))


def mode_profile():
    if mode == 1:
        return 0.88, 0.55, 0.70
    elif mode == 2:
        return 0.58, 1.00, 1.00
    else:
        return 0.33, 1.42, 1.35


def rebuild_link_segments():
    # grid hashing simple para no hacer O(n^2) completo
    global link_segments
    link_segments = []

    grid = {}
    for i in range(len(particles)):
        p = particles[i]
        cx = int(p.pos.x / CELL)
        cy = int(p.pos.y / CELL)
        key = str(cx) + ":" + str(cy)
        if key not in grid:
            grid[key] = []
        grid[key].append(i)

    total_segments = 0
    for i in range(len(particles)):
        p = particles[i]
        cx = int(p.pos.x / CELL)
        cy = int(p.pos.y / CELL)
        links = 0

        for oy in range(-1, 2):
            for ox in range(-1, 2):
                key = str(cx + ox) + ":" + str(cy + oy)
                if key not in grid:
                    continue
                idxs = grid[key]
                for j in idxs:
                    if j <= i:
                        continue
                    q = particles[j]
                    dx = q.pos.x - p.pos.x
                    dy = q.pos.y - p.pos.y
                    d2 = dx * dx + dy * dy
                    if d2 < LINK_DIST2:
                        d = sqrt(d2)
                        a = int(map(d, 0, LINK_DIST, LINK_ALPHA_MAX, 0))
                        if a > 0:
                            link_segments.append((p.pos.x, p.pos.y, q.pos.x, q.pos.y, a))
                            total_segments += 1
                            links += 1
                            if total_segments >= MAX_LINK_SEGMENTS:
                                return
                            if links >= MAX_LINKS_PER_PARTICLE:
                                break
                if links >= MAX_LINKS_PER_PARTICLE:
                    break
            if links >= MAX_LINKS_PER_PARTICLE:
                break


def draw_links(g, ink_col):
    # recalculo intermitente para suavizar costo en tiempo real
    if frameCount % LINK_UPDATE_EVERY == 0 or len(link_segments) == 0:
        rebuild_link_segments()

    g.strokeWeight(0.6)
    for seg in link_segments:
        g.stroke(ink_col[0], ink_col[1], ink_col[2], seg[4])
        g.line(seg[0], seg[1], seg[2], seg[3])


def draw_particle_with_glow(g, p, speed, ink_col, glow_col, glow_mult):
    # stroke variable por velocidad
    sw = constrain(0.6 + speed * 0.95, 0.6, 3.7)

    if GLOW_ON:
        # glow por capas sin shader
        g.strokeWeight(sw + 7.0 * glow_mult)
        g.stroke(glow_col[0], glow_col[1], glow_col[2], 14)
        g.point(p.pos.x, p.pos.y)

        g.strokeWeight(sw + 4.2 * glow_mult)
        g.stroke(glow_col[0], glow_col[1], glow_col[2], 24)
        g.point(p.pos.x, p.pos.y)

        g.strokeWeight(sw + 2.0 * glow_mult)
        g.stroke(glow_col[0], glow_col[1], glow_col[2], 36)
        g.point(p.pos.x, p.pos.y)

    # nucleo
    core_a = int(constrain(130 + speed * 70, 90, 245))
    g.stroke(ink_col[0], ink_col[1], ink_col[2], core_a)
    g.strokeWeight(sw)
    g.point(p.pos.x, p.pos.y)


def render_to(g, w, h, t):
    bg_col, ink_col, glow_col = palette_now(t)

    # trails por alpha: no limpiar completo, solo velar
    g.noStroke()
    g.fill(bg_col[0], bg_col[1], bg_col[2], TRAIL_ALPHA)
    g.rect(0, 0, w, h)

    base_stability, noise_mult, glow_mult = mode_profile()

    for p in particles:
        p.update(base_stability, NOISE_GAIN * noise_mult, t)

    if LINES_ON:
        draw_links(g, ink_col)

    for p in particles:
        speed = sqrt(p.vel.x * p.vel.x + p.vel.y * p.vel.y)
        draw_particle_with_glow(g, p, speed, ink_col, glow_col, glow_mult)


def start_export_session():
    global session_stamp, frames_dir
    # sin imports: stamp con fecha/tiempo del entorno Processing
    session_stamp = "%04d%02d%02d-%02d%02d%02d" % (year(), month(), day(), hour(), minute(), second())
    frames_dir = "outputs/chakana-flux/" + session_stamp + "/frames"
    path = sketchPath(frames_dir)
    f = java.io.File(path)
    if not f.exists():
        f.mkdirs()


def draw():
    global export_frame, EXPORT

    k = export_frame if EXPORT else frameCount
    t = t_from(k)

    pg.beginDraw()
    pg.smooth(0)
    render_to(pg, EXPORT_W, EXPORT_H, t)
    pg.endDraw()

    # fondo preview segun paleta actual
    bg_col, ink_col, glow_col = palette_now(t)
    background(bg_col[0], bg_col[1], bg_col[2])
    image(pg, 0, 0, PREVIEW_W, PREVIEW_H)

    # HUD
    fill(0, 145)
    rect(14, 14, 900, 62, 10)
    fill(255)
    textSize(13)
    text("E export | 1/2/3 modo | G glow:%s | L links:%s | P palette:%s | H mouse field:%s" %
         (str(GLOW_ON), str(LINES_ON), str(PALETTE_ON), str(MOUSE_FORCE_ON)), 24, 38)
    text("frame:%d/%d | particles:%d | links:%d | fmt:%s" %
         (export_frame, TOTAL_FRAMES, len(particles), len(link_segments), EXPORT_FMT), 24, 58)

    # Export frames
    if EXPORT:
        if export_frame == 0:
            start_export_session()

        if export_frame % EXPORT_EVERY == 0:
            if EXPORT_FMT == "jpg":
                pg.save(frames_dir + "/frame-%04d.jpg" % export_frame)
            else:
                pg.save(frames_dir + "/frame-%04d.png" % export_frame)

        export_frame += 1

        if export_frame >= TOTAL_FRAMES:
            EXPORT = False
            print("EXPORT FRAMES LISTO. Carpeta: " + frames_dir)


def keyPressed():
    global mode, EXPORT, export_frame
    global GLOW_ON, LINES_ON, PALETTE_ON, MOUSE_FORCE_ON

    if key == '1':
        mode = 1
    elif key == '2':
        mode = 2
    elif key == '3':
        mode = 3

    elif key == 'g' or key == 'G':
        GLOW_ON = not GLOW_ON
    elif key == 'l' or key == 'L':
        LINES_ON = not LINES_ON
    elif key == 'p' or key == 'P':
        PALETTE_ON = not PALETTE_ON
    elif key == 'h' or key == 'H':
        MOUSE_FORCE_ON = not MOUSE_FORCE_ON

    elif key == 'e' or key == 'E':
        EXPORT = not EXPORT
        if EXPORT:
            export_frame = 0
            print("EXPORT ON: guardando frames en outputs/chakana-flux/")
        else:
            print("EXPORT OFF")
