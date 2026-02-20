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
let controlsReady = false;
let statusNode = null;


function preload() {
  shapeImg = loadImage(
    "shape.png",
    () => {},
    () => { shapeImg = null; }
  );
}

class Particle {
  constructor(home) {
    this.home = home.copy();
    this.pos = createVector(random(width), random(height));
    this.vel = createVector(0, 0);
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

    // Mouse super protagónico: mezcla atracción + giro + repulsión según click.
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
  createCanvas(windowWidth, windowHeight, P2D);
  pg = createGraphics(windowWidth, windowHeight, P2D);
  reseed(seedValue);
  buildParticlesFromText();
  setupControls();
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
  }

  for (const p of particles) {
    const speed = p.vel.mag();
    const sw = constrain(0.55 + speed * 0.95, 0.55, 4.2);

    if (glowOn) {
      pg.strokeWeight(sw + 6.5 * p._glowMult);
      pg.stroke(glow[0], glow[1], glow[2], 14);
      pg.point(p.pos.x, p.pos.y);

      pg.strokeWeight(sw + 3.6 * p._glowMult);
      pg.stroke(glow[0], glow[1], glow[2], 26);
      pg.point(p.pos.x, p.pos.y);
    }

    pg.strokeWeight(sw);
    pg.stroke(ink[0], ink[1], ink[2], constrain(120 + speed * 80, 95, 245));
    pg.point(p.pos.x, p.pos.y);
  }

  background(bg[0], bg[1], bg[2]);
  image(pg, 0, 0);
  updateStatusReadout();
  drawMouseAura(glow, ink);
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
            const a = int(map(d, 0, CONFIG.linkDistance, 64, 0));
            if (a > 0) {
              links.push([p.pos.x, p.pos.y, q.pos.x, q.pos.y, a]);
              total++;
              local++;
              if (total >= CONFIG.maxSegments) return;
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
    stamp.textAlign(CENTER, CENTER);
    stamp.textSize(min(width, height) * 0.25);
    stamp.text("CHAKANA", width * 0.5, height * 0.5);
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
  if (key >= '1' && key <= '5') setMode(int(key));
  if (key === 'p' || key === 'P') togglePalette();
  if (key === 'v' || key === 'V') toggleLines();
  if (key === 'g' || key === 'G') toggleGlow();
  if (key === 't' || key === 'T') toggleTrails();
  if (key === 'c' || key === 'C') randomizePaletteOffset();
  if (key === 'r' || key === 'R') resetSeed();
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

function setupControls() {
  if (controlsReady) return;
  statusNode = document.getElementById('status-readout');
  const actions = {
    mode: (btn) => setMode(int(btn.dataset.mode)),
    palette: togglePalette,
    lines: toggleLines,
    glow: toggleGlow,
    trails: toggleTrails,
    'palette-shift': randomizePaletteOffset,
    reseed: resetSeed,
  };

  for (const btn of document.querySelectorAll('[data-action]')) {
    btn.addEventListener('click', () => {
      const action = btn.dataset.action;
      if (actions[action]) actions[action](btn);
      updateStatusReadout(true);
    });
  }

  controlsReady = true;
  updateStatusReadout(true);
}

function updateStatusReadout(force = false) {
  if (!controlsReady || !statusNode) return;
  if (!force && frameCount % 8 !== 0) return;

  for (const btn of document.querySelectorAll('[data-action="mode"]')) {
    btn.classList.toggle('is-active', int(btn.dataset.mode) === mode);
  }

  const activeByAction = {
    palette: paletteOn,
    lines: linesOn,
    glow: glowOn,
    trails: trailsOn,
  };

  for (const [action, active] of Object.entries(activeByAction)) {
    const btn = document.querySelector(`[data-action="${action}"]`);
    if (btn) btn.classList.toggle('is-active', active);
  }

  statusNode.textContent = `Modo ${mode} · Paleta ${paletteOn ? 'ON' : 'OFF'} · Líneas ${linesOn ? 'ON' : 'OFF'} · Glow ${glowOn ? 'ON' : 'OFF'} · Trails ${trailsOn ? 'ON' : 'OFF'} · Seed ${seedValue}`;
}


function windowResized() {
  resizeCanvas(windowWidth, windowHeight);
  pg = createGraphics(windowWidth, windowHeight, P2D);
  buildParticlesFromText();
}
