const CONFIG = {
  maxParticles: 2200,
  step: 12,
  linkDistance: 30,
  linkCapPerParticle: 3,
  maxSegments: 2400,
  attraction: 0.028,
  damping: 0.89,
  noiseGain: 2.9,
};

const BAUHAUS = [
  [[245, 245, 245], [0, 0, 0], [230, 57, 70]],
  [[0, 0, 0], [245, 245, 245], [69, 123, 157]],
  [[130, 130, 130], [245, 245, 245], [241, 250, 60]],
  [[245, 245, 245], [69, 123, 157], [230, 57, 70]],
  [[0, 0, 0], [241, 250, 60], [230, 57, 70]],
];

const SHAPE_PATHS = ["shape.png", "./shape.png", "data/shape.png", "assets/shape.png"];

let particles = [];
let links = [];
let pg;
let mode = 2;
let glowOn = true;
let linesOn = true;
let paletteOn = true;
let trailsOn = true;
let paletteOffset = 0;
let seedValue = 4242;
let shapeImg = null;

class Particle {
  constructor(home) {
    this.home = home.copy();
    this.pos = createVector(random(width), random(height));
    this.vel = createVector(0, 0);
  }

  function log(msg, payload) {
    if (payload !== undefined) console.log(`[AF] ${msg}`, payload);
    else console.log(`[AF] ${msg}`);
  }

  function reseed() {
    seed = (seed * 1664525 + 1013904223) >>> 0;
    noiseSeed = seed;
    const rand = makeRand(seed ^ 0x9e3779b9);
    for (let i = points.length - 1; i > 0; i--) {
      const j = Math.floor(rand() * (i + 1));
      const tmp = points[i].homeX;
      points[i].homeX = points[j].homeX;
      points[j].homeX = tmp;
      const tmpY = points[i].homeY;
      points[i].homeY = points[j].homeY;
      points[j].homeY = tmpY;
    }
    for (const p of points) {
      p.x = p.homeX + (rand() - 0.5) * 24;
      p.y = p.homeY + (rand() - 0.5) * 24;
      p.vx = (rand() - 0.5) * 2;
      p.vy = (rand() - 0.5) * 2;
    }
  }

  function resizeCanvas() {
    w = window.innerWidth;
    h = window.innerHeight;
    dpr = Math.max(1, Math.min(2, window.devicePixelRatio || 1));
    canvas.width = Math.floor(w * dpr);
    canvas.height = Math.floor(h * dpr);
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    computeFit();
  }

  function makeProceduralMask() {
    // Fallback shaped to match Chakana Andina silhouette (stepped arms + circular center void).
    maskW = 420;
    maskH = 420;
    const off = document.createElement('canvas');
    off.width = maskW;
    off.height = maskH;
    const ox = off.getContext('2d');
    ox.clearRect(0, 0, maskW, maskH);

    const u = 42;
    const cx = Math.floor(maskW / 2);
    const cy = Math.floor(maskH / 2);

    ox.fillStyle = '#fff';

    // Core block (5u x 5u)
    ox.fillRect(cx - Math.floor(2.5 * u), cy - Math.floor(2.5 * u), 5 * u, 5 * u);

    // Cardinal stepped arms (top, bottom: 3u x 2u; left, right: 2u x 3u)
    ox.fillRect(cx - Math.floor(1.5 * u), cy - Math.floor(4.5 * u), 3 * u, 2 * u); // top
    ox.fillRect(cx - Math.floor(1.5 * u), cy + Math.floor(2.5 * u), 3 * u, 2 * u); // bottom
    ox.fillRect(cx - Math.floor(4.5 * u), cy - Math.floor(1.5 * u), 2 * u, 3 * u); // left
    ox.fillRect(cx + Math.floor(2.5 * u), cy - Math.floor(1.5 * u), 2 * u, 3 * u); // right

    // Center circular void
    ox.save();
    ox.globalCompositeOperation = 'destination-out';
    ox.beginPath();
    ox.arc(cx, cy, u * 1.45, 0, Math.PI * 2);
    ox.fill();
    ox.restore();

    maskData = ox.getImageData(0, 0, maskW, maskH);
    source = 'procedural';
    log('Procedural chakana mask generated (Andean stepped profile).');
  }

