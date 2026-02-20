window.__AF_SKETCH_READY__ = false;

const CONFIG = {
  maxParticles: 2200,
  minParticles: 900,
  step: 12,
  linkDistance: 30,
  linkCapPerParticle: 3,
  maxSegments: 2200,
  attraction: 0.028,
  damping: 0.89,
  noiseGain: 2.9,
  targetFps: 60,
};

const BAUHAUS = [
  [[245, 245, 245], [0, 0, 0], [230, 57, 70]],
  [[0, 0, 0], [245, 245, 245], [69, 123, 157]],
  [[130, 130, 130], [245, 245, 245], [241, 250, 60]],
  [[245, 245, 245], [69, 123, 157], [230, 57, 70]],
  [[0, 0, 0], [241, 250, 60], [230, 57, 70]],
];

let particles = [];
let sourceHomes = [];
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
let controlsReady = false;
let statusNode = null;
let overlayNode = null;
let uiVisible = true;

// Layout del arte: centrado perfecto + escala automática con margen de seguridad (~10%).
let artLayout = { x: 0, y: 0, w: 100, h: 100 };

let targetParticleCap = CONFIG.maxParticles;
let controlsReady = false;
let statusNode = null;
let overlayNode = null;
let uiVisible = true;

// Centrado + escala responsive del motivo (margen de seguridad 10%).
let artLayout = { x: 0, y: 0, w: 100, h: 100 };

function preload() {
  shapeImg = loadImage(
    "shape.png",
    () => {},
    () => { shapeImg = null; }
  );
}

class Particle {
  constructor(home, tier) {
    this.home = home.copy();
    this.pos = createVector(random(width), random(height));
    this.vel = createVector(0, 0);
    this.tier = tier; // 0 small, 1 medium, 2 large
    this.baseWeight = tier === 2 ? 1.35 : tier === 1 ? 0.95 : 0.62;
    this.updateStride = tier === 2 ? 1 : tier === 1 ? 2 : 3;
    this._glowMult = 1;
  }

  update(profile, t) {
    let [stability, noiseMult, glowMult, attractMult, dampMult, speedMult] = profile;

    let fx = (this.home.x - this.pos.x) * (CONFIG.attraction * attractMult * stability);
    let fy = (this.home.y - this.pos.y) * (CONFIG.attraction * attractMult * stability);

    let nx = (noise(this.pos.x * 0.008, this.pos.y * 0.008, t * 0.3) - 0.5) * CONFIG.noiseGain * noiseMult * (1 - stability);
    let ny = (noise(this.pos.y * 0.008, this.pos.x * 0.008, t * 0.3 + 9) - 0.5) * CONFIG.noiseGain * noiseMult * (1 - stability);

    if (mode === 5) {
      const tw = (noise(this.pos.x * 0.02, this.pos.y * 0.02, t * 1.6) - 0.5) * 2.3;
      nx += tw * 0.7;
      ny -= tw * 0.55;
    }

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

    const damp = constrain(CONFIG.damping * dampMult, 0.74, 0.96);
    this.vel.x = (this.vel.x + fx + nx) * damp;
    this.vel.y = (this.vel.y + fy + ny) * damp;

    this.pos.x += this.vel.x * speedMult;
    this.pos.y += this.vel.y * speedMult;

    if (this.pos.x < -20) this.pos.x = width + 20;
    if (this.pos.x > width + 20) this.pos.x = -20;
    if (this.pos.y < -20) this.pos.y = height + 20;
    if (this.pos.y > height + 20) this.pos.y = -20;

    this._glowMult = glowMult;
  }
}

function setup() {
  window.__AF_SKETCH_READY__ = true;
  createCanvas(windowWidth, windowHeight, P2D);
  frameRate(CONFIG.targetFps);

  pg = createGraphics(windowWidth, windowHeight, P2D);
  recomputeArtLayout();
  reseed(seedValue);
  buildParticlesFromText();
  setupControls();

  window.addEventListener("resize", handleResize);
}

