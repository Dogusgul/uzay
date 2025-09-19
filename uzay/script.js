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
    planets.push({ x, y, r, color, name, glow: `hsla(${hue} 90% 60% / 0.3)` });
  }

  const stars = Array.from({ length: 500 }, () => ({
    x: (rand() - 0.5) * 10000,
    y: (rand() - 0.5) * 10000,
    b: 0.3 + rand() * 0.7,
    s: rand() < 0.1 ? 2 : 1,
  }));

  // Ship
  const ship = {
    x: planets[0].x + planets[0].r + 160,
    y: planets[0].y,
    vx: 0,
    vy: 0,
    angle: Math.PI, // facing left initially
  };

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
    for (let i = 0; i < asteroids.length; i++) {
      const a = asteroids[i];
      const t = rayCircleHit(ship.x, ship.y, dx, dy, a.x, a.y, a.r);
      if (isFinite(t)) destroyed.push(i);
    }
    if (destroyed.length) {
      destroyed.sort((a,b)=>b-a);
      for (const idx of destroyed) { const a = asteroids[idx]; spawnLoot(a.x, a.y, a.mineral); asteroids.splice(idx,1); }
    }
  }

  function spawnLoot(x, y, mineral) {
    loot.push({ x, y, r: 6, mineral, toShip: false, vx: (Math.random()-0.5)*10, vy: (Math.random()-0.5)*10 });
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

  function addToInventory(id, qty) {
    for (let i = 0; i < inventory.length; i++) {
      const it = inventory[i];
      if (it && it.type === 'ore' && it.id === id) { it.qty += qty; return true; }
    }
    for (let i = 0; i < inventory.length; i++) {
      if (!inventory[i]) { inventory[i] = { type: 'ore', id, qty }; return true; }
    }
    return false;
  }

  function drawPlanet(ctx, p) {
    // Glow
    ctx.save();
    const grad = ctx.createRadialGradient(p.x, p.y, p.r * 0.6, p.x, p.y, p.r * 1.7);
    grad.addColorStop(0, 'transparent');
    grad.addColorStop(1, p.glow);
    ctx.fillStyle = grad;
    ctx.beginPath();
    ctx.arc(p.x, p.y, p.r * 1.7, 0, Math.PI * 2);
    ctx.fill();
    ctx.restore();

    // Body
    ctx.beginPath();
    ctx.arc(p.x, p.y, p.r, 0, Math.PI * 2);
    ctx.fillStyle = p.color;
    ctx.fill();

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
    ctx.setTransform(camera.zoom, 0, 0, camera.zoom, canvas.clientWidth / 2, canvas.clientHeight / 2);
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

    // Camera follows ship with slight easing
    const targetZoom = 1;
    camera.zoom += (targetZoom - camera.zoom) * 0.05;
    camera.x += (ship.x - camera.x) * 0.12;
    camera.y += (ship.y - camera.y) * 0.12;

    // Beam fade
    beamFlash = Math.max(0, beamFlash - dt);

    // Cool down heat
    heat = Math.max(0, heat - heatCoolRate * dt);

    // Update asteroids
    spawnAsteroids(dt);
    for (const a of asteroids) {
      a.x += a.vx * dt;
      a.y += a.vy * dt;
      a.life -= dt;
    }
    // Remove expired asteroids
    for (let i = asteroids.length - 1; i >= 0; i--) {
      if (asteroids[i].life <= 0) asteroids.splice(i, 1);
    }

    // Update loot (attract to ship if flagged)
    for (const l of loot) {
      if (l.toShip) {
        const dx = ship.x - l.x; const dy = ship.y - l.y;
        const d = Math.hypot(dx, dy) || 1;
        const sp = 60 + (200 * (1 - Math.min(1, d/400)));
        l.vx = (dx / d) * sp; l.vy = (dy / d) * sp;
      }
      l.x += (l.vx || 0) * dt; l.y += (l.vy || 0) * dt;
    }
    // Pickup loot with E when near
    if (keys.has('e')) {
      let picked = false;
      for (const l of loot) {
        const d = Math.hypot(l.x - ship.x, l.y - ship.y);
        if (d < 24) { addToInventory(l.mineral.id, 1); l.gone = true; picked = true; }
        else if (d < 140) { l.toShip = true; }
      }
      if (picked) { keys.delete('e'); renderMenuIfOpen(); }
    }
    for (let i = loot.length - 1; i >= 0; i--) if (loot[i].gone) loot.splice(i,1);

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
    hud.textContent = `MOD: UZAY\nHız: ${speed}`;
    hint.innerHTML = [
      'W/A/S/D veya Yön Tuşları: Uçuş',
      'S: Fren, L: İniş (yakın + yavaş)',
      landingMsg,
    ].filter(Boolean).join('\n');
  }

  function drawSpace() {
    // Apply camera
    applyCamera();

    // Parallax stars (draw in world space)
    ctx.fillStyle = 'rgba(255,255,255,0.8)';
    for (const s of stars) {
      const sx = s.x;
      const sy = s.y;
      ctx.globalAlpha = s.b * 0.9;
      ctx.fillRect(sx, sy, s.s, s.s);
    }
    ctx.globalAlpha = 1;

    // Planets
    for (const p of planets) drawPlanet(ctx, p);

    // Asteroids
    for (const a of asteroids) {
      ctx.fillStyle = '#8b8f97';
      ctx.beginPath(); ctx.arc(a.x, a.y, a.r, 0, Math.PI * 2); ctx.fill();
      // mineral tint
      ctx.fillStyle = a.mineral.color + '99';
      ctx.beginPath(); ctx.arc(a.x + a.r*0.2, a.y - a.r*0.2, a.r*0.4, 0, Math.PI * 2); ctx.fill();
    }

    // Loot
    for (const l of loot) {
      ctx.fillStyle = '#ffffff55';
      ctx.beginPath(); ctx.arc(l.x, l.y, l.r*2, 0, Math.PI * 2); ctx.fill();
      ctx.fillStyle = l.mineral.color;
      ctx.beginPath(); ctx.arc(l.x, l.y, l.r, 0, Math.PI * 2); ctx.fill();
    }

    // Beam flash
    if (beamFlash > 0) {
      ctx.strokeStyle = 'rgba(120,200,255,0.8)';
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.moveTo(ship.x, ship.y);
      ctx.lineTo(ship.x + Math.cos(ship.angle) * 6000, ship.y + Math.sin(ship.angle) * 6000);
      ctx.stroke();
    }

    // Ship
    drawShip(ctx, ship.x, ship.y, ship.angle);

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
  }

  function updatePlanet(dt) {
    const p = planets[astro.planetIndex];
    const surf = ensureSurface(astro.planetIndex);
    let landingMsg = '';
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
    hud.textContent = `MOD: GEZEGEN (${p.name}) | Habitat: ${surf.habitat}`;
    hint.innerHTML = [
      'W/A/S/D: Yürü',
      'L: Kalkış',
    ].join('\n');
    // Ek bilgi (yakındaki toplanabilir renk)
    hint.innerHTML = [
      'W/A/S/D: Yürü',
      'L: Kalkış',
      pickupMsg,
    ].filter(Boolean).join('\\n');
    // Ek ipucu: yakındaki madenleri çekme
    hint.innerHTML = [
      'W/A/S/D veya Yön Tuşları: Uçuş',
      'S: Fren, L: İniş (yakın + yavaş)',
      (loot.some(l=>Math.hypot(l.x-ship.x,l.y-ship.y)<140) ? 'E: Yakın madeni gemiye çek' : ''),
      landingMsg,
    ].filter(Boolean).join('\\n');
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