  function computeBBoxFromAlpha(imageData, threshold = CFG.alphaThreshold) {
    const data = imageData.data;
    let minX = imageData.width;
    let minY = imageData.height;
    let maxX = -1;
    let maxY = -1;

    for (let y = 0; y < imageData.height; y++) {
      for (let x = 0; x < imageData.width; x++) {
        const i = (y * imageData.width + x) * 4;
        if (data[i + 3] > threshold) {
          if (x < minX) minX = x;
          if (y < minY) minY = y;
          if (x > maxX) maxX = x;
          if (y > maxY) maxY = y;
        }
      }
    }

    // Mouse protagonista: atraccion + giro tipo vortice, y mas fuerza en click.
    const dxm = this.pos.x - mouseX;
    const dym = this.pos.y - mouseY;
    const d2 = dxm * dxm + dym * dym + 1;
    if (d2 < (min(width, height) * 0.55) ** 2) {
      const inv = 1 / sqrt(d2);
      const dirx = dxm * inv;
      const diry = dym * inv;
      const tangx = -diry;
      const tangy = dirx;

      const pressure = mouseIsPressed ? 2.5 : 1.0;
      const attract = mouseIsPressed ? -380 / d2 : -130 / d2;
      const spin = mouseIsPressed ? 260 / d2 : 110 / d2;

      fx += (dirx * attract + tangx * spin) * pressure;
      fy += (diry * attract + tangy * spin) * pressure;
    }
    const pad = Math.min(w, h) * CFG.padRatio;
    const scale = Math.min((w - 2 * pad) / bbox.w, (h - 2 * pad) / bbox.h);
    const offsetX = (w - bbox.w * scale) / 2 - bbox.minX * scale;
    const offsetY = (h - bbox.h * scale) / 2 - bbox.minY * scale;
    fit = { scale, offsetX, offsetY };
  }


  function isMaskUsable(currentBbox) {
    if (!currentBbox || !maskData) return false;
    const widthRatio = currentBbox.w / maskW;
    const heightRatio = currentBbox.h / maskH;
    const aspect = currentBbox.w / currentBbox.h;

    // Chakana expected: centered hole in the core. If center is fully occupied, reject shape mask.
    const cx0 = Math.floor(currentBbox.minX + currentBbox.w * 0.45);
    const cx1 = Math.ceil(currentBbox.minX + currentBbox.w * 0.55);
    const cy0 = Math.floor(currentBbox.minY + currentBbox.h * 0.45);
    const cy1 = Math.ceil(currentBbox.minY + currentBbox.h * 0.55);

    let centerActive = 0;
    let centerTotal = 0;
    for (let y = cy0; y < cy1; y++) {
      for (let x = cx0; x < cx1; x++) {
        const i = (y * maskW + x) * 4;
        if (maskData.data[i + 3] > CFG.alphaThreshold) centerActive++;
        centerTotal++;
      }
    }

    const cornerSpanX = Math.max(1, Math.floor(currentBbox.w * 0.12));
    const cornerSpanY = Math.max(1, Math.floor(currentBbox.h * 0.12));
    const corners = [
      [currentBbox.minX, currentBbox.minY],
      [currentBbox.maxX - cornerSpanX, currentBbox.minY],
      [currentBbox.minX, currentBbox.maxY - cornerSpanY],
      [currentBbox.maxX - cornerSpanX, currentBbox.maxY - cornerSpanY],
    ];

    let cornerActive = 0;
    let cornerTotal = 0;
    for (const [sx, sy] of corners) {
      for (let y = sy; y < sy + cornerSpanY; y++) {
        for (let x = sx; x < sx + cornerSpanX; x++) {
          const i = (y * maskW + x) * 4;
          if (maskData.data[i + 3] > CFG.alphaThreshold) cornerActive++;
          cornerTotal++;
        }
      }
    }

    const centerFill = centerTotal > 0 ? centerActive / centerTotal : 1;
    const cornerFill = cornerTotal > 0 ? cornerActive / cornerTotal : 1;
    return widthRatio > 0.25 && heightRatio > 0.25 && aspect > 0.55 && aspect < 1.8 && centerFill < 0.35 && cornerFill < 0.22;
  }
}

function setup() {
  createCanvas(windowWidth, windowHeight, P2D);
  pg = createGraphics(windowWidth, windowHeight, P2D);
  reseed(seedValue);
  buildParticlesFromMask();
  loadShapeWithFallback();
}

