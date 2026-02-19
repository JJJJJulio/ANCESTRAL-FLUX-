
# ============================================================
# CHAKANA — PREVIEW ESTABLE + EXPORT FRAMES HD 60FPS
# Processing 3.5.4 | Python Mode (Jython)
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
EXPORT_FMT = "png"      # "png" calidad, "jpg" más rápido

# ---------- AJUSTE NO-CORTE ----------
PADDING = 140
ALPHA_THR = 20

# ---------- PARTICULAS ----------
STEP = 14
MAXP = 2800
NOISE_GAIN = 3.0
ATTRACTION = 0.03
DAMPING = 0.88
mode = 2

# ---------- STATE ----------
img_src = None
particles = []
pg = None
export_frame = 0  # contador propio de export (NO frameCount)

def t_from(k):
    return (k % TOTAL_FRAMES) / float(TOTAL_FRAMES) * TWO_PI

class Particle(object):
    def __init__(self, x, y, w, h):
        self.home = PVector(x, y)
        self.pos  = PVector(random(w), random(h))
        self.vel  = PVector(0, 0)

    def update(self, stability, noise_gain, t):
        fx = (self.home.x - self.pos.x) * (ATTRACTION * stability)
        fy = (self.home.y - self.pos.y) * (ATTRACTION * stability)

        nx = (noise(self.pos.x * 0.01, t) - 0.5) * noise_gain * (1.0 - stability)
        ny = (noise(self.pos.y * 0.01, t + 100) - 0.5) * noise_gain * (1.0 - stability)

        self.vel.x = (self.vel.x + fx + nx) * DAMPING
        self.vel.y = (self.vel.y + fy + ny) * DAMPING

        self.pos.x += self.vel.x
        self.pos.y += self.vel.y

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
    img_src = loadImage("shape.png")
    if img_src is None:
        print("No encuentro data/shape.png")
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

    # limitar para rendimiento
    if len(homes) > MAXP:
        for i in range(len(homes) - 1, 0, -1):
            j = int(random(i + 1))
            homes[i], homes[j] = homes[j], homes[i]
        homes = homes[:MAXP]

    for hpt in homes:
        particles.append(Particle(hpt.x, hpt.y, w, h))

def render_to(g, w, h, t):
    g.noStroke()
    g.fill(248, 246, 242, 22)
    g.rect(0, 0, w, h)

    if mode == 1:
        base_stability = 0.90
        noise_mult = 0.55
    elif mode == 2:
        base_stability = 0.60
        noise_mult = 1.00
    else:
        base_stability = 0.35
        noise_mult = 1.35

    for p in particles:
        p.update(base_stability, NOISE_GAIN * noise_mult, t)

        dx = p.pos.x - p.home.x
        dy = p.pos.y - p.home.y
        dh2 = dx*dx + dy*dy
        apha = 255 - int(constrain(dh2 / 3600.0, 0, 1) * 195)
        apha = constrain(apha, 60, 255)

        g.stroke(30, 28, 24, apha)
        g.strokeWeight(2)
        g.point(p.pos.x, p.pos.y)

def draw():
    global export_frame, EXPORT

    # Render HD (si exportas, usa export_frame; si no, usa frameCount)
    k = export_frame if EXPORT else frameCount
    t = t_from(k)

    pg.beginDraw()
    pg.smooth(0)
    render_to(pg, EXPORT_W, EXPORT_H, t)
    pg.endDraw()

    # Preview escalado
    background(248, 246, 242)
    image(pg, 0, 0, PREVIEW_W, PREVIEW_H)

    # UI
    fill(0, 130)
    rect(14, 14, 700, 44, 10)
    fill(255)
    textSize(13)
    text("E = export ON/OFF | export:%s | frame:%d/%d | 1/2/3 modos" %
         (str(EXPORT), export_frame, TOTAL_FRAMES), 26, 42)

    # Export frames
    if EXPORT:
        if export_frame % EXPORT_EVERY == 0:
            if EXPORT_FMT == "jpg":
                pg.save("frames/frame-%04d.jpg" % export_frame)
            else:
                pg.save("frames/frame-%04d.png" % export_frame)

        export_frame += 1

        if export_frame >= TOTAL_FRAMES:
            EXPORT = False
            print("EXPORT FRAMES LISTO. Carpeta: frames/")
            # no cerramos el sketch; puedes seguir viendo preview

def keyPressed():
    global mode, EXPORT, export_frame

    if key == '1': mode = 1
    elif key == '2': mode = 2
    elif key == '3': mode = 3

    elif key == 'e' or key == 'E':
        EXPORT = not EXPORT
        if EXPORT:
            export_frame = 0
            print("EXPORT ON: guardando frames en frames/")
        else:
            print("EXPORT OFF")