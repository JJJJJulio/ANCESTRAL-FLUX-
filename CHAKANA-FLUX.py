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

EXPORT = False
EXPORT_EVERY = 1
EXPORT_FMT = "png"
EXPORT_STABLE_FPS = 30

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
GLOW_ON = True
LINES_ON = True
PALETTE_ON = True
MOUSE_FORCE_ON = True
EXTREME_DEFORM_ON = False

# ---------- LINKS ----------
LINK_DIST = 34
LINK_DIST2 = LINK_DIST * LINK_DIST
CELL = 42
MAX_LINKS_PER_PARTICLE = 3
MAX_LINK_SEGMENTS = 2600
LINK_UPDATE_EVERY = 2
LINK_ALPHA_MAX = 62

# ---------- STATE ----------
img_src = None
particles = []
pg = None
export_frame = 0
export_stable_fps_active = False

session_stamp = ""
frames_dir = ""
link_segments = []
seed_value = 4242

# ---------- BAUHAUS PALETTE ----------
BAU_RED = (230, 57, 70)     # #E63946
BAU_BLUE = (69, 123, 157)   # #457B9D
BAU_YELLOW = (241, 250, 60) # #F1FA3C
BAU_BLACK = (0, 0, 0)
BAU_WHITE = (245, 245, 245)
BAU_GRAY = (130, 130, 130)

BAU_PALETTES = [
    (BAU_WHITE, BAU_BLACK, BAU_RED),
    (BAU_BLACK, BAU_WHITE, BAU_YELLOW),
    (BAU_GRAY, BAU_WHITE, BAU_BLUE),
    (BAU_WHITE, BAU_BLUE, BAU_RED),
    (BAU_BLACK, BAU_YELLOW, BAU_RED),
    (BAU_GRAY, BAU_BLACK, BAU_YELLOW),
]
palette_offset = 0


def t_from(k):
    return (k % TOTAL_FRAMES) / float(TOTAL_FRAMES) * TWO_PI


def lerp3(a, b, u):
    return (
        int(lerp(a[0], b[0], u)),
        int(lerp(a[1], b[1], u)),
        int(lerp(a[2], b[2], u)),
    )


def randomize_palette_offset():
    global palette_offset
    palette_offset = int(random(len(BAU_PALETTES)))


def palette_now(t):
    n = len(BAU_PALETTES)

    if not PALETTE_ON:
        bg, ink, glow = BAU_PALETTES[(palette_offset + mode - 1) % n]
        return bg, ink, glow

    cycle = (sin(t * 0.42) * 0.5 + 0.5) * (n - 0.001)
    i0 = (int(cycle) + palette_offset) % n
    i1 = (i0 + 1) % n
    u = cycle - int(cycle)

    p0 = BAU_PALETTES[i0]
    p1 = BAU_PALETTES[i1]

    bg = lerp3(p0[0], p1[0], u)
    ink = lerp3(p0[1], p1[1], u)
    glow = lerp3(p0[2], p1[2], u)
    return bg, ink, glow


class Particle(object):
    def __init__(self, x, y, w, h):
        self.home = PVector(x, y)
        self.pos = PVector(random(w), random(h))
        self.vel = PVector(0, 0)

    def update(self, profile, t):
        stability, noise_mult, glow_mult, attraction_mult, damping_mult, speed_mult = profile

        local_attraction = ATTRACTION * attraction_mult
        local_damping = constrain(DAMPING * damping_mult, 0.74, 0.96)

        fx = (self.home.x - self.pos.x) * (local_attraction * stability)
        fy = (self.home.y - self.pos.y) * (local_attraction * stability)

        nx = (noise(self.pos.x * 0.009, self.pos.y * 0.009, t * 0.35) - 0.5) * (NOISE_GAIN * noise_mult) * (1.0 - stability)
        ny = (noise(self.pos.y * 0.009, self.pos.x * 0.009, t * 0.35 + 10.0) - 0.5) * (NOISE_GAIN * noise_mult) * (1.0 - stability)

        # modo 5: turbulencia caotica extra
        if mode == 5:
            tw = (noise(self.pos.x * 0.021, self.pos.y * 0.021, t * 1.7) - 0.5) * 2.2
            nx += tw * 0.65
            ny -= tw * 0.55

        if MOUSE_FORCE_ON:
            mx = mouseX * (EXPORT_W / float(PREVIEW_W))
            my = mouseY * (EXPORT_H / float(PREVIEW_H))
            dxm = self.pos.x - mx
            dym = self.pos.y - my
            d2 = dxm * dxm + dym * dym + 1.0
            if d2 < 320 * 320:
                inv = 1.0 / sqrt(d2)
                dirx = dxm * inv
                diry = dym * inv

                if mousePressed and mouseButton == LEFT:
                    mf = -170.0 / d2
                elif mousePressed and mouseButton == RIGHT:
                    mf = 250.0 / d2
                else:
                    mf = 75.0 / d2

                fx += dirx * mf
                fy += diry * mf

        if EXTREME_DEFORM_ON:
            nx *= 1.9
            ny *= 1.9
            fx *= 0.38
            fy *= 0.38
            speed_mult *= 1.28

        self.vel.x = (self.vel.x + fx + nx) * local_damping
        self.vel.y = (self.vel.y + fy + ny) * local_damping

        self.pos.x += self.vel.x * speed_mult
        self.pos.y += self.vel.y * speed_mult

        if self.pos.x < -20:
            self.pos.x = EXPORT_W + 20
        if self.pos.x > EXPORT_W + 20:
            self.pos.x = -20
        if self.pos.y < -20:
            self.pos.y = EXPORT_H + 20
        if self.pos.y > EXPORT_H + 20:
            self.pos.y = -20