function loadShapeWithFallback(index = 0) {
  if (index >= SHAPE_PATHS.length) {
    console.log("No se encontro imagen externa. Se usa silueta procedimental CHAKANA.");
    return;
  }
  loadImage(
    SHAPE_PATHS[index],
    (img) => {
      if (img && img.width > 0 && img.height > 0) {
        shapeImg = img;
        console.log("Mascara cargada:", SHAPE_PATHS[index], img.width, "x", img.height);
        buildParticlesFromMask();
      } else {
        loadShapeWithFallback(index + 1);
      }
    },
    () => loadShapeWithFallback(index + 1)
  );
}

function draw() {
  const t = (frameCount % 3000) / 3000 * TWO_PI;
  const [bg, ink, glow] = paletteNow(t);

  pg.noStroke();
  pg.fill(bg[0], bg[1], bg[2], trailsOn ? 18 : 255);
  pg.rect(0, 0, width, height);

  const profile = modeProfile(mode);
  for (const p of particles) p.update(profile, t);

  if (linesOn) {
    rebuildLinks();
    pg.strokeWeight(0.65);
    for (const s of links) {
      pg.stroke(ink[0], ink[1], ink[2], s[4]);
      pg.line(s[0], s[1], s[2], s[3]);
    }
    return pts;
  }

  async function loadMaskFromShape() {
    log('Loading ./shape.png…');
    const img = await new Promise((resolve, reject) => {
      const el = new Image();
      el.onload = () => resolve(el);
      el.onerror = () => reject(new Error('shape.png failed to load'));
      el.src = './shape.png';
    });

    log('shape.png loaded', { width: img.width, height: img.height });
    maskW = img.width;
    maskH = img.height;
    const off = document.createElement('canvas');
    off.width = maskW;
    off.height = maskH;
    const ox = off.getContext('2d');
    ox.clearRect(0, 0, maskW, maskH);
    ox.drawImage(img, 0, 0);
    maskData = ox.getImageData(0, 0, maskW, maskH);
    source = 'shape.png';
    log('Mask generated from shape.png.');
  }

  async function rebuild() {
    try {
      if (FORCE_PROCEDURAL_MASK) throw new Error('shape bypassed to guarantee chakana silhouette');
      await loadMaskFromShape();
      bbox = computeBBoxFromAlpha(maskData);
      if (!isMaskUsable(bbox)) throw new Error('shape alpha bbox invalid for chakana fit');
    } catch (err) {
      log('shape fallback trigger', err.message || String(err));
      makeProceduralMask();
      bbox = computeBBoxFromAlpha(maskData);
    }

    if (!bbox) {
      makeProceduralMask();
      bbox = computeBBoxFromAlpha(maskData);
      if (!bbox) throw new Error('procedural fallback also produced empty bbox');
    }

    computeFit();
    points = pointsFromMask();
    if (points.length === 0) {
      log('No points found, forcing procedural rebuild.');
      makeProceduralMask();
      bbox = computeBBoxFromAlpha(maskData);
      computeFit();
      points = pointsFromMask();
    }
    if (points.length === 0) throw new Error('points.length is still 0 after procedural fallback');

    log('points ready', { points: points.length, source, bbox, fit });
  }

  function paletteNow(t) {
    const count = BAUHAUS.length;
    if (!paletteOn) return BAUHAUS[(paletteShift + mode - 1 + count * 4) % count];

    const cyc = (Math.sin(t * 0.35) * 0.5 + 0.5) * (count - 0.001);
    const i0 = (Math.floor(cyc) + paletteShift) % count;
    const i1 = (i0 + 1) % count;
    const u = cyc - Math.floor(cyc);
    return [
      mix3(BAUHAUS[i0][0], BAUHAUS[i1][0], u),
      mix3(BAUHAUS[i0][1], BAUHAUS[i1][1], u),
      mix3(BAUHAUS[i0][2], BAUHAUS[i1][2], u),
    ];
  }

  function drawLinks(ink) {
    if (!linksOn) return;
    const maxDist2 = CFG.linksMaxDist * CFG.linksMaxDist;
    let drawn = 0;
    ctx.lineWidth = 0.36;
    ctx.strokeStyle = `rgba(${ink[0]}, ${ink[1]}, ${ink[2]}, 0.22)`;
    for (let i = 0; i < points.length && drawn < CFG.maxLinks; i += 2) {
      const a = points[i];
      for (let j = i + 3; j < points.length && drawn < CFG.maxLinks; j += 5) {
        const b = points[j];
        const dx = a.x - b.x;
        const dy = a.y - b.y;
        const d2 = dx * dx + dy * dy;
        if (d2 < maxDist2) {
          ctx.beginPath();
          ctx.moveTo(a.x, a.y);
          ctx.lineTo(b.x, b.y);
          ctx.stroke();
          drawn++;
        }
      }
    }
  }
}

