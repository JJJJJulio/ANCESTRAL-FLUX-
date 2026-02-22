(() => {
  const canvas = document.getElementById('c');
  const ctx = canvas.getContext('2d', { alpha: false });

  const CONFIG = {
    bg: '#0b0b0d',
    baseColor: [239, 226, 205],
    trailAlpha: 0.11,
    particleTarget: 1500,
    minParticles: 800,
    maxParticles: 1800,
    scales: [0.55, 1, 1.65],
    emergeStart: 3,
    resonanceStart: 12,
    formationDuration: 12,
    cellCount: 9,
    cellStep: 1,
    autoQualityEvery: 45,
  };

  const memKey = 'flux-memory-v1';
  const memory = loadMemory();
  const rng = mulberry32(memory.seed);

  const pointer = {
    x: 0,
    y: 0,
    vx: 0,
    vy: 0,
    speed: 0,
    active: false,
    lastX: 0,
    lastY: 0,
    lastT: performance.now(),
  };

  let dpr = 1;
  let width = 1;
  let height = 1;
  let radius = 1;
  let time = 0;
  let frame = 0;
  let quality = 1;
  let lastRitual = -999;
  let state = 'latencia';

  const wave = {
    active: false,
    x: 0,
    y: 0,
    t0: 0,
    duration: 2.8,
    strength: 1,
  };

  const particles = [];
  const targetPoints = [];

  resize();
  buildTarget();
  initParticles(adjustParticleCount(CONFIG.particleTarget));
  tick(performance.now());

  window.addEventListener('resize', resize);
  canvas.addEventListener('mousemove', onMove, { passive: true });
  canvas.addEventListener('mouseleave', () => {
    pointer.active = false;
    pointer.speed *= 0.86;
  });
  canvas.addEventListener('click', onRitual);

  function loadMemory() {
    const now = Date.now();
    let prev = null;

    try {
      prev = JSON.parse(localStorage.getItem(memKey) || 'null');
    } catch {
      prev = null;
    }

    const seed = prev?.seed ? (prev.seed * 1664525 + 1013904223) >>> 0 : (Math.random() * 2 ** 32) >>> 0;
    const visits = (prev?.visits || 0) + 1;
    const residue = Math.min(1, (prev?.residue || 0) * 0.88 + 0.16);

    const mem = { seed, visits, residue, lastVisit: now };
    localStorage.setItem(memKey, JSON.stringify(mem));
    return mem;
  }

  function saveResidue(extra = 0) {
    const residue = Math.min(1, memory.residue * 0.86 + 0.12 + extra);
    memory.residue = residue;
    memory.lastVisit = Date.now();
    localStorage.setItem(memKey, JSON.stringify(memory));
  }

  function resize() {
    dpr = Math.min(window.devicePixelRatio || 1, 2);
    width = window.innerWidth;
    height = window.innerHeight;
    radius = Math.min(width, height) * 0.355;

    canvas.width = Math.max(1, Math.floor(width * dpr));
    canvas.height = Math.max(1, Math.floor(height * dpr));
    canvas.style.width = `${width}px`;
    canvas.style.height = `${height}px`;

    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    buildTarget();
  }

  function buildTarget() {
    targetPoints.length = 0;
    const n = CONFIG.cellCount;
    const mid = (n - 1) / 2;
    const gap = (radius * 1.6) / n;

    for (let y = 0; y < n; y += CONFIG.cellStep) {
      for (let x = 0; x < n; x += CONFIG.cellStep) {
        const dx = Math.abs(x - mid);
        const dy = Math.abs(y - mid);
        const plus = dx <= 1 || dy <= 1;
        const cornerCut = dx >= 3 && dy >= 3;
        const ring = dx === 2 || dy === 2;

        if ((plus && !cornerCut) || (ring && !(dx >= 3 && dy >= 3))) {
          targetPoints.push({
            x: width * 0.5 + (x - mid) * gap,
            y: height * 0.5 + (y - mid) * gap,
          });
        }
      }
    }
  }

  function initParticles(count) {
    particles.length = 0;
    for (let i = 0; i < count; i++) {
      const edge = i % 4;
      const p = {
        x: edge === 0 ? rng() * width : edge === 1 ? width + 20 : edge === 2 ? rng() * width : -20,
        y: edge === 0 ? -20 : edge === 1 ? rng() * height : edge === 2 ? height + 20 : rng() * height,
        vx: (rng() - 0.5) * 0.2,
        vy: (rng() - 0.5) * 0.2,
        mass: 0.8 + rng() * 1.8,
        size: CONFIG.scales[i % CONFIG.scales.length],
        jitter: rng() * Math.PI * 2,
        phase: rng() * Math.PI * 2,
        targetIdx: (i * 13 + Math.floor(rng() * targetPoints.length)) % Math.max(1, targetPoints.length),
      };
      particles.push(p);
    }
  }

  function adjustParticleCount(target) {
    const memOffset = Math.floor((memory.residue - 0.5) * 200);
    const desired = Math.max(CONFIG.minParticles, Math.min(CONFIG.maxParticles, target + memOffset));
    return Math.round(desired * quality);
  }

  function onMove(e) {
    const t = performance.now();
    pointer.x = e.clientX;
    pointer.y = e.clientY;
    const dt = Math.max(16, t - pointer.lastT);
    pointer.vx = (pointer.x - pointer.lastX) / dt;
    pointer.vy = (pointer.y - pointer.lastY) / dt;
    pointer.speed = Math.min(2.4, Math.hypot(pointer.vx, pointer.vy) * 28);
    pointer.lastX = pointer.x;
    pointer.lastY = pointer.y;
    pointer.lastT = t;
    pointer.active = true;
  }

  function onRitual(e) {
    wave.active = true;
    wave.x = e.clientX;
    wave.y = e.clientY;
    wave.t0 = time;
    wave.strength = 1 + memory.residue * 0.6;
    lastRitual = time;
    saveResidue(0.14);
  }

  function updateState() {
    if (time < CONFIG.emergeStart) state = 'latencia';
    else if (time < CONFIG.resonanceStart) state = 'emergencia';
    else if (time - lastRitual < 4.8) state = 'ritual';
    else state = 'resonancia';
  }

  function tick(t) {
    const dt = Math.min(0.033, (t - (tick.prev || t)) / 1000 || 0.016);
    tick.prev = t;
    time += dt;
    frame++;

    updateState();
    animate(dt);
    render();

    if (frame % CONFIG.autoQualityEvery === 0) {
      const fps = 1 / dt;
      if (fps < 44 && quality > 0.62) {
        quality *= 0.9;
        rebalanceParticles();
      } else if (fps > 57 && quality < 1) {
        quality = Math.min(1, quality * 1.04);
      }
    }

    requestAnimationFrame(tick);
  }

  function rebalanceParticles() {
    const desired = adjustParticleCount(CONFIG.particleTarget);
    if (desired < particles.length) particles.length = desired;
    else {
      const add = desired - particles.length;
      for (let i = 0; i < add; i++) {
        particles.push({
          x: rng() * width,
          y: height + rng() * 40,
          vx: (rng() - 0.5) * 0.2,
          vy: -rng() * 0.2,
          mass: 0.8 + rng() * 1.8,
          size: CONFIG.scales[(particles.length + i) % CONFIG.scales.length],
          jitter: rng() * Math.PI * 2,
          phase: rng() * Math.PI * 2,
          targetIdx: Math.floor(rng() * Math.max(1, targetPoints.length)),
        });
      }
    }
  }

  function animate(dt) {
    const centerX = width * 0.5;
    const centerY = height * 0.5;

    const emergence = smoothstep(CONFIG.emergeStart, CONFIG.formationDuration, time);
    const resonance = smoothstep(CONFIG.resonanceStart, CONFIG.resonanceStart + 8, time);
    const residuePull = memory.residue * 0.16;

    for (let i = 0; i < particles.length; i++) {
      const p = particles[i];
      const target = targetPoints[p.targetIdx % targetPoints.length] || { x: centerX, y: centerY };

      const tx = target.x - p.x;
      const ty = target.y - p.y;
      const dist = Math.hypot(tx, ty) + 0.001;

      const lift = 0.012 + emergence * 0.1 + resonance * 0.02;
      p.vx += (tx / dist) * lift * dt * 60;
      p.vy += (ty / dist) * lift * dt * 60;

      const swirl = (Math.sin(time * 0.22 + p.phase) * 0.5 + residuePull) * (0.03 + emergence * 0.04);
      p.vx += (-ty / dist) * swirl * dt * 60;
      p.vy += (tx / dist) * swirl * dt * 60;

      if (pointer.active) {
        const dx = p.x - pointer.x;
        const dy = p.y - pointer.y;
        const d2 = dx * dx + dy * dy;
        const windRange = 240 + pointer.speed * 50;
        if (d2 < windRange * windRange) {
          const influence = (1 - Math.sqrt(d2) / windRange) * (0.06 + pointer.speed * 0.1);
          const crossX = pointer.vx * 140 - dy * 0.001;
          const crossY = pointer.vy * 140 + dx * 0.001;
          p.vx += crossX * influence;
          p.vy += crossY * influence;
        }
      }

      if (wave.active) {
        const wt = time - wave.t0;
        if (wt < wave.duration) {
          const dx = p.x - wave.x;
          const dy = p.y - wave.y;
          const d = Math.hypot(dx, dy);
          const ring = wt * 320;
          const band = 90;
          const edge = Math.abs(d - ring);
          if (edge < band) {
            const impulse = (1 - edge / band) * 0.46 * wave.strength;
            p.vx += (dx / (d + 0.001)) * impulse;
            p.vy += (dy / (d + 0.001)) * impulse;
            if (rng() < 0.01) p.targetIdx = (p.targetIdx + 1 + Math.floor(rng() * 7)) % targetPoints.length;
          }
        } else {
          wave.active = false;
        }
      }

      const damp = 0.955 - p.mass * 0.004;
      p.vx *= damp;
      p.vy *= damp;

      p.x += p.vx;
      p.y += p.vy;

      if (p.x < -40 || p.x > width + 40 || p.y < -40 || p.y > height + 40) {
        p.x = centerX + (rng() - 0.5) * width * 0.9;
        p.y = height + rng() * 60;
        p.vx = (rng() - 0.5) * 0.3;
        p.vy = -rng() * 0.4;
      }
    }

    pointer.speed *= 0.92;
  }

  function render() {
    ctx.fillStyle = `rgba(11,11,13,${CONFIG.trailAlpha})`;
    ctx.fillRect(0, 0, width, height);

    const emergence = smoothstep(CONFIG.emergeStart, CONFIG.formationDuration, time);
    const resonance = smoothstep(CONFIG.resonanceStart, CONFIG.resonanceStart + 8, time);

    const warm = 206 + Math.floor(18 * resonance + 20 * memory.residue);
    const alphaBase = 0.16 + emergence * 0.26 + resonance * 0.14;

    for (let i = 0; i < particles.length; i++) {
      const p = particles[i];
      const pulse = 0.72 + 0.28 * Math.sin(time * 0.8 + p.jitter);
      const a = alphaBase * pulse / p.mass;
      ctx.fillStyle = `rgba(${CONFIG.baseColor[0]}, ${warm}, ${CONFIG.baseColor[2]}, ${a.toFixed(3)})`;
      ctx.beginPath();
      ctx.arc(p.x, p.y, p.size, 0, Math.PI * 2);
      ctx.fill();
    }

    if (emergence > 0.15) {
      ctx.strokeStyle = `rgba(220,210,188,${(0.05 + emergence * 0.16).toFixed(3)})`;
      ctx.lineWidth = 1;
      ctx.beginPath();
      for (let i = 0; i < targetPoints.length; i++) {
        const q = targetPoints[i];
        if (i === 0) ctx.moveTo(q.x, q.y);
        else ctx.lineTo(q.x, q.y);
      }
      ctx.stroke();
    }
  }

  function smoothstep(a, b, x) {
    const t = Math.max(0, Math.min(1, (x - a) / (b - a || 1)));
    return t * t * (3 - 2 * t);
  }

  function mulberry32(seed) {
    let t = seed >>> 0;
    return () => {
      t += 0x6d2b79f5;
      let r = Math.imul(t ^ (t >>> 15), t | 1);
      r ^= r + Math.imul(r ^ (r >>> 7), r | 61);
      return ((r ^ (r >>> 14)) >>> 0) / 4294967296;
    };
  }
})();