def setup():
    global pg
    size(PREVIEW_W, PREVIEW_H, P2D)
    frameRate(FPS)
    pixelDensity(2)
    smooth(4)

    randomSeed(seed_value)
    noiseSeed(seed_value)

    load_source_image()
    build_particles_autofit(EXPORT_W, EXPORT_H)

    pg = createGraphics(EXPORT_W, EXPORT_H, P2D)


def load_source_image():
    global img_src

    tries = ["shape.png", "data/shape.png", "shape.jpg", "data/shape.jpg"]
    for name in tries:
        im = loadImage(name)
        if im is not None and im.width > 0 and im.height > 0:
            img_src = im
            print("Imagen base cargada:", name, im.width, "x", im.height)
            return

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
                if x < minx:
                    minx = x
                if y < miny:
                    miny = y
                if x > maxx:
                    maxx = x
                if y > maxy:
                    maxy = y
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
        return 0.88, 0.55, 0.70, 1.00, 1.00, 1.00
    elif mode == 2:
        return 0.58, 1.00, 1.00, 1.00, 1.00, 1.04
    elif mode == 3:
        return 0.33, 1.42, 1.35, 0.92, 0.97, 1.10
    elif mode == 4:
        # deformacion fluida organica intensa: noise alto, atraccion baja
        return 0.22, 1.95, 1.35, 0.58, 1.02, 1.16
    else:
        # modo 5 turbulento caotico: mas velocidad y variacion
        return 0.12, 2.55, 1.55, 0.42, 0.93, 1.36


def rebuild_link_segments():
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
    if frameCount % LINK_UPDATE_EVERY == 0 or len(link_segments) == 0:
        rebuild_link_segments()

    g.strokeWeight(0.6)
    for seg in link_segments:
        g.stroke(ink_col[0], ink_col[1], ink_col[2], seg[4])
        g.line(seg[0], seg[1], seg[2], seg[3])


def draw_particle_with_glow(g, p, speed, ink_col, glow_col, glow_mult):
    sw = constrain(0.6 + speed * 0.95, 0.6, 3.9)

    if GLOW_ON:
        g.strokeWeight(sw + 7.0 * glow_mult)
        g.stroke(glow_col[0], glow_col[1], glow_col[2], 14)
        g.point(p.pos.x, p.pos.y)

        g.strokeWeight(sw + 4.2 * glow_mult)
        g.stroke(glow_col[0], glow_col[1], glow_col[2], 24)
        g.point(p.pos.x, p.pos.y)

        g.strokeWeight(sw + 2.0 * glow_mult)
        g.stroke(glow_col[0], glow_col[1], glow_col[2], 36)
        g.point(p.pos.x, p.pos.y)

    core_a = int(constrain(130 + speed * 70, 90, 245))
    g.stroke(ink_col[0], ink_col[1], ink_col[2], core_a)
    g.strokeWeight(sw)
    g.point(p.pos.x, p.pos.y)