function drawProceduralChakanaMask(stamp) {
  const cx = width * 0.5;
  const cy = height * 0.5;
  const size = min(width, height) * 0.62;
  const core = size * 0.62;
  const arm = size * 0.26;

  stamp.push();
  stamp.translate(cx, cy);
  stamp.rectMode(CENTER);
  stamp.fill(255);
  stamp.noStroke();

  // cuerpo principal
  stamp.rect(0, 0, core, core);
  // 4 extensiones (chakana simplificada)
  stamp.rect(0, -core * 0.5 - arm * 0.5, core * 0.52, arm);
  stamp.rect(0,  core * 0.5 + arm * 0.5, core * 0.52, arm);
  stamp.rect(-core * 0.5 - arm * 0.5, 0, arm, core * 0.52);
  stamp.rect( core * 0.5 + arm * 0.5, 0, arm, core * 0.52);

  // hueco central
  stamp.erase();
  stamp.circle(0, 0, core * 0.46);
  stamp.noErase();
  stamp.pop();
}

function buildParticlesFromMask() {
  particles = [];
  const stamp = createGraphics(width, height, P2D);
  stamp.pixelDensity(1);
  stamp.background(0, 0);
  stamp.noStroke();
  stamp.fill(255);

  if (shapeImg && shapeImg.width > 0 && shapeImg.height > 0) {
    const pad = min(width, height) * 0.12;
    const availW = width - pad * 2;
    const availH = height - pad * 2;
    const s = min(availW / shapeImg.width, availH / shapeImg.height);
    const tw = shapeImg.width * s;
    const th = shapeImg.height * s;
    stamp.image(shapeImg, (width - tw) * 0.5, (height - th) * 0.5, tw, th);
  } else {
    drawProceduralChakanaMask(stamp);
  }

  async function boot() {
    try {
      resizeCanvas();
      bindInput();
      await rebuild();
      updateStatus();
      window.__AF_SKETCH_READY__ = true;
      log('Render loop started.');
      requestAnimationFrame(animate);
    } catch (err) {
      errorText = err.stack || String(err);
      updateStatus();
      console.error('[AF] Fatal init error', err);
    }

  function mix3(a, b, u) {
    return [
      Math.round(a[0] + (b[0] - a[0]) * u),
      Math.round(a[1] + (b[1] - a[1]) * u),
      Math.round(a[2] + (b[2] - a[2]) * u),
    ];
  }

  function makeRand(start) {
    let s = start >>> 0;
    return () => {
      s = (s * 1664525 + 1013904223) >>> 0;
      return s / 0xffffffff;
    };
  }

  function noise2(x, y, t, sn) {
    const val = Math.sin((x * 12.9898 + y * 78.233 + t * 37.719 + sn * 0.0001) * 43758.5453);
    return val - Math.floor(val);
  }

  function onOff(v) {
    return v ? 'on' : 'off';
  }

  shuffle(homes, true);
  homes.length = min(homes.length, CONFIG.maxParticles);
  particles = homes.map(h => new Particle(h));
}

function reseed(v = int(random(1e9))) {
  seedValue = v;
  randomSeed(seedValue);
  noiseSeed(seedValue);
}

function keyPressed() {
  if (key >= '1' && key <= '5') mode = int(key);
  if (key === 'p' || key === 'P') paletteOn = !paletteOn;
  if (key === 'v' || key === 'V') linesOn = !linesOn;
  if (key === 'g' || key === 'G') glowOn = !glowOn;
  if (key === 't' || key === 'T') trailsOn = !trailsOn;
  if (key === 'c' || key === 'C') paletteOffset = int(random(BAUHAUS.length));
  if (key === 'r' || key === 'R') { reseed(); buildParticlesFromMask(); }
}

function windowResized() {
  resizeCanvas(windowWidth, windowHeight);
  pg = createGraphics(windowWidth, windowHeight, P2D);
  buildParticlesFromMask();
}
