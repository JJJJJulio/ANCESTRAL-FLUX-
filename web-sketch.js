(() => {
  window.__AF_SKETCH_READY__ = false;

  const CFG = {
    step: 5,
    maxPoints: 8000,
    alphaThreshold: 32,
    baseReturn: 0.085,
    mouseRadius: 34,
    padRatio: 0.08,
    linksMaxDist: 7.5,
    maxLinks: 1600,
  };

  const BAUHAUS = [
    [[245, 245, 245], [8, 8, 10], [230, 57, 70]],
    [[8, 8, 10], [245, 245, 245], [69, 123, 157]],
    [[222, 222, 222], [12, 12, 14], [241, 250, 60]],
    [[245, 245, 245], [69, 123, 157], [230, 57, 70]],
    [[15, 15, 20], [241, 250, 60], [230, 57, 70]],
  ];

  const FORCE_PROCEDURAL_MASK = true;

  const MODES = {
    1: { swirl: 0.28, jitter: 0.06, speed: 0.94 },
    2: { swirl: 0.65, jitter: 0.11, speed: 1.0 },
    3: { swirl: 1.0, jitter: 0.17, speed: 1.05 },
    4: { swirl: 1.5, jitter: 0.24, speed: 1.12 },
    5: { swirl: 2.1, jitter: 0.32, speed: 1.2 },
  };

  const canvas = document.getElementById('flux-canvas');
  const ctx = canvas.getContext('2d', { alpha: false });
  const overlay = document.getElementById('overlay-ui');
  const statusNode = document.getElementById('status-readout');

  let w = 0;
  let h = 0;
  let dpr = 1;
  let mode = 2;
  let source = 'boot';
  let errorText = '';
  let uiVisible = true;
  let glowOn = true;
  let linesOn = true;
  let trailsOn = true;
  let linksOn = true;
  let paletteOn = true;
  let paletteShift = 0;
  let seed = 4242;
  let noiseSeed = seed;

  let points = [];
  let maskData = null;
  let maskW = 0;
  let maskH = 0;
  let bbox = { minX: 0, minY: 0, maxX: 1, maxY: 1, w: 1, h: 1 };
  let fit = { scale: 1, offsetX: 0, offsetY: 0 };

  let mouse = { x: -1e6, y: -1e6, down: false };
  let fps = 0;
  let fpsFrames = 0;
  let fpsLast = performance.now();

  class Particle {
    constructor(x, y, tier, rand) {
      this.homeX = x;
      this.homeY = y;
      this.x = x + (rand() - 0.5) * 18;
      this.y = y + (rand() - 0.5) * 18;
      this.px = this.x;
      this.py = this.y;
      this.vx = 0;
      this.vy = 0;
      this.tier = tier;
      this.baseSize = tier === 0 ? 0.8 : tier === 1 ? 1.2 : 1.8;
      this.drag = tier === 0 ? 0.9 : tier === 1 ? 0.875 : 0.84;
    }

    update(t, profile, mx, my) {
      this.px = this.x;
      this.py = this.y;

      const homeDx = this.homeX - this.x;
      const homeDy = this.homeY - this.y;
      this.vx += homeDx * CFG.baseReturn * profile.speed;
      this.vy += homeDy * CFG.baseReturn * profile.speed;

      const n = noise2(this.x * 0.021, this.y * 0.021, t, noiseSeed);
      const ang = n * Math.PI * 2;
      this.vx += Math.cos(ang) * profile.jitter;
      this.vy += Math.sin(ang) * profile.jitter;

      const dxm = this.x - mx;
      const dym = this.y - my;
      const d2 = dxm * dxm + dym * dym;
      const rr = CFG.mouseRadius * CFG.mouseRadius;
      if (d2 < rr) {
        const inv = 1 / Math.sqrt(d2 + 1e-3);
        const nx = dxm * inv;
        const ny = dym * inv;
        const tx = -ny;
        const ty = nx;
        const falloff = 1 - d2 / rr;
        const swirl = profile.swirl * falloff;
        this.vx += tx * swirl;
        this.vy += ty * swirl;
        if (mouse.down) {
          this.vx -= nx * 0.7 * falloff;
          this.vy -= ny * 0.7 * falloff;
        }
      }

      this.vx *= this.drag;
      this.vy *= this.drag;
      this.x += this.vx;
      this.y += this.vy;
    }
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

    if (maxX < minX || maxY < minY) return null;
    return { minX, minY, maxX, maxY, w: maxX - minX + 1, h: maxY - minY + 1 };
  }

  function computeFit() {
    if (!bbox || !bbox.w || !bbox.h || !w || !h) {
      fit = { scale: 1, offsetX: 0, offsetY: 0 };
      return;
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

  function pointsFromMask() {
    if (!maskData) return [];
    const pts = [];
    const data = maskData.data;
    const rand = makeRand(seed);
    for (let y = 0; y < maskH; y += CFG.step) {
      for (let x = 0; x < maskW; x += CFG.step) {
        const i = (y * maskW + x) * 4;
        if (data[i + 3] > CFG.alphaThreshold) {
          const r = rand();
          const tier = r < 0.62 ? 0 : r < 0.9 ? 1 : 2;
          pts.push(new Particle(x + (rand() - 0.5) * 0.7, y + (rand() - 0.5) * 0.7, tier, rand));
          if (pts.length >= CFG.maxPoints) return pts;
        }
      }
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

  function animate(ts) {
    fpsFrames++;
    const t = ts * 0.001;
    const profile = MODES[mode];
    const [ink, bg, glow] = paletteNow(t);

    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    if (trailsOn) {
      ctx.fillStyle = `rgba(${bg[0]}, ${bg[1]}, ${bg[2]}, 0.19)`;
    } else {
      ctx.fillStyle = `rgb(${bg[0]}, ${bg[1]}, ${bg[2]})`;
    }
    ctx.fillRect(0, 0, w, h);

    ctx.setTransform(dpr * fit.scale, 0, 0, dpr * fit.scale, dpr * fit.offsetX, dpr * fit.offsetY);

    const mx = (mouse.x - fit.offsetX) / fit.scale;
    const my = (mouse.y - fit.offsetY) / fit.scale;

    if (linesOn) {
      ctx.strokeStyle = `rgba(${ink[0]}, ${ink[1]}, ${ink[2]}, 0.26)`;
      ctx.lineWidth = 0.22;
    }

    for (const p of points) {
      p.update(t, profile, mx, my);

      if (linesOn) {
        ctx.beginPath();
        ctx.moveTo(p.px, p.py);
        ctx.lineTo(p.x, p.y);
        ctx.stroke();
      }

      const speed = Math.hypot(p.vx, p.vy);
      const size = Math.min(3.2, p.baseSize + speed * 0.16);

      if (glowOn) {
        ctx.fillStyle = `rgba(${glow[0]}, ${glow[1]}, ${glow[2]}, 0.10)`;
        ctx.fillRect(p.x - size * 0.9, p.y - size * 0.9, size * 2.1, size * 2.1);
      }

      ctx.fillStyle = `rgba(${ink[0]}, ${ink[1]}, ${ink[2]}, 0.9)`;
      ctx.fillRect(p.x, p.y, size, size);
    }

    drawLinks(ink);

    const dt = ts - fpsLast;
    if (dt > 350) {
      fps = (fpsFrames * 1000) / dt;
      fpsFrames = 0;
      fpsLast = ts;
      updateStatus();
    }

    requestAnimationFrame(animate);
  }

  function updateStatus() {
    if (!statusNode) return;
    if (errorText) {
      statusNode.textContent = `ERROR: ${errorText}`;
      return;
    }
    statusNode.textContent = `points: ${points.length} | fps: ${fps.toFixed(0)} | source: ${source} | mode:${mode} | P:${onOff(paletteOn)} V:${onOff(linesOn)} G:${onOff(glowOn)} T:${onOff(trailsOn)} L:${onOff(linksOn)}`;
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
      const k = e.key.toLowerCase();
      if (k >= '1' && k <= '5') mode = Number(k);
      else if (k === 'p') paletteOn = !paletteOn;
      else if (k === 'c') paletteShift = (paletteShift + 1) % BAUHAUS.length;
      else if (k === 'v') linesOn = !linesOn;
      else if (k === 'g') glowOn = !glowOn;
      else if (k === 't') trailsOn = !trailsOn;
      else if (k === 'l') linksOn = !linksOn;
      else if (k === 'r') reseed();
      else if (k === 'h') {
        uiVisible = !uiVisible;
        overlay.classList.toggle('is-hidden', !uiVisible);
      }
      updateStatus();
    });

    window.addEventListener('resize', async () => {
      resizeCanvas();
      computeFit();
      updateStatus();
    });
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

  boot();
})();
