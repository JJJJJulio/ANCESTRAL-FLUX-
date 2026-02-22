(() => {
  window.__AF_SKETCH_READY__ = false;

  const CFG = {
    step: 5,
    maxPoints: 8000,
    bgFade: 0.22,
    mouseRadius: 180,
    baseReturn: 0.045,
    noiseSeed: 1337,
    linkDistance: 20,
    linkSampleStep: 3,
    proximityRadius: 22,
    proximityBlend: 0.05,
    proximityBoost: 0.045,
  };

  const MODES = {
    1: { swirl: 0.4, jitter: 0.15, speed: 0.95 },
    2: { swirl: 0.8, jitter: 0.35, speed: 1.0 },
    3: { swirl: 1.2, jitter: 0.55, speed: 1.05 },
    4: { swirl: 1.8, jitter: 0.85, speed: 1.15 },
    5: { swirl: 2.5, jitter: 1.2, speed: 1.25 },
  };


  const KLEE_PALETTE = [
    [166, 84, 62],   // terracotta / oxide red
    [186, 128, 74],  // warm orange
    [188, 162, 96],  // muted yellow
    [122, 132, 86],  // olive green
    [116, 136, 156], // dusty blue
    [204, 170, 166], // pale pink
    [104, 79, 62],   // earth brown
    [137, 128, 118], // warm gray
    [156, 110, 86],
    [142, 150, 120],
  ];

  function clamp255(v) {
    return Math.max(0, Math.min(255, v));
  }

  function lerp(a, b, t) {
    return a + (b - a) * t;
  }

  const canvas = document.getElementById('flux-canvas');
  const statusNode = document.getElementById('status-readout');
  const overlay = document.getElementById('overlay-ui');

  if (!canvas) {
    throw new Error('Missing #flux-canvas element in index.html.');
  }

  const ctx = canvas.getContext('2d', { alpha: false });
  if (!ctx) {
    throw new Error('Unable to initialize 2D context for #flux-canvas.');
  }

  let mode = 2;
  let uiVisible = true;
  let source = 'boot';
  let errorText = '';
  let particles = [];
  let w = 0;
  let h = 0;
  let dpr = Math.max(1, Math.min(2, window.devicePixelRatio || 1));
  let mouse = { x: -9999, y: -9999, down: false };
  let fps = 0;
  let lastFpsT = performance.now();
  let frameCounter = 0;
  let renderTick = 0;
  let shapeImagePromise = null;
  let resizeDebounceTimer = null;
  let rebuildSerial = 0;

  let paletteOn = true;
  let paletteShift = 0;
  let glowOn = false;
  let linesOn = false;
  let trailsOn = true;
  let linksOn = false;
  let cachedColorInfluence = null;

  class Particle {
    constructor(x, y, tier) {
      this.homeX = x;
      this.homeY = y;
      this.x = Math.random() * w;
      this.y = Math.random() * h;
      this.vx = 0;
      this.vy = 0;
      this.tier = tier;
      this.size = tier === 0 ? 1.2 : tier === 1 ? 1.8 : 2.6;
      this.drag = tier === 0 ? 0.9 : tier === 1 ? 0.88 : 0.85;
      this.baseColor = KLEE_PALETTE[Math.floor(Math.random() * KLEE_PALETTE.length)];
      this.colorSeed = Math.random() * 100000;
    }

    update(t, profile) {
      const dx = this.homeX - this.x;
      const dy = this.homeY - this.y;
      this.vx += dx * CFG.baseReturn * profile.speed;
      this.vy += dy * CFG.baseReturn * profile.speed;

      const nd = noise2(this.x * 0.005, this.y * 0.005, t) * profile.jitter;
      this.vx += Math.cos(nd * 6.283) * 0.25;
      this.vy += Math.sin(nd * 6.283) * 0.25;

      const mx = this.x - mouse.x;
      const my = this.y - mouse.y;
      const md2 = mx * mx + my * my;
      const rr = CFG.mouseRadius * CFG.mouseRadius;
      if (md2 < rr) {
        const inv = 1 / Math.sqrt(md2 + 1);
        const nx = mx * inv;
        const ny = my * inv;
        const tx = -ny;
        const ty = nx;
        const power = mouse.down ? 4.8 : 1.6;
        const falloff = (1 - md2 / rr) * power;
        this.vx += tx * profile.swirl * falloff;
        this.vy += ty * profile.swirl * falloff;
        if (mouse.down) {
          this.vx -= nx * 0.5 * falloff;
          this.vy -= ny * 0.5 * falloff;
        }
      }

      this.vx *= this.drag;
      this.vy *= this.drag;
      this.x += this.vx;
      this.y += this.vy;
    }

    draw(tNow, colorInfluence) {
      let colorR;
      let colorG;
      let colorB;
      if (paletteOn) {
        const t = tNow * 0.001;
        const breathe = Math.sin(t * 0.22 + this.colorSeed + paletteShift * 0.02) * 0.04;
        const grain = (noise2(
          this.x * 0.006 + this.colorSeed * 0.00001,
          this.y * 0.006 + this.colorSeed * 0.00001,
          t * 0.12 + this.colorSeed * 0.0001,
        ) - 0.5) * 0.08;
        const tint = 1 + breathe + grain;

        colorR = this.baseColor[0] * tint;
        colorG = this.baseColor[1] * tint;
        colorB = this.baseColor[2] * tint;

        if (colorInfluence) {
          colorR = clamp255(lerp(colorR, colorInfluence.r, colorInfluence.mix) * (1 + colorInfluence.brightness));
          colorG = clamp255(lerp(colorG, colorInfluence.g, colorInfluence.mix) * (1 + colorInfluence.brightness));
          colorB = clamp255(lerp(colorB, colorInfluence.b, colorInfluence.mix) * (1 + colorInfluence.brightness));
        } else {
          colorR = clamp255(colorR);
          colorG = clamp255(colorG);
          colorB = clamp255(colorB);
        }

        ctx.fillStyle = `rgb(${colorR.toFixed(0)} ${colorG.toFixed(0)} ${colorB.toFixed(0)})`;
      } else {
        ctx.fillStyle = '#f2f2f2';
      }

      if (paletteOn && this.tier === 2 && (this.colorSeed % 8) < 1) {
        const glowRadius = this.size * 1.5;
        ctx.globalAlpha = 0.045;
        ctx.beginPath();
        ctx.arc(this.x + this.size * 0.5, this.y + this.size * 0.5, glowRadius, 0, Math.PI * 2);
        ctx.fill();
        ctx.globalAlpha = 1;
      }

      if (glowOn) {
        ctx.shadowBlur = this.tier === 2 ? 8 : 4;
        ctx.shadowColor = ctx.fillStyle;
      }

      ctx.fillRect(this.x, this.y, this.size, this.size);

      if (linesOn) {
        ctx.strokeStyle = ctx.fillStyle;
        ctx.globalAlpha = 0.24;
        ctx.beginPath();
        ctx.moveTo(this.x, this.y);
        ctx.lineTo(this.x - this.vx * 3.2, this.y - this.vy * 3.2);
        ctx.stroke();
        ctx.globalAlpha = 1;
      }
    }
  }

  function log(msg, data) {
    if (data !== undefined) console.log(`[AF] ${msg}`, data);
    else console.log(`[AF] ${msg}`);
  }

  function resizeCanvas() {
    w = window.innerWidth;
    h = window.innerHeight;
    dpr = Math.max(1, Math.min(2, window.devicePixelRatio || 1));
    canvas.width = Math.floor(w * dpr);
    canvas.height = Math.floor(h * dpr);
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  }

  function buildMaskFromImage(img) {
    const off = document.createElement('canvas');
    off.width = w;
    off.height = h;
    const ox = off.getContext('2d');
    ox.clearRect(0, 0, w, h);

    const ratio = Math.min((w * 0.75) / img.width, (h * 0.75) / img.height);
    const dw = Math.max(1, img.width * ratio);
    const dh = Math.max(1, img.height * ratio);
    ox.drawImage(img, (w - dw) / 2, (h - dh) / 2, dw, dh);
    return ox.getImageData(0, 0, w, h);
  }

  function drawChakanaMask() {
    const off = document.createElement('canvas');
    off.width = w;
    off.height = h;
    const ox = off.getContext('2d');
    ox.clearRect(0, 0, w, h);

    const s = Math.floor(Math.min(w, h) * 0.06);
    const ox0 = Math.floor(w / 2 - 3.5 * s);
    const oy0 = Math.floor(h / 2 - 3.5 * s);

    ox.fillStyle = 'rgba(255,255,255,1)';
    for (let gy = 0; gy < 7; gy++) {
      for (let gx = 0; gx < 7; gx++) {
        const inCross = gx >= 2 && gx <= 4 || gy >= 2 && gy <= 4;
        const inCore = gx >= 3 && gx <= 3 && gy >= 3 && gy <= 3;
        if (inCross && !inCore) ox.fillRect(ox0 + gx * s, oy0 + gy * s, s, s);
      }
    }

    ox.clearRect(Math.floor(w / 2 - s * 0.7), Math.floor(h / 2 - s * 0.7), Math.floor(s * 1.4), Math.floor(s * 1.4));
    log('Procedural chakana mask generated.');
    return ox.getImageData(0, 0, w, h);
  }

  function pointsFromMask(imageData, requestedSource) {
    const coords = [];
    const data = imageData.data;

    for (let y = 0; y < h; y += CFG.step) {
      for (let x = 0; x < w; x += CFG.step) {
        const i = (y * w + x) * 4;
        if (data[i + 3] > 32) coords.push([x, y]);
      }
    }

    const pts = [];
    if (coords.length <= CFG.maxPoints) {
      for (let i = 0; i < coords.length; i++) {
        const [x, y] = coords[i];
        const r = Math.random();
        const tier = r < 0.62 ? 0 : r < 0.9 ? 1 : 2;
        pts.push(new Particle(x + (Math.random() - 0.5), y + (Math.random() - 0.5), tier));
      }
    } else {
      const sampleStride = coords.length / CFG.maxPoints;
      for (let i = 0; i < CFG.maxPoints; i++) {
        const idx = Math.floor(i * sampleStride + Math.random() * sampleStride * 0.35);
        const [x, y] = coords[Math.min(coords.length - 1, idx)];
        const r = Math.random();
        const tier = r < 0.62 ? 0 : r < 0.9 ? 1 : 2;
        pts.push(new Particle(x + (Math.random() - 0.5), y + (Math.random() - 0.5), tier));
      }
      log('Point cap reached with distributed sampling.', { max: CFG.maxPoints, totalMaskPoints: coords.length });
    }

    source = requestedSource;
    return pts;
  }

  function fallbackIfEmpty(reason) {
    log(`Rebuilding from procedural fallback. Reason: ${reason}`);
    const mask = drawChakanaMask();
    particles = pointsFromMask(mask, 'procedural');
    if (particles.length === 0) {
      throw new Error('Fallback procedural mask generated 0 points. Increase mask size or reduce step.');
    }
  }

  function loadShapeImage() {
    if (!shapeImagePromise) {
      shapeImagePromise = new Promise((resolve, reject) => {
        const img = new Image();
        img.onload = () => resolve(img);
        img.onerror = () => reject(new Error('shape.png failed to load.'));
        img.src = './shape.png?v=2';
      });
    }
    return shapeImagePromise;
  }

  async function rebuildParticles() {
    const runId = ++rebuildSerial;
    resizeCanvas();
    log('Loading ./shape.png…');
    try {
      const img = await loadShapeImage();
      if (runId !== rebuildSerial) return;
      log('shape.png loaded.', { width: img.width, height: img.height });

      resizeCanvas();
      const mask = buildMaskFromImage(img);
      log('Mask generated from shape.png.');
      particles = pointsFromMask(mask, 'shape.png');
      if (particles.length === 0) fallbackIfEmpty('shape alpha produced 0 points');
    } catch (err) {
      if (runId !== rebuildSerial) return;
      log('shape.png unavailable, using procedural fallback.', err.message);
      resizeCanvas();
      fallbackIfEmpty(err.message);
    }

    if (runId !== rebuildSerial) return;
    if (particles.length === 0) fallbackIfEmpty('safety net points.length === 0');
    cachedColorInfluence = null;
    log(`Points ready: ${particles.length} | source: ${source}`);
  }

  function updateStatus() {
    if (!statusNode) return;
    if (errorText) {
      statusNode.textContent = `ERROR: ${errorText} | Sugerencia: verifica ./shape.png (se usa procedural automáticamente)`;
    } else {
      statusNode.textContent = `points: ${particles.length} | fps: ${fps.toFixed(0)} | source: ${source} | mode: ${mode}`;
    }
  }

  function bindInput() {
    window.addEventListener('mousemove', (e) => {
      mouse.x = e.clientX;
      mouse.y = e.clientY;
    });
    window.addEventListener('mousedown', () => { mouse.down = true; });
    window.addEventListener('mouseup', () => { mouse.down = false; });
    window.addEventListener('mouseleave', () => { mouse.down = false; });

    window.addEventListener('keydown', (e) => {
      const key = e.key.toLowerCase();
      if (e.key >= '1' && e.key <= '5') mode = Number(e.key);
      if (key === 'h' && overlay) {
        uiVisible = !uiVisible;
        overlay.classList.toggle('is-hidden', !uiVisible);
      }
      if (key === 'c') paletteOn = !paletteOn;
      if (key === 'a') paletteShift = (paletteShift + 40) % 360;
      if (key === 'g') glowOn = !glowOn;
      if (key === 'v') linesOn = !linesOn;
      if (key === 't') trailsOn = !trailsOn;
      if (key === 'i') linksOn = !linksOn;
      if (key === 'r') CFG.noiseSeed = Math.floor(Math.random() * 1000000);
      updateStatus();
    });

    window.addEventListener('resize', () => {
      if (resizeDebounceTimer) clearTimeout(resizeDebounceTimer);
      resizeDebounceTimer = setTimeout(() => {
        rebuildParticles().catch((err) => {
          errorText = err.stack || String(err);
          updateStatus();
        });
      }, 140);
    });
  }

  function drawLinks() {
    const maxD = CFG.linkDistance;
    const maxD2 = maxD * maxD;
    ctx.strokeStyle = 'rgba(242,242,242,0.2)';
    ctx.lineWidth = 0.7;

    for (let i = 0; i < particles.length; i += CFG.linkSampleStep) {
      const p = particles[i];
      for (let j = i + CFG.linkSampleStep; j < particles.length; j += CFG.linkSampleStep) {
        const q = particles[j];
        const dx = p.x - q.x;
        const dy = p.y - q.y;
        const d2 = dx * dx + dy * dy;
        if (d2 < maxD2) {
          ctx.globalAlpha = (1 - d2 / maxD2) * 0.28;
          ctx.beginPath();
          ctx.moveTo(p.x, p.y);
          ctx.lineTo(q.x, q.y);
          ctx.stroke();
        }
      }
    }
    ctx.globalAlpha = 1;
  }

  function computeProximityInfluence() {
    const n = particles.length;
    const mix = new Float32Array(n);
    const bright = new Float32Array(n);
    const nearR = new Float32Array(n);
    const nearG = new Float32Array(n);
    const nearB = new Float32Array(n);
    const nearW = new Float32Array(n);

    const radius = CFG.proximityRadius;
    const cellSize = radius;
    const grid = new Map();
    const sampleStep = 3;

    for (let i = 0; i < n; i += sampleStep) {
      const p = particles[i];
      const cx = Math.floor(p.x / cellSize);
      const cy = Math.floor(p.y / cellSize);
      const key = `${cx},${cy}`;
      const cell = grid.get(key);
      if (cell) {
        cell.r += p.baseColor[0];
        cell.g += p.baseColor[1];
        cell.b += p.baseColor[2];
        cell.count += 1;
      } else {
        grid.set(key, { r: p.baseColor[0], g: p.baseColor[1], b: p.baseColor[2], count: 1 });
      }
    }
    for (let i = 0; i < n; i += sampleStep) {
      const p = particles[i];
      const cx = Math.floor(p.x / cellSize);
      const cy = Math.floor(p.y / cellSize);
      let localDensity = 0;

      for (let oy = -1; oy <= 1; oy++) {
        for (let ox = -1; ox <= 1; ox++) {
          const cell = grid.get(`${cx + ox},${cy + oy}`);
          if (!cell) continue;
          const distCell = Math.sqrt(ox * ox + oy * oy);
          const cellFalloff = 1 / (1 + distCell);
          const w = cell.count * cellFalloff;

          nearR[i] += (cell.r / cell.count) * w;
          nearG[i] += (cell.g / cell.count) * w;
          nearB[i] += (cell.b / cell.count) * w;
          nearW[i] += w;
          localDensity += cell.count * cellFalloff;
        }
      }

      const densityNorm = Math.min(1, localDensity / 20);
      mix[i] = CFG.proximityBlend * densityNorm;
      bright[i] = CFG.proximityBoost * densityNorm;
    }

    const influence = new Array(n);
    for (let i = 0; i < n; i++) {
      if (i % sampleStep !== 0 || nearW[i] <= 0.0001) {
        influence[i] = null;
        continue;
      }
      influence[i] = {
        r: nearR[i] / nearW[i],
        g: nearG[i] / nearW[i],
        b: nearB[i] / nearW[i],
        mix: Math.min(0.08, mix[i]),
        brightness: Math.min(0.06, bright[i]),
      };
    }
    return influence;
  }

  function animate(tNow) {
    frameCounter++;
    renderTick++;
    ctx.shadowBlur = 0;
    ctx.shadowColor = 'transparent';

    if (trailsOn) {
      ctx.fillStyle = `rgba(4, 5, 10, ${CFG.bgFade})`;
      ctx.fillRect(0, 0, w, h);
    } else {
      ctx.fillStyle = '#04050a';
      ctx.fillRect(0, 0, w, h);
    }

    const profile = MODES[mode];
    const t = tNow * 0.0006;

    const breathingScale = 1 + 0.015 * Math.sin(tNow * 0.0004);
    if (paletteOn) {
      if (!cachedColorInfluence || renderTick % 12 === 0) {
        cachedColorInfluence = computeProximityInfluence();
      }
    } else {
      cachedColorInfluence = null;
    }

    ctx.save();
    ctx.translate(w * 0.5, h * 0.5);
    ctx.scale(breathingScale, breathingScale);
    ctx.translate(-w * 0.5, -h * 0.5);

    for (let i = 0; i < particles.length; i++) {
      const p = particles[i];
      p.update(t + i * 0.00002, profile);
      p.draw(tNow, cachedColorInfluence ? cachedColorInfluence[i] : null);
    }

    if (linksOn) drawLinks();

    ctx.restore();

    if (tNow - lastFpsT >= 400) {
      fps = frameCounter * 1000 / (tNow - lastFpsT);
      frameCounter = 0;
      lastFpsT = tNow;
      updateStatus();
    }

    requestAnimationFrame(animate);
  }

  function noise2(x, y, t) {
    const v = Math.sin((x * 12.9898 + y * 78.233 + t * 37.719 + CFG.noiseSeed) * 43758.5453123);
    return v - Math.floor(v);
  }

  async function boot() {
    try {
      resizeCanvas();
      bindInput();
      await rebuildParticles();
      window.__AF_SKETCH_READY__ = true;
      log('Render loop started.');
      updateStatus();
      requestAnimationFrame(animate);
    } catch (err) {
      errorText = err.stack || String(err);
      console.error('[AF] Fatal init error:', err);
      updateStatus();
      try {
        fallbackIfEmpty('fatal init catch');
        errorText = '';
        window.__AF_SKETCH_READY__ = true;
        requestAnimationFrame(animate);
      } catch (finalErr) {
        errorText = finalErr.stack || String(finalErr);
        updateStatus();
      }
    }
  }

  boot();
})();