function draw() {
  const t = (frameCount % 3000) / 3000 * TWO_PI;
  const [bg, ink, glow] = paletteNow(t);

  pg.noStroke();
  pg.fill(bg[0], bg[1], bg[2], trailsOn ? 18 : 255);
  pg.rect(0, 0, width, height);

  const profile = modeProfile(mode);
  const mouseGlowRange2 = (min(width, height) * 0.23) ** 2;

  for (const p of particles) {
    const speed2 = p.vel.x * p.vel.x + p.vel.y * p.vel.y;
    const dxm = p.pos.x - mouseX;
    const dym = p.pos.y - mouseY;
    const md2 = dxm * dxm + dym * dym;

    // Conditional update: partículas lentas y pequeñas se actualizan con menor frecuencia.
    const shouldUpdate = frameCount % p.updateStride === 0 || speed2 > 0.3 || md2 < mouseGlowRange2;
    if (shouldUpdate) {
      p.update(profile, t);
    } else {
      p.vel.mult(0.992);
    }
  }

  if (linesOn) {
    rebuildLinks();
    pg.strokeWeight(0.62);
    for (const s of links) {
      pg.stroke(ink[0], ink[1], ink[2], s[4]);
      pg.line(s[0], s[1], s[2], s[3]);
    }
  }

  for (const p of particles) {
    const speed = p.vel.mag();

    // Skip draw de parte de partículas diminutas muy lentas para mejorar FPS.
    if (p.tier === 0 && speed < 0.14 && frameCount % 2 !== 0) continue;

    const sw = constrain(p.baseWeight + speed * 0.88, 0.45, 4.1);
    const dxm = p.pos.x - mouseX;
    const dym = p.pos.y - mouseY;
    const md2 = dxm * dxm + dym * dym;

    // Glow condicional: reducción de capas cuando están lejos del mouse.
    if (glowOn && (md2 < mouseGlowRange2 || speed > 0.72 || p.tier > 0)) {
      pg.strokeWeight(sw + 3.8 * p._glowMult);
      pg.stroke(glow[0], glow[1], glow[2], 18);
      pg.point(p.pos.x, p.pos.y);

      if (md2 < mouseGlowRange2 * 0.6 || p.tier > 0) {
        pg.strokeWeight(sw + 6.1 * p._glowMult);
        pg.stroke(glow[0], glow[1], glow[2], 12);
        pg.point(p.pos.x, p.pos.y);
      }
    }

    pg.strokeWeight(sw);
    pg.stroke(ink[0], ink[1], ink[2], constrain(118 + speed * 86, 92, 240));
    pg.point(p.pos.x, p.pos.y);
  }

  background(bg[0], bg[1], bg[2]);
  image(pg, 0, 0);
  updateStatusReadout();
  drawMouseAura(glow, ink);

  updateUiAccent(glow);
  updateAdaptiveBudget();
  updateStatusReadout();
}

function drawMouseAura(glow, ink) {
  noFill();
  const pul = 12 + sin(frameCount * 0.2) * 4;
  stroke(glow[0], glow[1], glow[2], mouseIsPressed ? 190 : 110);
  strokeWeight(mouseIsPressed ? 2.8 : 1.4);
  circle(mouseX, mouseY, (mouseIsPressed ? 130 : 78) + pul);

  stroke(ink[0], ink[1], ink[2], 85);
  strokeWeight(1);
  circle(mouseX, mouseY, 12 + pul * 0.25);
}

function paletteNow(t) {
  if (!paletteOn) return BAUHAUS[(paletteOffset + mode - 1) % BAUHAUS.length];
  const n = BAUHAUS.length;
  const cyc = (sin(t * 0.44) * 0.5 + 0.5) * (n - 0.001);
  const i0 = (floor(cyc) + paletteOffset) % n;
  const i1 = (i0 + 1) % n;
  const u = cyc - floor(cyc);

  const p0 = BAUHAUS[i0], p1 = BAUHAUS[i1];
  return [
    lerpColor3(p0[0], p1[0], u),
    lerpColor3(p0[1], p1[1], u),
    lerpColor3(p0[2], p1[2], u)
  ];
}