def render_to(g, w, h, t):
    bg_col, ink_col, glow_col = palette_now(t)

    g.noStroke()
    g.fill(bg_col[0], bg_col[1], bg_col[2], TRAIL_ALPHA)
    g.rect(0, 0, w, h)

    profile = mode_profile()
    for p in particles:
        p.update(profile, t)

    if LINES_ON:
        draw_links(g, ink_col)

    for p in particles:
        speed = sqrt(p.vel.x * p.vel.x + p.vel.y * p.vel.y)
        draw_particle_with_glow(g, p, speed, ink_col, glow_col, profile[2])


def start_export_session():
    global session_stamp, frames_dir
    session_stamp = "%04d%02d%02d-%02d%02d%02d" % (year(), month(), day(), hour(), minute(), second())
    frames_dir = "outputs/chakana-flux/" + session_stamp + "/frames"
    path = sketchPath(frames_dir)
    f = java.io.File(path)
    if not f.exists():
        f.mkdirs()


def safe_export_frame(frame_idx):
    try:
        if EXPORT_FMT != "png":
            # requisito: exportar png en secuencia
            pass
        pg.save(frames_dir + "/frame-%04d.png" % frame_idx)
        return True
    except Exception as ex:
        print("WARN export frame fallo:", frame_idx, ex)
        return False


def draw():
    global export_frame, EXPORT, export_stable_fps_active

    if EXPORT and not export_stable_fps_active:
        frameRate(EXPORT_STABLE_FPS)
        export_stable_fps_active = True
    elif (not EXPORT) and export_stable_fps_active:
        frameRate(FPS)
        export_stable_fps_active = False

    k = export_frame if EXPORT else frameCount
    t = t_from(k)

    pg.beginDraw()
    pg.smooth(0)
    render_to(pg, EXPORT_W, EXPORT_H, t)
    pg.endDraw()

    bg_col, ink_col, glow_col = palette_now(t)
    background(bg_col[0], bg_col[1], bg_col[2])
    image(pg, 0, 0, PREVIEW_W, PREVIEW_H)

    fill(0, 145)
    rect(14, 14, 960, 76, 10)
    fill(255)
    textSize(13)
    text("1-5 modos | E export | P dinamica:%s | V links:%s | M extrema:%s | C paleta | R reseed" %
         (str(PALETTE_ON), str(LINES_ON), str(EXTREME_DEFORM_ON)), 24, 38)
    text("frame:%d/%d | particles:%d | links:%d | mode:%d | seed:%d" %
         (export_frame, TOTAL_FRAMES, len(particles), len(link_segments), mode, seed_value), 24, 58)

    if EXPORT:
        fill(230, 57, 70)
        ellipse(930, 34, 16, 16)
        fill(255)
        text("REC", 948, 39)

    if EXPORT:
        try:
            if export_frame == 0:
                start_export_session()

            if export_frame % EXPORT_EVERY == 0:
                ok = safe_export_frame(export_frame)
                if not ok:
                    EXPORT = False

            export_frame += 1
            if export_frame >= TOTAL_FRAMES:
                EXPORT = False
                print("EXPORT FRAMES LISTO. Carpeta: " + frames_dir)
        except Exception as ex:
            EXPORT = False
            print("ERROR export estable detenido:", ex)


def regenerate_seed():
    global seed_value
    seed_value = int(random(1, 999999999))
    randomSeed(seed_value)
    noiseSeed(seed_value)
    build_particles_autofit(EXPORT_W, EXPORT_H)
    print("Nueva seed:", seed_value)


def keyPressed():
    global mode, EXPORT, export_frame, LINES_ON, PALETTE_ON, EXTREME_DEFORM_ON

    if key == '1':
        mode = 1
    elif key == '2':
        mode = 2
    elif key == '3':
        mode = 3
    elif key == '4':
        mode = 4
    elif key == '5':
        mode = 5

    elif key == 'p' or key == 'P':
        PALETTE_ON = not PALETTE_ON
    elif key == 'm' or key == 'M':
        EXTREME_DEFORM_ON = not EXTREME_DEFORM_ON
    elif key == 'c' or key == 'C':
        randomize_palette_offset()
    elif key == 'v' or key == 'V':
        LINES_ON = not LINES_ON
    elif key == 'l' or key == 'L':
        LINES_ON = not LINES_ON
    elif key == 'r' or key == 'R':
        regenerate_seed()
    elif key == 'e' or key == 'E':
        EXPORT = not EXPORT
        if EXPORT:
            export_frame = 0
            print("EXPORT ON: guardando PNG en outputs/chakana-flux/")
        else:
            print("EXPORT OFF")
