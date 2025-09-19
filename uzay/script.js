// Uzay Keşfi – Basit 2D Oyun
// Kontroller:
// - Uzay modu: W/Up = itki, A/Left = sola dön, D/Right = sağa dön, S/Down = fren
// - İniş: Uygun olduğunda L
// - Gezegen modu (yeni): W/A/S/D = yürü, L = kalkış

(function () {
  const canvas = document.getElementById('game');
  const ctx = canvas.getContext('2d');

  const hud = document.getElementById('hud');
  const hint = document.getElementById('hint');
  // Touch controls nodes (may be null on desktop)
  const touchControls = document.getElementById('touch-controls');
  const joy = document.getElementById('joy');
  const joyKnob = document.getElementById('joy-knob');
  const btnFire = document.getElementById('btn-fire');
  const btnInteract = document.getElementById('btn-interact');
  const btnContext = document.getElementById('btn-context');
  const btnMenu = document.getElementById('btn-menu');

  function resize() {
    const dpr = Math.max(1, Math.min(2, window.devicePixelRatio || 1));
    canvas.width = Math.floor(canvas.clientWidth * dpr);
    canvas.height = Math.floor(canvas.clientHeight * dpr);
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  }
  window.addEventListener('resize', resize);
  // Initial layout sizing
  requestAnimationFrame(() => {
    // Force clientWidth/Height to be available after layout
    resize();
  });

  // PRNG with seed for reproducible stars/planets
  function mulberry32(seed) {
    return function () {
      let t = (seed += 0x6d2b79f5);
      t = Math.imul(t ^ (t >>> 15), t | 1);
      t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
  }

  const rand = mulberry32(42);

  const STATE = { SPACE: 'space', PLANET: 'planet' };

  // World setup
  const planets = [];
  const planetNames = [
    'Astra', 'Nyx', 'Helios', 'Vega', 'Orion', 'Luna', 'Tethys', 'Nox', 'Kaon', 'Zeph'
  ];

  // Generate planets: 1 super + 11 normals (total 12)
  const totalPlanets = 12;
  for (let i = 0; i < totalPlanets; i++) {
    const angle = rand() * Math.PI * 2;
    const dist = 1400 + rand() * 3200; // from origin
    const x = Math.cos(angle) * dist;
    const y = Math.sin(angle) * dist;
    const r = i === 0 ? (240 + rand() * 80) : (80 + rand() * 120);
    const hue = Math.floor(rand() * 360);
    const color = `hsl(${hue} 70% 55%)`;
    const name = (i === 0 ? 'Titan' : planetNames[i % planetNames.length]);
    const hasRing = i !== 0 && rand() < 0.28;
    const ringTilt = (rand() - 0.5) * 0.7;
    const ringScale = 0.3 + rand() * 0.25;
    const ringColor = `hsla(${(hue + 28) % 360} 80% 65% / 0.45)`;
    planets.push({
      x,
      y,
      r,
      color,
      name,
      glow: `hsla(${hue} 90% 60% / 0.3)`,
      hue,
      ring: hasRing,
      ringTilt,
      ringScale,
      ringColor,
    });
  }

  // Guardian drones patrol selected planets
  const drones = [];
  for (let i = 1; i < planets.length; i += 3) {
    if (planets[i]) drones.push(createDrone(i));
  }

  const stars = Array.from({ length: 520 }, () => ({
    x: (rand() - 0.5) * 10000,
    y: (rand() - 0.5) * 10000,
    size: rand() < 0.12 ? 2 : 1,
    base: 0.35 + rand() * 0.6,
    twinkle: 0.5 + rand() * 1.2,
    phase: rand() * Math.PI * 2,
  }));

  const nebulae = Array.from({ length: 4 }, () => {
    const hue = Math.floor(rand() * 360);
    return {
      x: (rand() - 0.5) * 8000,
      y: (rand() - 0.5) * 8000,
      r: 600 + rand() * 900,
      rotation: rand() * Math.PI * 2,
      colorA: `hsla(${hue} 70% 60% / 0.12)`,
      colorB: `hsla(${(hue + 40) % 360} 80% 65% / 0.08)`
    };
  });

  // Ship
  const ship = {
    x: planets[0].x + planets[0].r + 160,
    y: planets[0].y,
    vx: 0,
    vy: 0,
    angle: Math.PI, // facing left initially
    r: 12,
  };

  const enemyShots = [];
  const trailPoints = [];
  let trailTimer = 0;

  // Astronot (planet local coordinates)
  const astro = {
    planetIndex: 0,
    x: 0,
    y: 0,
    r: 7,
    speed: 90,
  };

  // Planet surface data (habitat + props)
  const surfaces = new Array(100).fill(null);

  // Inventory and cosmetics
  const inventory = new Array(16).fill(null);
  const shipColors = [
    { id: 'white', name: 'Beyaz', fill: '#d7f1ff', stroke: '#9cc9ff' },
    { id: 'navy', name: 'Lacivert', fill: '#243b6b', stroke: '#4f6fb6' },
    { id: 'yellow', name: 'Sarı', fill: '#dbc251', stroke: '#f5dd73' },
    { id: 'pink', name: 'Pembe', fill: '#d96aa7', stroke: '#f2a8cf' },
    { id: 'blue', name: 'Mavi', fill: '#4499ff', stroke: '#84bdff' },
  ];
  const suitColors = [
    { id: 'white', name: 'Beyaz', fill: '#f2f5ff' },
    { id: 'navy', name: 'Lacivert', fill: '#2b3f73' },
    { id: 'yellow', name: 'Sarı', fill: '#e7d35b' },
    { id: 'pink', name: 'Pembe', fill: '#e48cbf' },
    { id: 'blue', name: 'Mavi', fill: '#64a8ff' },
  ];
  let shipColorId = 'white';
  let suitColorId = 'white';
  const unlockedShipColors = new Set(['white']);
  const unlockedSuitColors = new Set(['white']);

  // Defensive systems
  let shield = 1;
  let shieldCooldown = 0;
  let shieldHitTimer = 0;
  let cargoDropTimer = 0;
  const shieldRechargeRate = 0.16;
  const shieldRechargeDelay = 2.6;

  // Camera feedback
  let cameraShake = 0;
  let timeSeconds = 0;

  // Menu and discovery state
  let menuOpen = false;
  const menu = document.getElementById('menu');
  const menuContent = document.getElementById('menu-content');
  const visited = new Set();

  // Camera
  const camera = { x: 0, y: 0, zoom: 1 };

  // Input
  const keys = new Set();
  const heldVirtual = new Set();
  window.addEventListener('keydown', (e) => {
    keys.add(e.key.toLowerCase());
    if (e.key === ' ' || e.key.toLowerCase() === 'w' || e.key === 'ArrowUp') e.preventDefault();
    // Space shooting trigger on keydown
    if (e.key === ' ' && state === STATE.SPACE && !menuOpen) {
      tryShoot();
    }
  });
  window.addEventListener('keyup', (e) => keys.delete(e.key.toLowerCase()));

  let state = STATE.SPACE;
  let currentPlanet = -1;
  
  // Space entities
  const asteroids = [];
  const loot = [];
  const minerals = [
    { id: 'iron', name: 'Demir', color: '#b9bfc7' },
    { id: 'copper', name: 'Bakır', color: '#c47b42' },
    { id: 'gold', name: 'Altın', color: '#e2c24c' },
    { id: 'platinum', name: 'Platin', color: '#cfd6e3' },
    { id: 'iridium', name: 'İridyum', color: '#b0a5ff' },
    { id: 'ice', name: 'Buz', color: '#aee6ff' },
    { id: 'silicon', name: 'Silisyum', color: '#a3a3a3' },
  ];
  const artifacts = [
    { id: 'ancient-core', name: 'Kadim Çekirdek', color: '#a897ff' },
    { id: 'stellar-map', name: 'Yıldız Haritası', color: '#7de0ff' },
    { id: 'plasma-cell', name: 'Plazma Hücresi', color: '#ff8fbf' },
  ];

  // Overheat
  let heat = 0; // 0..1
  const heatPerShot = 1/6; // 6. atışta dolar
  const heatCoolRate = 0.22; // per second

  // Touch controls setup
  const isTouchLike = (('ontouchstart' in window) || navigator.maxTouchPoints > 0 || (window.matchMedia && window.matchMedia('(pointer: coarse)').matches));
  if (isTouchLike && touchControls) {
    touchControls.classList.remove('hidden');
    setupTouchControls();
  }

  function setupTouchControls() {
    // Prevent scroll on touch areas
    [joy, btnFire, btnInteract, btnContext, btnMenu].forEach(el => {
      if (!el) return;
      el.addEventListener('touchstart', (ev)=>ev.preventDefault(), { passive: false });
      el.addEventListener('touchmove', (ev)=>ev.preventDefault(), { passive: false });
    });

    // Virtual joystick
    let joyActive = false; let joyId = null; const base = { x: 0, y: 0 };
    function applyDir(dx, dy) {
      // clear old
      ['w','a','s','d'].forEach(k=>{ if (heldVirtual.has(k)) { keys.delete(k); heldVirtual.delete(k); } });
      const dead = 10;
      const ang = Math.atan2(dy, dx);
      const mag = Math.hypot(dx, dy);
      if (mag < dead) return;
      const nx = Math.cos(ang), ny = Math.sin(ang);
      if (ny < -0.3) { keys.add('w'); heldVirtual.add('w'); }
      if (ny > 0.3)  { keys.add('s'); heldVirtual.add('s'); }
      if (nx < -0.3) { keys.add('a'); heldVirtual.add('a'); }
      if (nx > 0.3)  { keys.add('d'); heldVirtual.add('d'); }
    }
    function centerKnob() { if (joyKnob) joyKnob.style.transform = 'translate(-50%, -50%)'; }
    function moveKnob(dx, dy) {
      if (!joyKnob) return;
      const R = 60;
      const d = Math.hypot(dx, dy);
      const f = d > R ? R/d : 1;
      joyKnob.style.transform = `translate(calc(-50% + ${dx*f}px), calc(-50% + ${dy*f}px))`;
    }
    function clearDir() { ['w','a','s','d'].forEach(k=>{ keys.delete(k); heldVirtual.delete(k); }); centerKnob(); }

    if (joy) {
      joy.addEventListener('pointerdown', (ev) => {
        joy.setPointerCapture(ev.pointerId);
        joyActive = true; joyId = ev.pointerId;
        const rect = joy.getBoundingClientRect();
        base.x = rect.left + rect.width/2;
        base.y = rect.top + rect.height/2;
        const dx = ev.clientX - base.x; const dy = ev.clientY - base.y;
        moveKnob(dx, dy); applyDir(dx, dy);
      });
      joy.addEventListener('pointermove', (ev) => {
        if (!joyActive || ev.pointerId !== joyId) return;
        const dx = ev.clientX - base.x; const dy = ev.clientY - base.y;
        moveKnob(dx, dy); applyDir(dx, dy);
      });
      function endJoy(ev){ if (joyActive && (!ev || ev.pointerId === joyId)) { joyActive=false; joyId=null; clearDir(); } }
      joy.addEventListener('pointerup', endJoy);
      joy.addEventListener('pointercancel', endJoy);
      joy.addEventListener('pointerleave', endJoy);
    }

    // Buttons
    function bindTapButton(el, code, onTap){
      if (!el) return;
      el.addEventListener('pointerdown', (e)=>{ e.preventDefault(); keys.add(code); if (onTap) onTap(); });
      el.addEventListener('pointerup', (e)=>{ e.preventDefault(); keys.delete(code); });
      el.addEventListener('pointercancel', (e)=>{ e.preventDefault(); keys.delete(code); });
      el.addEventListener('pointerleave', (e)=>{ e.preventDefault(); keys.delete(code); });
    }

    // Fire: repeat while held
    let fireHold = false; let fireTimer = null;
    function startFire(){ if (fireHold) return; fireHold = true; tryShoot(); fireTimer = setInterval(()=>tryShoot(), 180); }
    function stopFire(){ fireHold = false; if (fireTimer){ clearInterval(fireTimer); fireTimer=null; } }
    if (btnFire) {
      btnFire.addEventListener('pointerdown', (e)=>{ e.preventDefault(); startFire(); });
      btnFire.addEventListener('pointerup', (e)=>{ e.preventDefault(); stopFire(); });
      btnFire.addEventListener('pointercancel', (e)=>{ e.preventDefault(); stopFire(); });
      btnFire.addEventListener('pointerleave', (e)=>{ e.preventDefault(); stopFire(); });
    }

    bindTapButton(btnInteract, 'e');
    bindTapButton(btnContext, 'l');
    // Menu: toggle directly for mobile
    if (btnMenu) {
      btnMenu.addEventListener('pointerdown', (e)=>{
        e.preventDefault();
        menuOpen = !menuOpen;
        if (menuOpen) { menu.classList.remove('hidden'); renderMenu(); }
        else { menu.classList.add('hidden'); }
      });
    }
  }

  function length(x, y) { return Math.hypot(x, y); }

  function drawShip(ctx, x, y, angle) {
    ctx.save();
    ctx.translate(x, y);
    ctx.rotate(angle);
    ctx.beginPath();
    ctx.moveTo(14, 0);
    ctx.lineTo(-10, 8);
    ctx.lineTo(-6, 0);
    ctx.lineTo(-10, -8);
    ctx.closePath();
    const col = shipColors.find(c => c.id === shipColorId) || shipColors[0];
    ctx.fillStyle = col.fill;
    ctx.strokeStyle = col.stroke;
    ctx.lineWidth = 1.5;
    ctx.fill();
    ctx.stroke();

    // Panel lines
    ctx.strokeStyle = 'rgba(255,255,255,0.25)';
    ctx.lineWidth = 0.8;
    ctx.beginPath();
    ctx.moveTo(-3, -6);
    ctx.lineTo(-3, 6);
    ctx.moveTo(4, -4);
    ctx.lineTo(-6, -2);
    ctx.moveTo(4, 4);
    ctx.lineTo(-6, 2);
    ctx.stroke();

    // Cockpit canopy
    ctx.beginPath();
    ctx.moveTo(6, -4);
    ctx.quadraticCurveTo(11, 0, 6, 4);
    ctx.lineTo(0, 3);
    ctx.lineTo(0, -3);
    ctx.closePath();
    ctx.fillStyle = 'rgba(30,60,110,0.9)';
    ctx.strokeStyle = 'rgba(170,210,255,0.6)';
    ctx.lineWidth = 1;
    ctx.fill();
    ctx.stroke();

    // Flame when thrusting
    if (keys.has('w') || keys.has('arrowup')) {
      ctx.beginPath();
      ctx.moveTo(-10, 6);
      ctx.lineTo(-18 - Math.random() * 8, 0);
      ctx.lineTo(-10, -6);
      ctx.fillStyle = '#ffb75e';
      ctx.fill();
    }

    ctx.restore();
  }

  function drawShieldAura(ctx) {
    if (shield <= 0) return;
    ctx.save();
    ctx.translate(ship.x, ship.y);
    const pulse = 1 + Math.sin(timeSeconds * 4 + shieldHitTimer * 10) * 0.05;
    const outer = ship.r * 1.6 * pulse + 4;
    const grad = ctx.createRadialGradient(0, 0, ship.r * 0.8, 0, 0, outer + 6);
    grad.addColorStop(0, 'rgba(120,200,255,0.25)');
    grad.addColorStop(1, 'rgba(120,200,255,0)');
    ctx.fillStyle = grad;
    ctx.beginPath();
    ctx.arc(0, 0, outer + 6, 0, Math.PI * 2);
    ctx.fill();
    ctx.strokeStyle = shieldHitTimer > 0 ? 'rgba(255,150,100,0.9)' : 'rgba(120,200,255,0.65)';
    ctx.lineWidth = 2.2;
    ctx.beginPath();
    ctx.arc(0, 0, outer, 0, Math.PI * 2);
    ctx.stroke();
    ctx.restore();
  }

  function createDrone(planetIndex) {
    const p = planets[planetIndex];
    const ang = rand() * Math.PI * 2;
    const orbit = p.r + 130 + rand() * 160;
    return {
      planetIndex,
      orbit,
      x: p.x + Math.cos(ang) * orbit,
      y: p.y + Math.sin(ang) * orbit,
      vx: 0,
      vy: 0,
      r: Math.max(14, Math.min(18, p.r * 0.08 + 12)),
      fireCooldown: 1 + rand() * 1.6,
      health: 3,
      hitTimer: 0,
      sparkle: rand() * Math.PI * 2,
    };
  }

  function drawDrone(ctx, drone) {
    ctx.save();
    ctx.translate(drone.x, drone.y);
    ctx.rotate(Math.atan2(drone.vy, drone.vx));
    const flicker = 1 + Math.sin(timeSeconds * 5 + drone.sparkle) * 0.05;
    ctx.scale(flicker, flicker);
    const baseFill = drone.hitTimer > 0 ? 'rgba(255,150,120,0.85)' : '#1c2f57';
    ctx.fillStyle = baseFill;
    ctx.strokeStyle = 'rgba(120,170,255,0.8)';
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.arc(0, 0, drone.r * 0.55, 0, Math.PI * 2);
    ctx.fill();
    ctx.stroke();
    // Inner core
    const core = ctx.createRadialGradient(0, 0, 0, 0, 0, drone.r * 0.5);
    core.addColorStop(0, 'rgba(180,220,255,0.8)');
    core.addColorStop(1, 'rgba(120,180,255,0)');
    ctx.fillStyle = core;
    ctx.beginPath();
    ctx.arc(0, 0, drone.r * 0.7, 0, Math.PI * 2);
    ctx.fill();
    ctx.strokeStyle = 'rgba(70,120,255,0.7)';
    ctx.lineWidth = 1.4;
    for (let i = 0; i < 3; i++) {
      const ang = (i / 3) * Math.PI * 2 + timeSeconds * 1.4;
      ctx.beginPath();
      ctx.moveTo(Math.cos(ang) * drone.r * 0.2, Math.sin(ang) * drone.r * 0.2);
      ctx.lineTo(Math.cos(ang) * drone.r, Math.sin(ang) * drone.r);
      ctx.stroke();
    }
    ctx.restore();
  }

  function drawEnemyShot(ctx, shot) {
    ctx.save();
    ctx.translate(shot.x, shot.y);
    const angle = Math.atan2(shot.vy, shot.vx);
    ctx.rotate(angle);
    const len = 8 + Math.sin(timeSeconds * 10 + shot.pulse) * 2;
    const grad = ctx.createLinearGradient(-len * 0.5, 0, len * 0.6, 0);
    grad.addColorStop(0, 'rgba(255,120,150,0)');
    grad.addColorStop(1, 'rgba(255,160,200,0.9)');
    ctx.fillStyle = grad;
    ctx.beginPath();
    ctx.moveTo(-len * 0.5, -2.2);
    ctx.lineTo(len * 0.6, 0);
    ctx.lineTo(-len * 0.5, 2.2);
    ctx.closePath();
    ctx.fill();
    ctx.restore();
  }

  function drawTrailPoint(ctx, trail) {
    const life = Math.max(0, trail.life) / trail.maxLife;
    if (life <= 0) return;
    ctx.save();
    ctx.translate(trail.x, trail.y);
    ctx.rotate(trail.angle);
    ctx.globalAlpha = life * 0.8;
    const grad = ctx.createLinearGradient(-20, 0, 12, 0);
    grad.addColorStop(0, 'rgba(30,40,80,0)');
    grad.addColorStop(0.45, 'rgba(255,140,60,0.6)');
    grad.addColorStop(1, 'rgba(255,220,170,0)');
    ctx.fillStyle = grad;
    ctx.beginPath();
    ctx.moveTo(-20, -4);
    ctx.lineTo(12, -1.5);
    ctx.lineTo(12, 1.5);
    ctx.lineTo(-20, 4);
    ctx.closePath();
    ctx.fill();
    ctx.restore();
  }

  function drawAsteroid(ctx, a) {
    ctx.save();
    ctx.translate(a.x, a.y);
    ctx.rotate(Math.atan2(a.vy, a.vx));
    const grad = ctx.createRadialGradient(-a.r * 0.3, -a.r * 0.3, a.r * 0.4, 0, 0, a.r * 1.1);
    grad.addColorStop(0, '#c7ccd5');
    grad.addColorStop(1, '#4a4f5c');
    ctx.fillStyle = grad;
    ctx.beginPath();
    ctx.moveTo(-a.r * 0.8, -a.r * 0.4);
    ctx.bezierCurveTo(a.r * 0.9, -a.r, a.r * 0.9, a.r, -a.r * 0.6, a.r * 0.6);
    ctx.closePath();
    ctx.fill();
    ctx.fillStyle = a.mineral.color + 'cc';
    ctx.beginPath();
    ctx.arc(a.r * 0.25, -a.r * 0.25, a.r * 0.35, 0, Math.PI * 2);
    ctx.fill();
    ctx.restore();
  }

  function drawLootItem(ctx, l) {
    const glowRadius = l.r * (l.type === 'artifact' ? 3.2 : 2.4);
    const glow = ctx.createRadialGradient(l.x, l.y, 0, l.x, l.y, glowRadius);
    glow.addColorStop(0, l.color + '55');
    glow.addColorStop(1, 'transparent');
    ctx.fillStyle = glow;
    ctx.beginPath();
    ctx.arc(l.x, l.y, glowRadius, 0, Math.PI * 2);
    ctx.fill();

    ctx.save();
    ctx.translate(l.x, l.y);
    ctx.rotate(Math.sin(l.wobble) * 0.4);
    if (l.type === 'artifact') {
      ctx.fillStyle = l.color + 'aa';
      ctx.strokeStyle = '#ffffffaa';
      ctx.lineWidth = 1.4;
      ctx.beginPath();
      ctx.moveTo(0, -l.r);
      ctx.lineTo(l.r, 0);
      ctx.lineTo(0, l.r);
      ctx.lineTo(-l.r, 0);
      ctx.closePath();
      ctx.fill();
      ctx.stroke();
    } else {
      ctx.fillStyle = l.color + 'dd';
      ctx.beginPath();
      ctx.arc(0, 0, l.r, 0, Math.PI * 2);
      ctx.fill();
      ctx.strokeStyle = '#ffffff88';
      ctx.lineWidth = 1;
      ctx.stroke();
    }
    ctx.restore();
  }

  // --- Minimap & Overheat overlays (screen-space) ---
  function drawMinimapOverlay() {
    const w = 180, h = 140, pad = 12;
    const x0 = canvas.clientWidth - w - pad;
    const y0 = pad;
    const b = { minX: Infinity, minY: Infinity, maxX: -Infinity, maxY: -Infinity };
    for (const p of planets) { b.minX = Math.min(b.minX, p.x - p.r); b.maxX = Math.max(b.maxX, p.x + p.r); b.minY = Math.min(b.minY, p.y - p.r); b.maxY = Math.max(b.maxY, p.y + p.r); }
    b.minX = Math.min(b.minX, ship.x - 200); b.maxX = Math.max(b.maxX, ship.x + 200);
    b.minY = Math.min(b.minY, ship.y - 200); b.maxY = Math.max(b.maxY, ship.y + 200);
    const sx = w / (b.maxX - b.minX + 1e-3);
    const sy = h / (b.maxY - b.minY + 1e-3);
    // Panel
    ctx.fillStyle = 'rgba(0,0,0,0.45)';
    ctx.strokeStyle = 'rgba(255,255,255,0.15)';
    ctx.lineWidth = 1;
    ctx.beginPath(); ctx.roundRect(x0, y0, w, h, 8); ctx.fill(); ctx.stroke();
    // Planets
    for (const p of planets) {
      const px = x0 + (p.x - b.minX) * sx;
      const py = y0 + (p.y - b.minY) * sy;
      const pr = Math.max(2, p.r * Math.min(sx, sy) * 0.06);
      ctx.fillStyle = 'rgba(180,200,255,0.7)';
      ctx.beginPath(); ctx.arc(px, py, pr, 0, Math.PI * 2); ctx.fill();
    }
    // Ship
    const sxp = x0 + (ship.x - b.minX) * sx;
    const syp = y0 + (ship.y - b.minY) * sy;
    ctx.fillStyle = '#6cf';
    ctx.beginPath(); ctx.arc(sxp, syp, 3, 0, Math.PI * 2); ctx.fill();

    ctx.fillStyle = '#ff8fa9';
    for (const d of drones) {
      const dx = x0 + (d.x - b.minX) * sx;
      const dy = y0 + (d.y - b.minY) * sy;
      ctx.beginPath(); ctx.arc(dx, dy, 2, 0, Math.PI * 2); ctx.fill();
    }
  }

  function drawOverheatOverlay() {
    const w = 180, h = 10, pad = 12;
    const x0 = canvas.clientWidth - w - pad;
    const y0 = pad + 140 + 8; // under minimap
    ctx.fillStyle = 'rgba(0,0,0,0.45)';
    ctx.beginPath(); ctx.roundRect(x0, y0, w, h, 6); ctx.fill();
    const pct = Math.max(0, Math.min(1, heat));
    const inner = Math.max(2, (w - 2) * pct);
    ctx.fillStyle = pct < 0.8 ? '#6cf' : pct < 1 ? '#f9b44e' : '#e76e6e';
    ctx.beginPath(); ctx.roundRect(x0+1, y0+1, inner, h-2, 5); ctx.fill();
    ctx.fillStyle = 'rgba(255,255,255,0.55)';
    ctx.font = '10px ui-monospace, monospace';
    ctx.textAlign = 'left';
    ctx.textBaseline = 'bottom';
    ctx.fillText('Isı', x0, y0 - 2);
  }

  function drawShieldOverlay() {
    const w = 180, h = 10, pad = 12;
    const x0 = canvas.clientWidth - w - pad;
    const y0 = pad + 140 + 8 + 18;
    ctx.fillStyle = 'rgba(0,0,0,0.45)';
    ctx.beginPath(); ctx.roundRect(x0, y0, w, h, 6); ctx.fill();
    const pct = Math.max(0, Math.min(1, shield));
    const inner = Math.max(2, (w - 2) * pct);
    ctx.fillStyle = pct > 0.6 ? '#6cf' : pct > 0.3 ? '#f4d175' : '#f3866f';
    ctx.beginPath(); ctx.roundRect(x0 + 1, y0 + 1, inner, h - 2, 5); ctx.fill();
    ctx.fillStyle = 'rgba(255,255,255,0.65)';
    ctx.font = '10px ui-monospace, monospace';
    ctx.textAlign = 'left';
    ctx.textBaseline = 'bottom';
    ctx.fillText('Kalkan', x0, y0 - 2);
  }

  // --- Shooting, asteroids, loot, inventory helpers ---
  function rayCircleHit(ox, oy, dx, dy, cx, cy, r) {
    const lx = cx - ox, ly = cy - oy;
    const t = (lx*dx + ly*dy);
    if (t < 0) return Infinity;
    const px = ox + dx * t;
    const py = oy + dy * t;
    const d2 = (px - cx)**2 + (py - cy)**2;
    return d2 <= r*r ? t : Infinity;
  }

  function tryShoot() {
    if (heat >= 1) return; // overheated
    heat = Math.min(1, heat + heatPerShot);
    beamFlash = 0.08;
    const dx = Math.cos(ship.angle), dy = Math.sin(ship.angle);
    const destroyed = [];
    const droneHits = [];
    for (let i = 0; i < asteroids.length; i++) {
      const a = asteroids[i];
      const t = rayCircleHit(ship.x, ship.y, dx, dy, a.x, a.y, a.r);
      if (isFinite(t)) destroyed.push(i);
    }
    for (let i = 0; i < drones.length; i++) {
      const d = drones[i];
      const t = rayCircleHit(ship.x, ship.y, dx, dy, d.x, d.y, d.r * 0.75);
      if (isFinite(t)) droneHits.push({ index: i, t });
    }
    if (destroyed.length) {
      destroyed.sort((a,b)=>b-a);
      for (const idx of destroyed) {
        const a = asteroids[idx];
        spawnLoot(a.x, a.y, { type: 'ore', id: a.mineral.id, qty: 1, color: a.mineral.color, name: a.mineral.name });
        asteroids.splice(idx,1);
      }
    }
    if (droneHits.length) {
      droneHits.sort((a, b) => a.t - b.t);
      const removed = [];
      for (const hit of droneHits) {
        const drone = drones[hit.index];
        if (!drone) continue;
        drone.health -= 1;
        drone.hitTimer = 0.3;
        if (drone.health <= 0 && !removed.includes(hit.index)) removed.push(hit.index);
      }
      if (removed.length) {
        removed.sort((a,b)=>b-a);
        for (const idx of removed) {
          const drone = drones[idx];
          if (!drone) continue;
          const reward = artifacts[Math.floor(Math.random() * artifacts.length)];
          spawnLoot(drone.x, drone.y, { type: 'artifact', id: reward.id, qty: 1, color: reward.color, name: reward.name });
          drones.splice(idx, 1);
          cameraShake = Math.min(1.2, cameraShake + 0.3);
        }
      }
    }
  }

  function spawnLoot(x, y, payload) {
    const qty = payload.qty || 1;
    let color = payload.color;
    let name = payload.name;
    let radius = payload.type === 'artifact' ? 8 : 6;
    if (payload.type === 'ore') {
      const mineral = minerals.find((m) => m.id === payload.id) || minerals[0];
      color = color || mineral.color;
      name = name || mineral.name;
    }
    loot.push({
      x,
      y,
      r: radius,
      type: payload.type,
      id: payload.id,
      qty,
      color: color || '#9fa9ff',
      name: name || payload.id,
      toShip: false,
      vx: (Math.random() - 0.5) * 14,
      vy: (Math.random() - 0.5) * 14,
      wobble: Math.random() * Math.PI * 2,
    });
  }

  function dropRandomCargo() {
    const oreSlots = [];
    for (let i = 0; i < inventory.length; i++) {
      const it = inventory[i];
      if (it && it.type === 'ore' && it.qty > 0) oreSlots.push({ index: i, item: it });
    }
    if (!oreSlots.length) return false;
    const pick = oreSlots[Math.floor(Math.random() * oreSlots.length)];
    const mineral = minerals.find((m) => m.id === pick.item.id) || minerals[0];
    pick.item.qty -= 1;
    spawnLoot(
      ship.x + (Math.random() - 0.5) * 40,
      ship.y + (Math.random() - 0.5) * 40,
      { type: 'ore', id: pick.item.id, qty: 1, color: mineral.color, name: mineral.name }
    );
    if (pick.item.qty <= 0) inventory[pick.index] = null;
    return true;
  }

  function applyShipDamage(amount, impulseX = 0, impulseY = 0) {
    const prevShield = shield;
    shield = Math.max(0, shield - amount);
    shieldHitTimer = 0.4;
    shieldCooldown = shieldRechargeDelay;
    cameraShake = Math.min(1.4, cameraShake + amount * 1.3);
    ship.vx += impulseX;
    ship.vy += impulseY;
    if (shield <= 0 && cargoDropTimer <= 0) {
      if (dropRandomCargo()) {
        cargoDropTimer = 1.8;
        renderMenuIfOpen();
      }
    }
    if (shield <= 0 && prevShield > 0) cargoDropTimer = 0; // immediate drop once depleted
  }

  let asteroidSpawnTimer = 0;
  function spawnAsteroids(dt) {
    asteroidSpawnTimer -= dt;
    if (asteroidSpawnTimer <= 0 && asteroids.length < 28) {
      asteroidSpawnTimer = 1.6 + Math.random() * 1.6;
      const ang = Math.random() * Math.PI * 2;
      const dist = 800 + Math.random() * 1200;
      const x = ship.x + Math.cos(ang) * dist;
      const y = ship.y + Math.sin(ang) * dist;
      const r = 10 + Math.random() * 24;
      const dir = Math.random() * Math.PI * 2;
      const speed = 10 + Math.random() * 24; // slow
      const vx = Math.cos(dir) * speed;
      const vy = Math.sin(dir) * speed;
      const mineral = minerals[Math.floor(Math.random() * minerals.length)];
      asteroids.push({ x, y, vx, vy, r, life: 60, mineral });
    }
  }

  function addToInventory(item) {
    if (!item) return false;
    const qty = item.qty || 1;
    if (item.type === 'ore') {
      for (let i = 0; i < inventory.length; i++) {
        const it = inventory[i];
        if (it && it.type === 'ore' && it.id === item.id) {
          it.qty += qty;
          return true;
        }
      }
    }
    for (let i = 0; i < inventory.length; i++) {
      if (!inventory[i]) {
        inventory[i] = { ...item, qty };
        return true;
      }
    }
    return false;
  }

  function updateDrones(dt) {
    for (let i = drones.length - 1; i >= 0; i--) {
      const drone = drones[i];
      const planet = planets[drone.planetIndex];
      if (!planet) continue;
      const dxp = drone.x - planet.x;
      const dyp = drone.y - planet.y;
      const distPlanet = Math.hypot(dxp, dyp) || 1;
      const radialX = dxp / distPlanet;
      const radialY = dyp / distPlanet;
      const tangentX = -radialY;
      const tangentY = radialX;

      const toShipX = ship.x - drone.x;
      const toShipY = ship.y - drone.y;
      const distShip = Math.hypot(toShipX, toShipY) || 1;

      let targetVX;
      let targetVY;
      if (distShip < 520) {
        const chaseSpeed = distShip < 180 ? 150 : 100;
        targetVX = (toShipX / distShip) * chaseSpeed;
        targetVY = (toShipY / distShip) * chaseSpeed;
      } else {
        const orbitError = (drone.orbit - distPlanet);
        targetVX = tangentX * (90 + planet.r * 0.03) + radialX * orbitError * 0.6;
        targetVY = tangentY * (90 + planet.r * 0.03) + radialY * orbitError * 0.6;
      }

      drone.vx += (targetVX - drone.vx) * Math.min(1, dt * 2.5);
      drone.vy += (targetVY - drone.vy) * Math.min(1, dt * 2.5);

      const sp = Math.hypot(drone.vx, drone.vy);
      const maxSpeed = 180;
      if (sp > maxSpeed) {
        drone.vx = (drone.vx / sp) * maxSpeed;
        drone.vy = (drone.vy / sp) * maxSpeed;
      }

      drone.x += drone.vx * dt;
      drone.y += drone.vy * dt;
      drone.fireCooldown -= dt;
      drone.hitTimer = Math.max(0, drone.hitTimer - dt);

      if (distShip < 420 && drone.fireCooldown <= 0) {
        const dir = Math.atan2(toShipY, toShipX);
        const speed = 220 + Math.random() * 60;
        enemyShots.push({
          x: drone.x + Math.cos(dir) * drone.r,
          y: drone.y + Math.sin(dir) * drone.r,
          vx: Math.cos(dir) * speed,
          vy: Math.sin(dir) * speed,
          life: 3,
          pulse: Math.random() * Math.PI * 2,
        });
        drone.fireCooldown = 1.4 + Math.random() * 1.4;
      }
    }
  }

  function updateEnemyShots(dt) {
    for (let i = enemyShots.length - 1; i >= 0; i--) {
      const shot = enemyShots[i];
      shot.x += shot.vx * dt;
      shot.y += shot.vy * dt;
      shot.life -= dt;
      shot.pulse += dt;
      const dx = shot.x - ship.x;
      const dy = shot.y - ship.y;
      const dist = Math.hypot(dx, dy);
      if (dist < ship.r + 6) {
        const inv = dist || 1;
        applyShipDamage(0.22, (dx / inv) * 30, (dy / inv) * 30);
        shot.life = 0;
      }
      if (shot.life <= 0) {
        enemyShots.splice(i, 1);
      }
    }
  }

  function drawPlanet(ctx, p) {
    // Glow
    ctx.save();
    const grad = ctx.createRadialGradient(p.x, p.y, p.r * 0.6, p.x, p.y, p.r * 1.8);
    grad.addColorStop(0, 'transparent');
    grad.addColorStop(1, p.glow);
    ctx.fillStyle = grad;
    ctx.beginPath();
    ctx.arc(p.x, p.y, p.r * 1.8, 0, Math.PI * 2);
    ctx.fill();
    ctx.restore();

    // Rings
    if (p.ring) {
      ctx.save();
      ctx.translate(p.x, p.y);
      ctx.rotate(p.ringTilt);
      const squash = 0.55 + p.ringScale;
      const outer = p.r * (1.7 + p.ringScale);
      const inner = p.r * (1.05 + p.ringScale * 0.45);
      const ringGrad = ctx.createRadialGradient(0, 0, inner, 0, 0, outer);
      ringGrad.addColorStop(0, 'rgba(255,255,255,0)');
      ringGrad.addColorStop(0.45, p.ringColor);
      ringGrad.addColorStop(1, 'rgba(255,255,255,0)');
      ctx.fillStyle = ringGrad;
      ctx.globalCompositeOperation = 'lighter';
      ctx.beginPath();
      ctx.ellipse(0, 0, outer, outer * squash, 0, 0, Math.PI * 2);
      ctx.ellipse(0, 0, inner, inner * squash, 0, Math.PI * 2, true);
      ctx.fill('evenodd');
      ctx.globalCompositeOperation = 'source-over';
      ctx.restore();
    }

    // Body
    const bodyGrad = ctx.createRadialGradient(p.x - p.r * 0.3, p.y - p.r * 0.3, p.r * 0.2, p.x, p.y, p.r);
    bodyGrad.addColorStop(0, `hsl(${p.hue} 72% 70%)`);
    bodyGrad.addColorStop(0.6, p.color);
    bodyGrad.addColorStop(1, `hsl(${p.hue} 70% 28%)`);
    ctx.beginPath();
    ctx.arc(p.x, p.y, p.r, 0, Math.PI * 2);
    ctx.fillStyle = bodyGrad;
    ctx.fill();

    // Atmospheric bands
    ctx.save();
    ctx.globalAlpha = 0.22;
    ctx.strokeStyle = `hsl(${(p.hue + 24) % 360} 80% 60%)`;
    ctx.lineWidth = p.r * 0.18;
    ctx.beginPath();
    ctx.arc(p.x, p.y + p.r * 0.15, p.r * 0.92, Math.PI * 0.15, Math.PI * 1.2);
    ctx.stroke();
    ctx.strokeStyle = `hsl(${(p.hue + 320) % 360} 80% 65%)`;
    ctx.lineWidth = p.r * 0.12;
    ctx.beginPath();
    ctx.arc(p.x, p.y - p.r * 0.1, p.r * 0.75, Math.PI * 0.7, Math.PI * 1.8);
    ctx.stroke();
    ctx.restore();

    // Highlight
    ctx.save();
    const highlight = ctx.createRadialGradient(p.x - p.r * 0.55, p.y - p.r * 0.55, p.r * 0.1, p.x - p.r * 0.55, p.y - p.r * 0.55, p.r * 0.7);
    highlight.addColorStop(0, 'rgba(255,255,255,0.45)');
    highlight.addColorStop(1, 'rgba(255,255,255,0)');
    ctx.fillStyle = highlight;
    ctx.beginPath();
    ctx.arc(p.x, p.y, p.r, 0, Math.PI * 2);
    ctx.fill();
    ctx.restore();

    // Name
    ctx.fillStyle = 'rgba(255,255,255,0.8)';
    ctx.font = '12px ui-monospace, monospace';
    ctx.textAlign = 'center';
    ctx.fillText(p.name, p.x, p.y - p.r - 8);
  }

  // Astronaut drawing (top-down, round suit with visor)
  function drawAstronaut(ctx, wx, wy) {
    ctx.save();
    ctx.translate(wx, wy);
    // Suit
    const sc = suitColors.find(c => c.id === suitColorId) || suitColors[0];
    ctx.fillStyle = sc.fill;
    ctx.strokeStyle = '#9cc9ff';
    ctx.lineWidth = 1.5;
    ctx.beginPath();
    ctx.arc(0, 0, astro.r, 0, Math.PI * 2);
    ctx.fill();
    ctx.stroke();
    // Visor
    ctx.beginPath();
    ctx.arc(0, -1, astro.r * 0.55, Math.PI * 0.15, Math.PI * 0.85);
    ctx.strokeStyle = '#253a57';
    ctx.lineWidth = 2;
    ctx.stroke();
    // Backpack hint
    ctx.beginPath();
    ctx.arc(-astro.r * 0.7, 0, 2, 0, Math.PI * 2);
    ctx.fillStyle = '#bccde6';
    ctx.fill();
    ctx.restore();
  }

  function worldToScreen(x, y) {
    return [
      (x - camera.x) * camera.zoom + canvas.clientWidth / 2,
      (y - camera.y) * camera.zoom + canvas.clientHeight / 2,
    ];
  }

  function applyCamera() {
    const shakeX = Math.sin(timeSeconds * 36) * cameraShake * 6;
    const shakeY = Math.cos(timeSeconds * 32) * cameraShake * 6;
    ctx.setTransform(
      camera.zoom,
      0,
      0,
      camera.zoom,
      canvas.clientWidth / 2 + shakeX,
      canvas.clientHeight / 2 + shakeY
    );
    ctx.translate(-camera.x, -camera.y);
  }

  function resetTransform() {
    const dpr = Math.max(1, Math.min(2, window.devicePixelRatio || 1));
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  }

  // Surface generation per-planet
  function seeded(i) {
    // derive seed per planet index
    return mulberry32(1000 + i * 101);
  }

  function ensureSurface(i) {
    if (surfaces[i]) return surfaces[i];
    const p = planets[i];
    const r = seeded(i);
    const habitats = ['forest', 'rocky', 'icy', 'desert', 'volcanic', 'swamp', 'crystal'];
    const habitat = habitats[Math.floor(r() * habitats.length)];
    const props = [];
    const margin = 22;
    const limit = p.r - margin;
    const count = Math.max(6, Math.min(28, Math.floor(p.r / 6))); // yarıya düşürüldü

    function place(type, rad) {
      let attempts = 0;
      while (attempts++ < 80 && props.length < count) {
        const ang = r() * Math.PI * 2;
        const rr = Math.sqrt(r()) * limit; // bias outward a bit
        const x = Math.cos(ang) * rr;
        const y = Math.sin(ang) * rr;
        // avoid center crowding slightly
        if (Math.hypot(x, y) < 16) continue;
        // overlap check
        let ok = true;
        for (const pr of props) {
          if (Math.hypot(x - pr.x, y - pr.y) < rad + pr.r + 6) { ok = false; break; }
        }
        if (!ok) continue;
        // Precompute static polygon points for stability
        let points = null;
        if (type === 'rock' || type === 'duneRock' || type === 'iceRock') {
          const sides = 5;
          points = [];
          for (let ii = 0; ii < sides; ii++) {
            const a = (ii / sides) * Math.PI * 2 + r() * 0.5;
            const rr2 = rad * (0.85 + r() * 0.2);
            points.push({ x: Math.cos(a) * rr2, y: Math.sin(a) * rr2 });
          }
        }
        props.push({ type, x, y, r: rad, points });
        return true;
      }
      return false;
    }

    for (let k = 0; k < count; k++) {
      if (habitat === 'forest') {
        place('tree', 6 + r() * 5);
      } else if (habitat === 'rocky') {
        place('rock', 5 + r() * 7);
      } else if (habitat === 'icy') {
        place(r() < 0.7 ? 'iceRock' : 'iceShard', 5 + r() * 6);
      } else if (habitat === 'desert') {
        place(r() < 0.8 ? 'duneRock' : 'dryBush', 4 + r() * 5);
      } else if (habitat === 'volcanic') {
        place(r() < 0.7 ? 'basalt' : 'lavaVent', 5 + r() * 6);
      } else if (habitat === 'swamp') {
        place(r() < 0.7 ? 'reed' : 'mudRock', 4 + r() * 5);
      } else if (habitat === 'crystal') {
        place('crystal', 6 + r() * 7);
      }
    }

    const palette = {
      forest: { from: '#0b2b20', to: '#10382b' },
      rocky: { from: '#2b2622', to: '#3a332e' },
      icy: { from: '#0b1f35', to: '#0f2a46' },
      desert: { from: '#3a2c14', to: '#5a3f1b' },
      volcanic: { from: '#2b0f0f', to: '#3a1717' },
      swamp: { from: '#182b1a', to: '#213a22' },
      crystal: { from: '#1a1535', to: '#261f50' },
    };
    const ground = palette[habitat];

    // Spawn color collectibles (0-2)
    const collectibleColors = ['navy','yellow','pink','blue'];
    const collectibles = [];
    const numCol = Math.floor(r() * 3); // 0..2
    for (let c = 0; c < numCol; c++) {
      const ang = r() * Math.PI * 2;
      const rr = Math.sqrt(r()) * (limit - 10);
      const x = Math.cos(ang) * rr;
      const y = Math.sin(ang) * rr;
      const which = collectibleColors[Math.floor(r() * collectibleColors.length)];
      const target = r() < 0.5 ? 'ship' : 'suit';
      collectibles.push({ type: 'color', target, color: which, x, y, r: 7, collected: false });
    }

    return (surfaces[i] = { habitat, props, ground, collectibles });
  }

  function drawProp(ctx, wx, wy, prop, habitat) {
    ctx.save();
    ctx.translate(wx, wy);
    if (prop.type === 'tree') {
      // Trunk
      ctx.strokeStyle = '#5b3a22';
      ctx.lineWidth = 3;
      ctx.beginPath();
      ctx.moveTo(0, prop.r);
      ctx.lineTo(0, prop.r * 0.2);
      ctx.stroke();
      // Canopy
      ctx.fillStyle = '#2e7d32';
      ctx.beginPath();
      ctx.arc(0, 0, prop.r, 0, Math.PI * 2);
      ctx.fill();
    } else if (prop.type === 'rock' || prop.type === 'duneRock') {
      ctx.fillStyle = prop.type === 'rock' ? '#9aa3ad' : '#ba9d6b';
      polygonPoints(prop.points);
    } else if (prop.type === 'dryBush') {
      ctx.strokeStyle = '#c7a96a';
      ctx.lineWidth = 1.5;
      for (let i = 0; i < 6; i++) {
        const ang = (Math.PI * 2 * i) / 6;
        ctx.beginPath();
        ctx.moveTo(0, 0);
        ctx.lineTo(Math.cos(ang) * prop.r, Math.sin(ang) * prop.r);
        ctx.stroke();
      }
    } else if (prop.type === 'iceRock') {
      ctx.fillStyle = '#b9e2ff';
      polygonPoints(prop.points);
    } else if (prop.type === 'iceShard') {
      ctx.fillStyle = '#cfeeff';
      ctx.beginPath();
      ctx.moveTo(0, -prop.r);
      ctx.lineTo(prop.r * 0.5, prop.r * 0.6);
      ctx.lineTo(-prop.r * 0.5, prop.r * 0.6);
      ctx.closePath();
      ctx.fill();
    } else if (prop.type === 'basalt' || prop.type === 'mudRock') {
      ctx.fillStyle = prop.type === 'basalt' ? '#3d3a3a' : '#5a4f44';
      polygonPoints(prop.points);
    } else if (prop.type === 'lavaVent') {
      ctx.fillStyle = '#bf3b2b';
      ctx.beginPath();
      ctx.ellipse(0, 0, prop.r * 0.7, prop.r * 0.5, 0, 0, Math.PI * 2);
      ctx.fill();
      ctx.fillStyle = 'rgba(255,120,80,0.5)';
      ctx.beginPath();
      ctx.arc(0, 0, prop.r * 0.9, 0, Math.PI * 2);
      ctx.fill();
    } else if (prop.type === 'reed') {
      ctx.strokeStyle = '#6ea06e';
      ctx.lineWidth = 2;
      for (let i = -1; i <= 1; i++) {
        ctx.beginPath();
        ctx.moveTo(i * 2, prop.r);
        ctx.quadraticCurveTo(i * 3, 0, i, -prop.r);
        ctx.stroke();
      }
    } else if (prop.type === 'crystal') {
      ctx.fillStyle = '#8cc7ff';
      ctx.beginPath();
      ctx.moveTo(0, -prop.r);
      ctx.lineTo(prop.r * 0.6, 0);
      ctx.lineTo(0, prop.r);
      ctx.lineTo(-prop.r * 0.6, 0);
      ctx.closePath();
      ctx.fill();
    }
    ctx.restore();

    function polygonPoints(points) {
      if (!points || points.length === 0) return;
      ctx.beginPath();
      points.forEach((pt, idx) => {
        if (idx === 0) ctx.moveTo(pt.x, pt.y); else ctx.lineTo(pt.x, pt.y);
      });
      ctx.closePath();
      ctx.fill();
    }
  }

  // Physics + gameplay
  let last = performance.now();
  let beamFlash = 0; // seconds

  function step(now) {
    const rawDt = Math.min(50, now - last);
    const dt = rawDt / 1000;
    last = now;
    timeSeconds = now / 1000;
    shieldCooldown = Math.max(0, shieldCooldown - dt);
    cargoDropTimer = Math.max(0, cargoDropTimer - dt);
    shieldHitTimer = Math.max(0, shieldHitTimer - dt);
    if (shieldCooldown <= 0 && shield < 1) {
      shield = Math.min(1, shield + shieldRechargeRate * dt);
    }
    cameraShake = Math.max(0, cameraShake - dt * 1.8);
    beamFlash = Math.max(0, beamFlash - dt);
    heat = Math.max(0, heat - heatCoolRate * dt);
    if (menuOpen) {
      for (let i = trailPoints.length - 1; i >= 0; i--) {
        trailPoints[i].life -= dt;
        if (trailPoints[i].life <= 0) trailPoints.splice(i, 1);
      }
    }

    // Clear background (space gradient)
    resetTransform();
    const bg = ctx.createLinearGradient(0, 0, 0, canvas.clientHeight);
    bg.addColorStop(0, '#05070f');
    bg.addColorStop(1, '#070a16');
    ctx.fillStyle = bg;
    ctx.fillRect(0, 0, canvas.clientWidth, canvas.clientHeight);

    // Update + draw based on state
    if (menuOpen) {
      if (state === STATE.SPACE) {
        drawSpace();
      } else {
        drawPlanetMode();
      }
    } else if (state === STATE.SPACE) {
      updateSpace(dt);
      drawSpace();
    } else {
      updatePlanet(dt);
      drawPlanetMode();
    }

    requestAnimationFrame(step);
  }

  function updateSpace(dt) {
    const thrust = (keys.has('w') || keys.has('arrowup')) ? 140 : 0;
    const turnLeft = keys.has('a') || keys.has('arrowleft');
    const turnRight = keys.has('d') || keys.has('arrowright');
    const braking = keys.has('s') || keys.has('arrowdown');

    if (turnLeft) ship.angle -= 2.6 * dt;
    if (turnRight) ship.angle += 2.6 * dt;

    if (thrust) {
      ship.vx += Math.cos(ship.angle) * thrust * dt;
      ship.vy += Math.sin(ship.angle) * thrust * dt;
    }

    if (braking) {
      const sp = length(ship.vx, ship.vy);
      if (sp > 0) {
        const decel = Math.min(60 * dt, sp);
        ship.vx -= (ship.vx / sp) * decel;
        ship.vy -= (ship.vy / sp) * decel;
      }
    }

    // Mild gravitational attraction near planets
    for (const p of planets) {
      const dx = p.x - ship.x;
      const dy = p.y - ship.y;
      const dist = Math.hypot(dx, dy);
      const influence = p.r * 6;
      if (dist < influence) {
        const g = (2500 * p.r) / (dist * dist + 2000);
        ship.vx += (dx / dist) * g * dt;
        ship.vy += (dy / dist) * g * dt;
      }
    }

    ship.x += ship.vx * dt;
    ship.y += ship.vy * dt;

    if (thrust) {
      trailTimer -= dt;
      if (trailTimer <= 0) {
        trailTimer = 0.045;
        trailPoints.push({
          x: ship.x - Math.cos(ship.angle) * (ship.r + 8),
          y: ship.y - Math.sin(ship.angle) * (ship.r + 8),
          angle: ship.angle + Math.PI,
          life: 0.52,
          maxLife: 0.52,
        });
      }
    } else {
      trailTimer = Math.max(0, trailTimer - dt * 0.6);
    }
    for (let i = trailPoints.length - 1; i >= 0; i--) {
      const t = trailPoints[i];
      t.life -= dt;
      if (t.life <= 0) trailPoints.splice(i, 1);
    }

    // Camera follows ship with slight easing
    const targetZoom = 1;
    camera.zoom += (targetZoom - camera.zoom) * 0.05;
    camera.x += (ship.x - camera.x) * 0.12;
    camera.y += (ship.y - camera.y) * 0.12;

    // Update asteroids
    spawnAsteroids(dt);
    for (const a of asteroids) {
      a.x += a.vx * dt;
      a.y += a.vy * dt;
      a.life -= dt;
    }
    // Remove expired asteroids
    for (let i = asteroids.length - 1; i >= 0; i--) {
      if (asteroids[i].life <= 0 || asteroids[i].gone) asteroids.splice(i, 1);
    }

    updateDrones(dt);
    updateEnemyShots(dt);

    // Update loot (attract to ship if flagged)
    for (const l of loot) {
      if (l.toShip) {
        const dx = ship.x - l.x; const dy = ship.y - l.y;
        const d = Math.hypot(dx, dy) || 1;
        const sp = 60 + (200 * (1 - Math.min(1, d/400)));
        l.vx = (dx / d) * sp; l.vy = (dy / d) * sp;
      }
      l.x += (l.vx || 0) * dt; l.y += (l.vy || 0) * dt;
      if (l.vx) l.vx *= 0.96;
      if (l.vy) l.vy *= 0.96;
      l.wobble += dt * 1.5;
    }
    // Pickup loot with E when near
    if (keys.has('e')) {
      let picked = false;
      for (const l of loot) {
        const d = Math.hypot(l.x - ship.x, l.y - ship.y);
        if (d < 24) {
          if (addToInventory({ type: l.type, id: l.id, qty: l.qty, name: l.name, color: l.color })) {
            l.gone = true;
            picked = true;
          }
        } else if (d < 160) {
          l.toShip = true;
        }
      }
      if (picked) { keys.delete('e'); renderMenuIfOpen(); }
    }
    for (let i = loot.length - 1; i >= 0; i--) if (loot[i].gone) loot.splice(i,1);

    // Collisions
    for (const a of asteroids) {
      const dx = a.x - ship.x;
      const dy = a.y - ship.y;
      const dist = Math.hypot(dx, dy);
      if (dist < a.r + ship.r * 0.7) {
        const inv = dist || 1;
        applyShipDamage(0.32, -(dx / inv) * 50, -(dy / inv) * 50);
        a.gone = true;
      }
    }
    for (const d of drones) {
      const dx = d.x - ship.x;
      const dy = d.y - ship.y;
      const dist = Math.hypot(dx, dy);
      if (dist < d.r + ship.r * 0.7) {
        const inv = dist || 1;
        applyShipDamage(0.26, -(dx / inv) * 70, -(dy / inv) * 70);
        d.vx += (dx / inv) * 120;
        d.vy += (dy / inv) * 120;
      }
    }

    // Landing check
    currentPlanet = -1;
    let landingMsg = '';
    for (let i = 0; i < planets.length; i++) {
      const p = planets[i];
      const dx = ship.x - p.x;
      const dy = ship.y - p.y;
      const dist = Math.hypot(dx, dy);
      const altitude = dist - p.r;
      const speed = length(ship.vx, ship.vy);
      if (altitude < 40) {
        landingMsg = `İniş penceresi: ${p.name}\n- Hız < 0.6 olmalı\n- L ile inmeyi dene`;
        currentPlanet = i;
        if (keys.has('l') && speed < 0.6) {
          // Prepare surface and place astronaut
          const surf = ensureSurface(i);
          const ang = Math.atan2(ship.y - p.y, ship.x - p.x);
          const startR = Math.max(20, p.r - 26);
          astro.planetIndex = i;
          astro.x = Math.cos(ang) * (startR - 14); // local coords inside disc
          astro.y = Math.sin(ang) * (startR - 14);
          visited.add(i);
          state = STATE.PLANET;
          keys.delete('l');
        }
        break;
      }
    }

    // HUD/hints
    const speed = length(ship.vx, ship.vy).toFixed(2);
    const shieldPct = Math.round(shield * 100);
    hud.textContent = `MOD: UZAY\nHız: ${speed}\nKalkan: %${shieldPct}`;
    hint.innerHTML = [
      'W/A/S/D veya Yön Tuşları: Uçuş',
      'S: Fren, L: İniş (yakın + yavaş)',
      'E: Maden çek/topla',
      drones.length ? 'Dronlar kalkanını düşürür, lazerle yok et' : '',
      'M: Menü',
      landingMsg,
    ].filter(Boolean).join('\n');
  }

  function drawSpace() {
    // Apply camera
    applyCamera();

    // Nebula layers
    for (const neb of nebulae) {
      ctx.save();
      ctx.translate(neb.x, neb.y);
      ctx.rotate(neb.rotation + timeSeconds * 0.05);
      const grad = ctx.createRadialGradient(0, 0, neb.r * 0.25, 0, 0, neb.r);
      grad.addColorStop(0, neb.colorA);
      grad.addColorStop(1, neb.colorB);
      ctx.fillStyle = grad;
      ctx.beginPath();
      ctx.ellipse(0, 0, neb.r, neb.r * 0.6, 0, 0, Math.PI * 2);
      ctx.fill();
      ctx.restore();
    }

    // Parallax stars (draw in world space)
    ctx.fillStyle = '#ffffff';
    for (const s of stars) {
      const twinkle = Math.max(0.08, Math.min(1, s.base + Math.sin(timeSeconds * s.twinkle + s.phase) * 0.25));
      ctx.globalAlpha = twinkle;
      ctx.fillRect(s.x, s.y, s.size, s.size);
    }
    ctx.globalAlpha = 1;

    // Planets
    for (const p of planets) drawPlanet(ctx, p);

    // Asteroids
    for (const a of asteroids) drawAsteroid(ctx, a);

    // Loot
    for (const l of loot) drawLootItem(ctx, l);

    // Drone sentries
    for (const d of drones) drawDrone(ctx, d);

    // Enemy shots
    for (const shot of enemyShots) drawEnemyShot(ctx, shot);

    // Thruster trails
    for (const t of trailPoints) drawTrailPoint(ctx, t);

    // Beam flash
    if (beamFlash > 0) {
      ctx.save();
      ctx.globalAlpha = Math.min(1, beamFlash * 6);
      ctx.strokeStyle = 'rgba(140,210,255,0.9)';
      ctx.lineWidth = 2 + beamFlash * 6;
      ctx.shadowBlur = 18;
      ctx.shadowColor = 'rgba(140,210,255,0.6)';
      ctx.beginPath();
      ctx.moveTo(ship.x, ship.y);
      ctx.lineTo(ship.x + Math.cos(ship.angle) * 6000, ship.y + Math.sin(ship.angle) * 6000);
      ctx.stroke();
      ctx.restore();
    }

    // Ship
    drawShip(ctx, ship.x, ship.y, ship.angle);
    drawShieldAura(ctx);

    // Approach marker on current planet
    if (currentPlanet >= 0) {
      const p = planets[currentPlanet];
      ctx.strokeStyle = 'rgba(255,255,255,0.5)';
      ctx.setLineDash([6, 6]);
      ctx.beginPath();
      ctx.arc(p.x, p.y, p.r + 40, 0, Math.PI * 2);
      ctx.stroke();
      ctx.setLineDash([]);
    }

    resetTransform();
    // Draw overlays (minimap, overheat)
    drawMinimapOverlay();
    drawOverheatOverlay();
    drawShieldOverlay();
  }

  function updatePlanet(dt) {
    const p = planets[astro.planetIndex];
    const surf = ensureSurface(astro.planetIndex);
    updateDrones(dt);
    updateEnemyShots(dt);
    for (let i = trailPoints.length - 1; i >= 0; i--) {
      trailPoints[i].life -= dt;
      if (trailPoints[i].life <= 0) trailPoints.splice(i, 1);
    }
    const up = keys.has('w') || keys.has('arrowup');
    const down = keys.has('s') || keys.has('arrowdown');
    const left = keys.has('a') || keys.has('arrowleft');
    const right = keys.has('d') || keys.has('arrowright');

    // Movement input
    let mx = 0, my = 0;
    if (up) my -= 1;
    if (down) my += 1;
    if (left) mx -= 1;
    if (right) mx += 1;
    if (mx || my) {
      const inv = 1 / Math.hypot(mx, my);
      mx *= inv; my *= inv;
    }
    const speed = astro.speed;
    let nx = astro.x + mx * speed * dt;
    let ny = astro.y + my * speed * dt;

    // Boundary clamp inside the planet disc
    const boundary = p.r - 14; // keep some margin from rim
    const d = Math.hypot(nx, ny);
    if (d > boundary - astro.r) {
      const ang = Math.atan2(ny, nx);
      nx = Math.cos(ang) * (boundary - astro.r);
      ny = Math.sin(ang) * (boundary - astro.r);
    }

    // Simple collision against props
    for (const pr of surf.props) {
      const dx = nx - pr.x;
      const dy = ny - pr.y;
      const dd = Math.hypot(dx, dy);
      const minD = astro.r + pr.r * 0.85;
      if (dd < minD && dd > 0.0001) {
        const push = (minD - dd) + 0.01;
        nx += (dx / dd) * push;
        ny += (dy / dd) * push;
      }
    }

    astro.x = nx; astro.y = ny;

    // Collectibles: pickup with E
    let pickupMsg = '';
    let near = null;
    for (const c of surf.collectibles) {
      if (c.collected) continue;
      const dx = astro.x - c.x;
      const dy = astro.y - c.y;
      if (Math.hypot(dx, dy) < astro.r + c.r + 6) {
        near = c;
        pickupMsg = `E: Topla ${c.target === 'ship' ? 'Gemi' : 'Kıyafet'} rengi (${displayColorName(c.color)})`;
        break;
      }
    }
    if (near && (keys.has('e'))) {
      if (near.target === 'ship') unlockedShipColors.add(near.color); else unlockedSuitColors.add(near.color);
      near.collected = true;
      keys.delete('e');
      renderMenuIfOpen();
    }

    // Takeoff
    if (keys.has('l')) {
      const ang = Math.atan2(astro.y, astro.x);
      const r = p.r + 14;
      const nxw = Math.cos(ang);
      const nyw = Math.sin(ang);
      ship.x = p.x + nxw * r;
      ship.y = p.y + nyw * r;
      ship.vx = -nyw * 80; // tangential
      ship.vy = nxw * 80;
      ship.angle = Math.atan2(ship.vy, ship.vx);
      state = STATE.SPACE;
      keys.delete('l');
    }

    // Camera focus: follow astronaut position on the planet (mobile-friendly)
    const targetZoom = Math.min(3.5, Math.max(1.2, 700 / (p.r + 50)));
    camera.zoom += (targetZoom - camera.zoom) * 0.08;
    const targetX = p.x + astro.x;
    const targetY = p.y + astro.y;
    camera.x += (targetX - camera.x) * 0.12;
    camera.y += (targetY - camera.y) * 0.12;

    // HUD/hints
    hud.textContent = `MOD: GEZEGEN (${p.name}) | Habitat: ${surf.habitat}\nKalkan: %${Math.round(shield * 100)}`;
    hint.innerHTML = [
      'W/A/S/D: Yürü',
      pickupMsg || 'E: Etkileşim',
      'L: Kalkış',
      'M: Menü',
    ].filter(Boolean).join('\n');
  }

  function drawPlanetMode() {
    applyCamera();

    // Background stars faint
    ctx.globalAlpha = 0.15;
    ctx.fillStyle = 'rgba(255,255,255,0.8)';
    for (const s of stars) ctx.fillRect(s.x, s.y, s.s, s.s);
    ctx.globalAlpha = 1;

    // Planet ground disc with habitat tint
    const p = planets[astro.planetIndex];
    const surf = ensureSurface(astro.planetIndex);
    const groundGrad = ctx.createRadialGradient(p.x, p.y, p.r * 0.2, p.x, p.y, p.r);
    groundGrad.addColorStop(0, surf.ground.from);
    groundGrad.addColorStop(1, surf.ground.to);
    ctx.fillStyle = groundGrad;
    ctx.beginPath();
    ctx.arc(p.x, p.y, p.r, 0, Math.PI * 2);
    ctx.fill();

    // Props inside the disc
    for (const pr of surf.props) {
      const wx = p.x + pr.x;
      const wy = p.y + pr.y;
      // mask by disc (optional simple check)
      if (Math.hypot(pr.x, pr.y) <= p.r - 8) {
        drawProp(ctx, wx, wy, pr, surf.habitat);
      }
    }

    ctx.save();
    ctx.globalAlpha = 0.45;
    for (const shot of enemyShots) drawEnemyShot(ctx, shot);
    ctx.globalAlpha = 0.5;
    for (const d of drones) drawDrone(ctx, d);
    ctx.restore();

    // Collectibles
    for (const c of surf.collectibles) {
      if (c.collected) continue;
      const wx = p.x + c.x;
      const wy = p.y + c.y;
      const glow = ctx.createRadialGradient(wx, wy, 2, wx, wy, c.r * 3);
      const col = resolveColor(c.color).fill;
      glow.addColorStop(0, col);
      glow.addColorStop(1, 'transparent');
      ctx.fillStyle = glow;
      ctx.beginPath(); ctx.arc(wx, wy, c.r * 2.2, 0, Math.PI * 2); ctx.fill();
      ctx.fillStyle = col;
      ctx.beginPath(); ctx.arc(wx, wy, c.r, 0, Math.PI * 2); ctx.fill();
    }

    // Astronaut
    drawAstronaut(ctx, p.x + astro.x, p.y + astro.y);

    resetTransform();
    drawMinimapOverlay();
    drawOverheatOverlay();
    drawShieldOverlay();
  }

  // Helpers for colors and menu
  function displayColorName(id) {
    const map = { white: 'Beyaz', navy: 'Lacivert', yellow: 'Sarı', pink: 'Pembe', blue: 'Mavi' };
    return map[id] || id;
  }
  function resolveColor(id) {
    return shipColors.find(c => c.id === id) || suitColors.find(c => c.id === id) || shipColors[0];
  }

  function renderMenuIfOpen() { if (menuOpen) renderMenu(); }

  function renderMenu() {
    if (!menu) return;
    const inSpace = state === STATE.SPACE;
    const title = inSpace ? 'Uzay – Gemi' : 'Gezegen – Astronot';
    // Inventory grid with item labels
    function itemLabel(it){
      if (!it) return '&nbsp;';
      if (it.type === 'ore') { const m = minerals.find(x=>x.id===it.id); return `${m?m.name:it.id} x${it.qty}`; }
      if (it.type === 'artifact') {
        const label = it.name || 'Artefakt';
        return `${label}${it.qty > 1 ? ' x' + it.qty : ''}`;
      }
      return String(it);
    }
    const invHtml = '<div class="inventory">' + inventory.map((it, idx) => `
      <div class="slot" title="${it ? itemLabel(it) : 'Boş'}">${itemLabel(it)}</div>
    `).join('') + '</div>';

    function swatchesHtml(list, unlockedSet, selectedId, type) {
      return '<div class="swatches">' + list.map(col => {
        const locked = !unlockedSet.has(col.id);
        const sel = selectedId === col.id;
        return `<div class="swatch ${locked ? 'locked' : ''} ${sel ? 'selected' : ''}"
                   data-type="${type}" data-id="${col.id}"
                   title="${col.name}"
                   style="background:${col.fill}"></div>`;
      }).join('') + '</div>';
    }

    let body = '';
    if (inSpace) {
      body += `<div class="section"><h3>Gemi Sistemleri</h3>
        <div class="pill">Kalkan: %${Math.round(shield * 100)}</div>
        <div class="pill">Isı: %${Math.round(heat * 100)}</div>
        <div class="pill">Dronlar: ${drones.length}</div>
      </div>`;
      body += `<div class="section"><h3>Envanter (Gemi)</h3>${invHtml}</div>`;
      body += `<div class="section"><h3>Gemi Renkleri</h3>${swatchesHtml(shipColors, unlockedShipColors, shipColorId, 'ship')}</div>`;
      // Visited planets list
      const list = Array.from(visited).map(i => ({ i, name: planets[i].name })).sort((a,b)=>a.i-b.i);
      const items = list.map(p => `
        <div class="planet-item">
          <span class="pill">#${p.i+1}</span>
          <input type="text" data-planet-index="${p.i}" value="${p.name}" />
        </div>
      `).join('');
      body += `<div class="section"><h3>Keşfedilen Gezegenler</h3><div class="planets-list">${items || '<div class=\"pill\">Henüz yok</div>'}</div></div>`;
    } else {
      const p = planets[astro.planetIndex];
      const surf = surfaces[astro.planetIndex] || ensureSurface(astro.planetIndex);
      const info = `<div class="pill">Ad: ${p.name}</div> <div class="pill">Yarıçap: ${Math.round(p.r)}</div> <div class="pill">Habitat: ${surf.habitat}</div>`;
      body += `<div class="section"><h3>Gezegen Bilgileri</h3>${info}</div>`;
      body += `<div class="section"><h3>Astronot Renkleri</h3>${swatchesHtml(suitColors, unlockedSuitColors, suitColorId, 'suit')}</div>`;
      body += `<div class="section"><h3>Envanter</h3>${invHtml}</div>`;
    }

    menu.querySelector('.menu-title').textContent = `Kontrol Paneli – ${title}`;
    menuContent.innerHTML = body;

    // Events
    menuContent.onclick = (ev) => {
      const t = ev.target;
      if (t.classList.contains('swatch')) {
        const type = t.getAttribute('data-type');
        const id = t.getAttribute('data-id');
        if (type === 'ship') {
          if (!unlockedShipColors.has(id)) return;
          shipColorId = id;
        } else {
          if (!unlockedSuitColors.has(id)) return;
          suitColorId = id;
        }
        renderMenu();
      }
    };

    menuContent.onchange = (ev) => {
      const t = ev.target;
      if (t.matches('input[type="text"][data-planet-index]')) {
        const idx = parseInt(t.getAttribute('data-planet-index'));
        if (!Number.isNaN(idx) && planets[idx]) {
          planets[idx].name = t.value.trim() || planets[idx].name;
        }
      }
    };
  }

  // Toggle menu with M / close with ESC
  window.addEventListener('keydown', (e) => {
    const k = e.key.toLowerCase();
    if (k === 'm') {
      menuOpen = !menuOpen;
      if (menuOpen) { menu.classList.remove('hidden'); renderMenu(); }
      else { menu.classList.add('hidden'); }
      e.preventDefault();
    } else if (k === 'escape' && menuOpen) {
      menuOpen = false; menu.classList.add('hidden'); e.preventDefault();
    }
  });

  // Start loop
  requestAnimationFrame((t) => { last = t; step(t); });
})();