function lerpColor3(a, b, u) {
  return [int(lerp(a[0], b[0], u)), int(lerp(a[1], b[1], u)), int(lerp(a[2], b[2], u))];
}

function modeProfile(m) {
  if (m === 1) return [0.88, 0.55, 0.7, 1.0, 1.0, 1.0];
  if (m === 2) return [0.58, 1.0, 1.0, 1.0, 1.0, 1.04];
  if (m === 3) return [0.33, 1.42, 1.35, 0.92, 0.97, 1.1];
  if (m === 4) return [0.22, 1.95, 1.35, 0.58, 1.02, 1.16];
  return [0.12, 2.55, 1.55, 0.42, 0.93, 1.36];
}

function rebuildLinks() {
  if (frameCount % 2 !== 0 && links.length) return;
  links = [];

  const cell = CONFIG.linkDistance + 12;
  const grid = new Map();

  particles.forEach((p, i) => {
    const cx = floor(p.pos.x / cell);
    const cy = floor(p.pos.y / cell);
    const key = `${cx}:${cy}`;
    if (!grid.has(key)) grid.set(key, []);
    grid.get(key).push(i);
  });

  let total = 0;
  const d2max = CONFIG.linkDistance * CONFIG.linkDistance;
  const segmentBudget = min(CONFIG.maxSegments, int(particles.length * 1.05));

  for (let i = 0; i < particles.length; i++) {
    const p = particles[i];
    const cx = floor(p.pos.x / cell);
    const cy = floor(p.pos.y / cell);
    let local = 0;

    for (let oy = -1; oy <= 1; oy++) {
      for (let ox = -1; ox <= 1; ox++) {
        const key = `${cx + ox}:${cy + oy}`;
        if (!grid.has(key)) continue;

        for (const j of grid.get(key)) {
          if (j <= i) continue;
          const q = particles[j];
          const dx = q.pos.x - p.pos.x;
          const dy = q.pos.y - p.pos.y;
          const d2 = dx * dx + dy * dy;

          if (d2 < d2max) {
            const d = sqrt(d2);
            const a = int(map(d, 0, CONFIG.linkDistance, 62, 0));
            if (a > 0) {
              links.push([p.pos.x, p.pos.y, q.pos.x, q.pos.y, a]);
              total++;
              local++;
              if (total >= segmentBudget) return;
              if (local >= CONFIG.linkCapPerParticle) break;
            }
          }
        }

        if (local >= CONFIG.linkCapPerParticle) break;
      }
      if (local >= CONFIG.linkCapPerParticle) break;
    }
  }
}

function buildParticlesFromText() {
  const stamp = createGraphics(width, height, P2D);
  stamp.pixelDensity(1);
  stamp.background(0, 0);
  stamp.noStroke();
  stamp.fill(255);

  // Escala automática basada en min(windowWidth, windowHeight) + centrado en ambas coordenadas.
  const { x: areaX, y: areaY, w: areaW, h: areaH } = artLayout;

  if (shapeImg && shapeImg.width > 0 && shapeImg.height > 0) {
    const s = min(areaW / shapeImg.width, areaH / shapeImg.height);
    const tw = shapeImg.width * s;
    const th = shapeImg.height * s;
    stamp.image(shapeImg, areaX + (areaW - tw) * 0.5, areaY + (areaH - th) * 0.5, tw, th);
  } else {
    stamp.textAlign(CENTER, CENTER);
    stamp.textSize(areaH * 0.25);
    stamp.text("CHAKANA", areaX + areaW * 0.5, areaY + areaH * 0.5);
  }

  stamp.loadPixels();
  const homes = [];
  for (let y = 0; y < height; y += CONFIG.step) {
    for (let x = 0; x < width; x += CONFIG.step) {
      const idx = 4 * (x + y * width);
      const a = stamp.pixels[idx + 3];
      if (a > 40) homes.push(createVector(x, y));
    }
  }

  sourceHomes = homes;
  rebuildParticlesFromHomes();
}

function rebuildParticlesFromHomes() {
  if (!sourceHomes.length) {
    particles = [];
    return;
  }

  const homes = sourceHomes.slice();
  shuffle(homes, true);

  const cap = min(homes.length, int(targetParticleCap));
  homes.length = cap;

  particles = homes.map((h, idx) => {
    const u = idx / max(1, cap - 1);
    const tier = u < 0.7 ? 0 : u < 0.95 ? 1 : 2; // 70% / 25% / 5%
    return new Particle(h, tier);
  });
}

function updateAdaptiveBudget() {
  if (frameCount % 30 !== 0) return;

  const fps = frameRate();
  if (fps < 48 && targetParticleCap > CONFIG.minParticles) {
    targetParticleCap = max(CONFIG.minParticles, targetParticleCap - 120);
    rebuildParticlesFromHomes();
  } else if (fps > 58 && targetParticleCap < CONFIG.maxParticles) {
    targetParticleCap = min(CONFIG.maxParticles, targetParticleCap + 80);
    rebuildParticlesFromHomes();
  }
}

function updateUiAccent(glow) {
  if (frameCount % 8 !== 0) return;
  document.documentElement.style.setProperty("--ui-accent", `${glow[0]}, ${glow[1]}, ${glow[2]}`);
}

function reseed(v = int(random(1e9))) {
  seedValue = v;
  randomSeed(seedValue);
  noiseSeed(seedValue);
}

function keyPressed() {
  if (key >= '1' && key <= '5') setMode(int(key));
  if (key === 'p' || key === 'P') togglePalette();
  if (key === 'v' || key === 'V') toggleLines();
  if (key === 'g' || key === 'G') toggleGlow();
  if (key === 't' || key === 'T') toggleTrails();
  if (key === 'c' || key === 'C') randomizePaletteOffset();
  if (key === 'r' || key === 'R') resetSeed();
  if (key === 'h' || key === 'H') toggleUiOverlay();
}

function setMode(nextMode) {
  mode = constrain(nextMode, 1, 5);
}

function togglePalette() {
  paletteOn = !paletteOn;
}

function toggleLines() {
  linesOn = !linesOn;
}

function toggleGlow() {
  glowOn = !glowOn;
}

function toggleTrails() {
  trailsOn = !trailsOn;
}

function randomizePaletteOffset() {
  paletteOffset = int(random(BAUHAUS.length));
}

function resetSeed() {
  reseed();
  buildParticlesFromText();
}

function toggleUiOverlay() {
  uiVisible = !uiVisible;
  if (overlayNode) overlayNode.classList.toggle('is-hidden', !uiVisible);
}

function setupControls() {
  if (controlsReady) return;
  statusNode = document.getElementById('status-readout');
  overlayNode = document.getElementById('overlay-ui');
  controlsReady = true;
  updateStatusReadout(true);
}

function updateStatusReadout(force = false) {
  if (!controlsReady || !statusNode) return;
  if (!force && frameCount % 12 !== 0) return;

  statusNode.textContent = `mode ${mode} · particles ${particles.length} · fps ${frameRate().toFixed(0)} · ui ${uiVisible ? 'on' : 'off'}`;
}

function recomputeArtLayout() {
  const safeSide = min(windowWidth, windowHeight) * 0.9;
  artLayout.w = safeSide;
  artLayout.h = safeSide;
  artLayout.x = (windowWidth - safeSide) * 0.5;
  artLayout.y = (windowHeight - safeSide) * 0.5;
}

function handleResize() {
  resizeCanvas(windowWidth, windowHeight);
  pg = createGraphics(windowWidth, windowHeight, P2D);
  recomputeArtLayout();
  buildParticlesFromText();
}

function windowResized() {
  handleResize();
}
