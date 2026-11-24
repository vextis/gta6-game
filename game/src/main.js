// Solmar Heat — an original open-world crime caper in the coastal city of
// Port Solana. Canvas + vanilla JS, no libraries, no network: steal cars,
// run jobs for fixer Carmen Vega, rob the Banco del Sol, and lose the heat.
//
// Controls: WASD/arrows move · E enter car / talk / buy · F punch ·
// mouse aim, click shoot · Shift sprint · Space handbrake · P pause.

import { buildCity, mulberry32, collides, pushOut, drawCity } from './city.js';
import {
  makeCar, spawnTraffic, spawnPeds, updateTraffic, updatePeds, scarePeds,
  updatePoliceCars, updateCops, shoot, burst, updateBullets, damagePed,
  drawCar, drawPerson, drawBullets,
} from './actors.js';

const canvas = document.getElementById('game');
const ctx = canvas.getContext('2d');
const VW = canvas.width, VH = canvas.height;
const params = new URLSearchParams(location.search);
const SHOT = params.get('shot');
const SEED = Number(params.get('seed') || 7);

// ---------------- audio: tiny synth blips, created on first input ----------------
let AC = null;
function sfx(name) {
  if (SHOT) return;
  try {
    AC = AC || new (window.AudioContext || window.webkitAudioContext)();
    if (AC.state === 'suspended') AC.resume();
    const t = AC.currentTime, o = AC.createOscillator(), g = AC.createGain();
    o.connect(g); g.connect(AC.destination);
    const set = (f0, f1, dur, type, vol) => {
      o.type = type; o.frequency.setValueAtTime(f0, t); o.frequency.exponentialRampToValueAtTime(Math.max(30, f1), t + dur);
      g.gain.setValueAtTime(vol, t); g.gain.exponentialRampToValueAtTime(0.001, t + dur); o.start(t); o.stop(t + dur);
    };
    if (name === 'shot') set(720, 90, 0.09, 'square', 0.16);
    else if (name === 'punch') set(180, 70, 0.07, 'triangle', 0.22);
    else if (name === 'hurt') set(300, 120, 0.12, 'sawtooth', 0.12);
    else if (name === 'cash') { set(880, 880, 0.07, 'sine', 0.15); setTimeout(() => sfx('coin2'), 70); }
    else if (name === 'coin2') set(1318, 1318, 0.1, 'sine', 0.15);
    else if (name === 'siren') set(620, 920, 0.3, 'sine', 0.05);
  } catch { /* silent if audio is unavailable */ }
}

// ---------------- state ----------------

function newGame(seed) {
  const rng = mulberry32(seed);
  const city = buildCity(rng);
  const club = city.spots.club;
  const G = {
    city, rng, time: 0, mode: SHOT ? 'play' : 'title',
    cars: [], peds: [], policeCars: [], cops: [], bullets: [], parts: [],
    player: { x: club.x, y: club.y + 30, angle: 0, hp: 100, car: null, speedMag: 0, punchT: 0, hurtFlash: 0, skin: '#c98a5a', shirt: '#2aa198' },
    cash: 120, ammo: 24, heat: 0, stars: 0, bust: 0, unseenT: 0, sprayCool: 0,
    story: { idx: 0, phase: 'offer', car: null, timer: 0, robT: 0 },
    message: '', msgT: 0, cam: { x: 0, y: 0 }, saveT: 0, shotFrozen: false,
    addHeat(n) { this.heat = Math.min(599, this.heat + n); this.unseenT = 0; },
    hurtPlayer(dmg) {
      if (this.mode !== 'play') return;
      this.player.hp -= dmg; this.player.hurtFlash = 0.25; if (dmg > 2) sfx('hurt');
      if (this.player.hp <= 0) wasted(this);
    },
    msg(t) { this.message = t; this.msgT = 4.5; },
    sfx,
  };
  spawnTraffic(G, 15);
  spawnPeds(G, 30);
  return G;
}

let G = newGame(SEED);

// ---------------- save / continue ----------------
const SAVE_KEY = 'solmarHeatSaveV1';
function save() {
  if (SHOT) return;
  try {
    localStorage.setItem(SAVE_KEY, JSON.stringify({
      cash: G.cash, ammo: G.ammo, idx: G.story.idx, done: G.story.phase === 'done',
      x: Math.round(G.player.x), y: Math.round(G.player.y),
    }));
  } catch { /* private mode etc. */ }
}
function loadSave() {
  try { const s = JSON.parse(localStorage.getItem(SAVE_KEY)); return s && typeof s.cash === 'number' ? s : null; }
  catch { return null; }
}
function startGame(fromSave) {
  G = newGame(SEED);
  G.mode = 'play';
  if (fromSave) {
    const s = loadSave();
    if (s) {
      G.cash = s.cash; G.ammo = s.ammo; G.story.idx = s.idx;
      if (s.done) G.story.phase = 'done';
      G.player.x = s.x; G.player.y = s.y;
      G.msg('Welcome back to Port Solana.');
    }
  } else {
    try { localStorage.removeItem(SAVE_KEY); } catch { /* ignore */ }
    G.msg('Find Carmen Vega at Club Sirena — she has work.');
  }
}

// ---------------- input ----------------
const keys = {};
const mouse = { x: VW / 2, y: VH / 2, down: false };
addEventListener('keydown', e => {
  if (['ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight', 'Space'].includes(e.code)) e.preventDefault();
  keys[e.code] = true;
  if (G.mode === 'title' && (e.code === 'Enter')) startGame(false);
  else if (G.mode === 'title' && e.code === 'KeyC' && loadSave()) startGame(true);
  else if ((G.mode === 'busted' || G.mode === 'wasted') && e.code === 'Enter') respawn();
  else if (e.code === 'KeyP' || e.code === 'Escape') {
    if (G.mode === 'play') G.mode = 'pause'; else if (G.mode === 'pause') G.mode = 'play';
  }
  else if (G.mode === 'play' && e.code === 'KeyE') interact();
  else if (G.mode === 'play' && e.code === 'KeyF') punch();
});
addEventListener('keyup', e => { keys[e.code] = false; });
canvas.addEventListener('mousemove', e => {
  const r = canvas.getBoundingClientRect();
  mouse.x = (e.clientX - r.left) * VW / r.width; mouse.y = (e.clientY - r.top) * VH / r.height;
});
canvas.addEventListener('mousedown', () => {
  mouse.down = true;
  if (G.mode === 'title') startGame(!!loadSave() && mouse.y > VH * 0.62 ? true : false);
  else if (G.mode === 'busted' || G.mode === 'wasted') respawn();
  else if (G.mode === 'play') tryShoot();
});
addEventListener('mouseup', () => { mouse.down = false; });

function respawn() {
  const p = G.player;
  if (G.mode === 'busted') {
    const spot = G.city.spots.police;
    p.x = spot.x; p.y = spot.y + 10;
  } else {
    const spot = G.city.spots.clinic;
    p.x = spot.x; p.y = spot.y + 10;
  }
  p.hp = 100; p.car = null; G.heat = 0; G.bust = 0;
  G.policeCars.length = 0; G.cops.length = 0;
  if (G.story.phase === 'rob' || G.story.phase === 'escape') { G.story.phase = 'offer'; G.story.robT = 0; }
  G.mode = 'play';
}
function wasted(Gg) { Gg.mode = 'wasted'; const fee = Math.min(Gg.cash, 150); Gg.cash -= fee; Gg.wastedFee = fee; }
function busted() {
  G.mode = 'busted';
  const fine = Math.min(G.cash, 100 + G.stars * 75);
  G.cash -= fine; G.bustedFine = fine;
}

// ---------------- player actions ----------------

function nearestCar(maxD) {
  let best = null, bd = maxD;
  for (const c of G.cars) { const d = Math.hypot(c.x - G.player.x, c.y - G.player.y); if (d < bd) { bd = d; best = c; } }
  return best;
}

function interact() {
  const p = G.player, S = G.story;
  if (p.car) { // step out
    const side = p.car.angle + Math.PI / 2;
    for (const s of [1, -1]) {
      const nx = p.car.x + Math.cos(side) * 30 * s, ny = p.car.y + Math.sin(side) * 30 * s;
      if (!collides(G.city, nx, ny, 10)) { p.x = nx; p.y = ny; break; }
    }
    p.car.kind = p.car.missionTarget ? 'sport' : 'parked'; p.car.speed = 0; p.car = null;
    return;
  }
  const near = (spot, d) => Math.hypot(p.x - spot.x, p.y - spot.y) < d;
  // Carmen hands out the next job.
  if (S.phase === 'offer' && S.idx < 3 && near(G.city.spots.club, 46)) return startMission();
  if (S.phase === 'return' && near(G.city.spots.club, 46)) {
    G.cash += 800; sfx('cash'); G.msg('Carmen: "Clean work. The city is yours now." +$800');
    S.phase = 'done'; S.idx = 3; save(); return;
  }
  if (near(G.city.spots.gunshop, 44)) {
    if (G.cash >= 40) { G.cash -= 40; G.ammo += 24; sfx('cash'); G.msg('Armería Sol: 24 rounds, $40. Stay safe out there.'); }
    else G.msg('You need $40 for ammo.');
    return;
  }
  const car = nearestCar(46);
  if (car && Math.abs(car.speed) < 30) {
    p.car = car; car.kind = 'player';
    if (!car.stolen) {
      car.stolen = true;
      if (car.missionTarget) { /* Carmen sent you for it */ }
      else { G.addHeat(60); scarePeds(G, p.x, p.y, 150); G.msg('Car stolen!'); }
    }
    if (car.missionTarget && S.phase === 'steal') { S.phase = 'deliver'; G.msg('Got it! Take it to Taller Vega, south-east.'); }
  }
}

function punch() {
  const p = G.player;
  if (p.car || p.punchT > 0) return;
  p.punchT = 0.35; sfx('punch');
  burst(G, p.x + Math.cos(p.angle) * 16, p.y + Math.sin(p.angle) * 16, 2, '#ffffff', 50);
  for (const ped of G.peds) if (ped.state !== 'down' && Math.hypot(ped.x - p.x, ped.y - p.y) < 32) { damagePed(G, ped, 16); return; }
  for (const cop of G.cops) if (cop.state !== 'down' && Math.hypot(cop.x - p.x, cop.y - p.y) < 32) {
    cop.hp -= 16; G.addHeat(90); burst(G, cop.x, cop.y, 4, '#c03a3a', 80);
    if (cop.hp <= 0) cop.state = 'down'; return;
  }
}

function tryShoot() {
  const p = G.player;
  if (p.car) return;
  if (G.ammo <= 0) { G.msg('Out of ammo — Armería Sol, north strip, sells rounds.'); return; }
  G.ammo--;
  const wx = G.cam.x + mouse.x, wy = G.cam.y + mouse.y;
  shoot(G, p.x, p.y, Math.atan2(wy - p.y, wx - p.x), false);
  G.addHeat(50); scarePeds(G, p.x, p.y, 260);
}

// ---------------- missions ----------------

function startMission() {
  const S = G.story, spots = G.city.spots;
  if (S.idx === 0) {
    const car = makeCar(G.rng, G.city.roadsX[2], G.city.roadsY[3], 'sport');
    car.angle = Math.PI / 2; car.missionTarget = true;
    G.cars.push(car); S.car = car; S.phase = 'steal';
    G.msg('Carmen: "A yellow sportster sits by the marina. Bring it to my garage."');
  } else if (S.idx === 1) {
    S.phase = 'pickup'; G.msg('Carmen: "Pick up a package at Taco Ola. Clock starts at pickup."');
  } else if (S.idx === 2) {
    S.phase = 'rob'; S.robT = 0; G.msg('Carmen: "Banco del Sol, midday. Stand in the vault door and fill the bag."');
  }
  sfx('cash');
}

function missionTarget() {
  const S = G.story, spots = G.city.spots;
  switch (S.phase) {
    case 'offer': return S.idx < 3 ? { ...spots.club, label: 'C', text: 'See Carmen Vega at Club Sirena' } : null;
    case 'steal': return { x: S.car.x, y: S.car.y, label: '!', text: 'Steal the yellow sportster by the marina' };
    case 'deliver': return { ...spots.garage, label: 'G', text: 'Deliver the sportster to Taller Vega' };
    case 'pickup': return { ...spots.taco, label: 'P', text: 'Pick up the package at Taco Ola' };
    case 'run': return { ...spots.marina, label: 'D', text: `Deliver to Marina Azul — ${Math.ceil(S.timer)}s left` };
    case 'rob': return { ...spots.bank, label: 'B', text: 'Rob Banco del Sol: stand at the door' };
    case 'escape': return null;
    case 'return': return { ...spots.club, label: 'C', text: 'Lose the heat, then report to Carmen' };
    default: return null;
  }
}

function updateMissions(dt) {
  const S = G.story, p = G.player, spots = G.city.spots;
  const near = (s, d) => Math.hypot(p.x - s.x, p.y - s.y) < d;
  if (S.phase === 'deliver' && p.car === S.car && near(spots.garage, 58)) {
    G.cash += 600; sfx('cash'); G.msg('Delivered! +$600 — Carmen has more work at the club.');
    S.idx = 1; S.phase = 'offer'; S.car = null; save();
  } else if (S.phase === 'pickup' && near(spots.taco, 48)) {
    S.phase = 'run'; S.timer = 120; G.msg('Package in hand — get to Marina Azul, fast!');
  } else if (S.phase === 'run') {
    S.timer -= dt;
    if (S.timer <= 0) { S.phase = 'offer'; G.msg('Too slow — the buyer walked. Carmen will re-offer the job.'); }
    else if (near(spots.marina, 52)) {
      G.cash += 900; sfx('cash'); G.msg('Package delivered! +$900');
      S.idx = 2; S.phase = 'offer'; save();
    }
  } else if (S.phase === 'rob' && !p.car && near(spots.bank, 42)) {
    S.robT += dt;
    if (S.robT >= 5) {
      G.cash += 2200; G.addHeat(470); sfx('cash');
      G.msg('You emptied the vault! +$2,200 — now LOSE THE HEAT.');
      S.phase = 'escape';
    }
  } else if (S.phase === 'escape' && G.heat <= 0) {
    S.phase = 'return'; G.msg('Heat is off. Back to Carmen for your cut.');
  }
}

// ---------------- wanted & police ----------------

function updateWanted(dt) {
  G.stars = G.heat <= 0 ? 0 : Math.min(5, 1 + Math.floor(G.heat / 120));
  let seen = false;
  for (const c of [...G.policeCars, ...G.cops]) if (Math.hypot(c.x - G.player.x, c.y - G.player.y) < 520) { seen = true; break; }
  if (seen) G.unseenT = 0; else {
    G.unseenT += dt;
    if (G.unseenT > 5 && G.heat > 0) G.heat = Math.max(0, G.heat - 17 * dt);
  }
  // Spawn / retire units to match the star level.
  const wantCars = G.stars === 0 ? 0 : Math.min(4, G.stars);
  const wantCops = G.stars >= 2 ? Math.min(5, G.stars) : (G.stars === 1 && !G.player.car ? 1 : 0);
  const spawnAt = (minD, maxD, snapRoad) => {
    for (let i = 0; i < 8; i++) {
      const a = G.rng() * 6.28, d = minD + G.rng() * (maxD - minD);
      let x = G.player.x + Math.cos(a) * d, y = G.player.y + Math.sin(a) * d;
      if (snapRoad) { if (G.rng() < 0.5) x = nearestOf(G.city.roadsX, x); else y = nearestOf(G.city.roadsY, y); }
      if (x > 60 && x < G.city.W - 60 && y > 60 && y < 2100 && !collides(G.city, x, y, 14)) return { x, y };
    }
    return null;
  };
  if (G.policeCars.length < wantCars) { const s = spawnAt(640, 880, true); if (s) { const c = makeCar(G.rng, s.x, s.y, 'police'); G.policeCars.push(c); } }
  if (G.cops.length < wantCops) { const s = spawnAt(380, 520, false); if (s) G.cops.push({ x: s.x, y: s.y, angle: 0, hp: 40, state: 'walk', skin: '#c98a5a', shirt: '#2c3e70', shotT: 1 }); }
  G.policeCars = G.policeCars.filter(c => G.stars > 0 || Math.hypot(c.x - G.player.x, c.y - G.player.y) < 1300);
  G.cops = G.cops.filter(c => c.state === 'down' || G.stars > 0 || Math.hypot(c.x - G.player.x, c.y - G.player.y) < 1100);
  // Bust meter.
  const p = G.player;
  const mySpeed = p.car ? Math.abs(p.car.speed) : p.speedMag;
  let threat = false;
  if (mySpeed < 45) {
    for (const c of G.policeCars) if (Math.hypot(c.x - p.x, c.y - p.y) < 52) threat = true;
    for (const c of G.cops) if (c.state !== 'down' && Math.hypot(c.x - p.x, c.y - p.y) < 42) threat = true;
  }
  G.bust = Math.max(0, Math.min(1, G.bust + (threat ? dt / 2.3 : -dt * 0.7)));
  if (G.bust >= 1 && G.mode === 'play') busted();
}
function nearestOf(arr, v) { let b = arr[0]; for (const a of arr) if (Math.abs(a - v) < Math.abs(b - v)) b = a; return b; }

// ---------------- player update ----------------

function updatePlayer(dt) {
  const p = G.player;
  p.punchT = Math.max(0, p.punchT - dt);
  p.hurtFlash = Math.max(0, p.hurtFlash - dt);
  if (p.car) {
    const car = p.car;
    const up = keys.KeyW || keys.ArrowUp, down = keys.KeyS || keys.ArrowDown;
    const left = keys.KeyA || keys.ArrowLeft, right = keys.KeyD || keys.ArrowRight;
    const maxF = car.missionTarget || car.color === '#ffcf3f' ? 348 : 300;
    if (up) car.speed += 265 * dt;
    if (down) car.speed -= (car.speed > 10 ? 330 : 150) * dt;
    if (keys.Space) car.speed -= Math.sign(car.speed) * Math.min(Math.abs(car.speed), 420 * dt);
    car.speed -= car.speed * 0.55 * dt;
    car.speed = Math.max(-115, Math.min(maxF, car.speed));
    const steer = (left ? -1 : 0) + (right ? 1 : 0);
    if (steer && Math.abs(car.speed) > 8) car.angle += steer * 2.35 * dt * Math.sign(car.speed) * Math.min(1, Math.abs(car.speed) / 120);
    const ox = car.x, oy = car.y;
    car.x += Math.cos(car.angle) * car.speed * dt;
    car.y += Math.sin(car.angle) * car.speed * dt;
    if (pushOut(G.city, car, 20)) {
      if (Math.abs(car.speed) > 150) { car.hp -= 9; G.addHeat(25); burst(G, car.x, car.y, 6, '#ffb35a', 110); }
      car.speed *= -0.32;
    }
    // Other cars: shove apart, trade paint.
    for (const o of G.cars) {
      if (o === car) continue;
      const dx = car.x - o.x, dy = car.y - o.y, d = Math.hypot(dx, dy);
      if (d > 0 && d < 40) {
        const push = (40 - d) / 2, ux = dx / d, uy = dy / d;
        car.x += ux * push; car.y += uy * push;
        if (o.kind !== 'player') { o.x -= ux * push; o.y -= uy * push; }
        if (Math.abs(car.speed) > 130) { o.hp -= 8; car.hp -= 4; G.addHeat(30); scarePeds(G, car.x, car.y, 170); burst(G, o.x, o.y, 5, '#ffb35a', 100); car.speed *= 0.72; }
      }
    }
    // Running someone down is very illegal.
    for (const ped of G.peds) {
      if (ped.state !== 'down' && Math.abs(car.speed) > 45 && Math.hypot(ped.x - car.x, ped.y - car.y) < 21) { damagePed(G, ped, 100); car.speed *= 0.82; }
    }
    p.x = car.x; p.y = car.y; p.angle = car.angle; p.speedMag = Math.abs(car.speed);
    void ox; void oy;
  } else {
    let mx = (keys.KeyD || keys.ArrowRight ? 1 : 0) - (keys.KeyA || keys.ArrowLeft ? 1 : 0);
    let my = (keys.KeyS || keys.ArrowDown ? 1 : 0) - (keys.KeyW || keys.ArrowUp ? 1 : 0);
    const run = keys.ShiftLeft || keys.ShiftRight;
    const sp = run ? 248 : 172;
    const len = Math.hypot(mx, my) || 1;
    const ox = p.x, oy = p.y;
    const nx = p.x + (mx / len) * sp * dt * (mx || my ? 1 : 0), ny = p.y + (my / len) * sp * dt * (mx || my ? 1 : 0);
    if (!collides(G.city, nx, p.y, 10)) p.x = nx;
    if (!collides(G.city, p.x, ny, 10)) p.y = ny;
    p.speedMag = Math.hypot(p.x - ox, p.y - oy) / Math.max(dt, 0.001);
    if (mx || my) p.angle = Math.atan2(my, mx);
    // Traffic can run YOU down.
    for (const c of G.cars) {
      if (c.kind === 'traffic' && Math.abs(c.speed) > 120 && Math.hypot(c.x - p.x, c.y - p.y) < 23) {
        G.hurtPlayer(16); p.x += Math.cos(c.angle) * 22; p.y += Math.sin(c.angle) * 22;
      }
    }
    // Aim follows the mouse while on foot.
    p.angle = Math.atan2(G.cam.y + mouse.y - p.y, G.cam.x + mouse.x - p.x);
  }
  // Pay 'n Spray: drive in dirty, drive out clean.
  G.sprayCool = Math.max(0, G.sprayCool - dt);
  if (p.car && G.heat > 0 && G.sprayCool <= 0) {
    const s = G.city.spots.spray;
    if (Math.hypot(p.x - s.x, p.y - s.y) < 62) {
      if (G.cash >= 200) {
        G.cash -= 200; G.heat = 0; G.bust = 0; G.sprayCool = 4;
        p.car.color = ['#d94f3d', '#3d7bd9', '#57b06a', '#e8e3d8', '#b45ad0'][Math.floor(G.rng() * 5)];
        sfx('cash'); G.msg("Pay 'n Spray: new paint, no heat. -$200");
      } else if (G.msgT <= 0) G.msg("Pay 'n Spray needs $200 to lose the heat.");
    }
  }
}

// ---------------- rendering ----------------

function drawMarker(t) {
  if (!t) return;
  const x = t.x - G.cam.x, y = t.y - G.cam.y;
  const bob = Math.sin(G.time * 4) * 5;
  if (x > -40 && x < VW + 40 && y > -40 && y < VH + 40) {
    ctx.strokeStyle = '#ffd83d'; ctx.lineWidth = 3;
    ctx.beginPath(); ctx.arc(x, y, 20 + Math.sin(G.time * 4) * 3, 0, 7); ctx.stroke();
    ctx.fillStyle = '#ffd83d'; ctx.font = 'bold 22px system-ui, sans-serif'; ctx.textAlign = 'center';
    ctx.fillText(t.label, x, y - 30 + bob);
  } else {
    const cx = Math.max(30, Math.min(VW - 30, x)), cy = Math.max(30, Math.min(VH - 30, y));
    ctx.fillStyle = '#ffd83d'; ctx.beginPath(); ctx.arc(cx, cy, 14, 0, 7); ctx.fill();
    ctx.fillStyle = '#221a08'; ctx.font = 'bold 14px system-ui, sans-serif'; ctx.textAlign = 'center';
    ctx.fillText(t.label, cx, cy + 5);
  }
}

function drawHUD(t) {
  ctx.textAlign = 'left';
  ctx.fillStyle = 'rgba(12,10,20,0.66)'; ctx.fillRect(14, 12, 252, 86);
  ctx.fillStyle = '#7be495'; ctx.font = 'bold 27px system-ui, sans-serif';
  ctx.fillText('$' + G.cash.toLocaleString(), 26, 46);
  ctx.fillStyle = '#3a3f4a'; ctx.fillRect(26, 58, 180, 13);
  ctx.fillStyle = G.player.hp > 30 ? '#e0483e' : '#ff7a2f';
  ctx.fillRect(26, 58, 180 * Math.max(0, G.player.hp) / 100, 13);
  ctx.fillStyle = '#e8e3d8'; ctx.font = '13px system-ui, sans-serif';
  ctx.fillText(`Pistol ammo: ${G.ammo}`, 26, 90);
  if (G.bust > 0.02) {
    ctx.fillStyle = '#3a3f4a'; ctx.fillRect(26, 106, 180, 10);
    ctx.fillStyle = '#ff4040'; ctx.fillRect(26, 106, 180 * G.bust, 10);
    ctx.fillStyle = '#ffb3b3'; ctx.font = 'bold 11px system-ui, sans-serif'; ctx.fillText('BUSTED?', 26, 104);
  }
  // Stars.
  ctx.font = '30px system-ui, sans-serif'; ctx.textAlign = 'right';
  for (let i = 0; i < 5; i++) { ctx.fillStyle = i < G.stars ? '#ffd83d' : 'rgba(255,255,255,0.25)'; ctx.fillText('★', VW - 24 - (4 - i) * 32, 44); }
  // Objective.
  if (t && t.text) {
    ctx.font = 'bold 16px system-ui, sans-serif';
    const w = ctx.measureText(t.text).width + 30;
    ctx.fillStyle = 'rgba(12,10,20,0.66)'; ctx.fillRect((VW - w) / 2, 14, w, 32);
    ctx.fillStyle = '#ffd83d'; ctx.textAlign = 'center'; ctx.fillText(t.text, VW / 2, 36);
  }
  if (G.story.phase === 'rob' && G.story.robT > 0) {
    ctx.fillStyle = '#3a3f4a'; ctx.fillRect(VW / 2 - 110, 56, 220, 10);
    ctx.fillStyle = '#ffd83d'; ctx.fillRect(VW / 2 - 110, 56, 220 * G.story.robT / 5, 10);
  }
  // Message + hints.
  if (G.msgT > 0) {
    ctx.font = '16px system-ui, sans-serif';
    const w = ctx.measureText(G.message).width + 28;
    ctx.fillStyle = 'rgba(12,10,20,0.72)'; ctx.fillRect(14, VH - 96, w, 30);
    ctx.fillStyle = '#fff'; ctx.textAlign = 'left'; ctx.fillText(G.message, 28, VH - 76);
  }
  ctx.fillStyle = 'rgba(255,255,255,0.55)'; ctx.font = '12px system-ui, sans-serif'; ctx.textAlign = 'left';
  ctx.fillText(G.player.car ? 'WASD drive · Space handbrake · E exit' : 'WASD move · E enter car / talk · F punch · click shoot · Shift sprint', 16, VH - 18);
  drawMinimap();
}

function drawMinimap() {
  const mw = 196, mh = 150, mx = VW - mw - 14, my = VH - mh - 14;
  const sx = mw / G.city.W, sy = mh / G.city.H;
  ctx.fillStyle = 'rgba(10,14,22,0.82)'; ctx.fillRect(mx, my, mw, mh);
  ctx.strokeStyle = 'rgba(255,255,255,0.25)'; ctx.strokeRect(mx, my, mw, mh);
  ctx.fillStyle = '#33506e';
  for (const rx of G.city.roadsX) ctx.fillRect(mx + rx * sx - 1, my, 2, mh);
  for (const ry of G.city.roadsY) ctx.fillRect(mx, my + ry * sy - 1, mw, 2);
  ctx.fillStyle = '#2e7d46'; ctx.fillRect(mx + G.city.park.x * sx, my + G.city.park.y * sy, G.city.park.w * sx, G.city.park.h * sy);
  ctx.fillStyle = '#2e7fb8'; ctx.fillRect(mx, my + G.city.seaY * sy, mw, (G.city.H - G.city.seaY) * sy);
  const dot = (x, y, c, r) => { ctx.fillStyle = c; ctx.beginPath(); ctx.arc(mx + x * sx, my + y * sy, r, 0, 7); ctx.fill(); };
  for (const c of G.policeCars) dot(c.x, c.y, '#5aa2ff', 2.4);
  const t = missionTarget();
  if (t) dot(t.x, t.y, '#ffd83d', 3.6);
  if (G.story.car) dot(G.story.car.x, G.story.car.y, '#ffcf3f', 3);
  dot(G.player.x, G.player.y, '#ffffff', 3.4);
}

function banner(title, sub, color) {
  ctx.fillStyle = 'rgba(8,6,14,0.72)'; ctx.fillRect(0, 0, VW, VH);
  ctx.textAlign = 'center';
  ctx.fillStyle = color; ctx.font = 'bold 84px system-ui, sans-serif';
  ctx.fillText(title, VW / 2, VH / 2 - 30);
  ctx.fillStyle = '#e8e3d8'; ctx.font = '20px system-ui, sans-serif';
  ctx.fillText(sub, VW / 2, VH / 2 + 24);
}

function render() {
  const city = G.city;
  G.cam.x = Math.max(0, Math.min(city.W - VW, G.player.x - VW / 2));
  G.cam.y = Math.max(0, Math.min(city.H - VH, G.player.y - VH / 2));
  if (G.mode === 'title') { G.cam.x = 1150; G.cam.y = 900; }
  drawCity(ctx, city, G.cam);
  const t = G.mode === 'play' || G.mode === 'pause' ? missionTarget() : null;
  if (G.mode !== 'title') drawMarker(t);
  for (const c of G.cars) drawCar(ctx, c, G.cam, G.time);
  for (const c of G.policeCars) drawCar(ctx, c, G.cam, G.time);
  for (const ped of G.peds) drawPerson(ctx, ped, G.cam);
  for (const cop of G.cops) drawPerson(ctx, cop, G.cam, { cop: true, uniform: '#2c3e70' });
  if (G.mode !== 'title') {
    if (!G.player.car) {
      drawPerson(ctx, G.player, G.cam);
      // The pistol, pointed at the mouse.
      ctx.strokeStyle = '#15161a'; ctx.lineWidth = 3;
      ctx.beginPath();
      ctx.moveTo(G.player.x - G.cam.x, G.player.y - G.cam.y);
      ctx.lineTo(G.player.x - G.cam.x + Math.cos(G.player.angle) * 15, G.player.y - G.cam.y + Math.sin(G.player.angle) * 15);
      ctx.stroke();
    } else {
      ctx.fillStyle = '#fff';
      const x = G.player.x - G.cam.x, y = G.player.y - G.cam.y - 30 + Math.sin(G.time * 5) * 3;
      ctx.beginPath(); ctx.moveTo(x, y + 8); ctx.lineTo(x - 6, y - 4); ctx.lineTo(x + 6, y - 4); ctx.closePath(); ctx.fill();
    }
  }
  drawBullets(ctx, G, G.cam);
  if (G.player.hurtFlash > 0) { ctx.fillStyle = `rgba(220,40,40,${G.player.hurtFlash * 0.55})`; ctx.fillRect(0, 0, VW, VH); }
  if (G.mode === 'play' || G.mode === 'pause') drawHUD(t);
  if (G.mode === 'title') {
    const grad = ctx.createLinearGradient(0, 0, 0, VH);
    grad.addColorStop(0, 'rgba(24,10,40,0.55)'); grad.addColorStop(1, 'rgba(8,6,14,0.82)');
    ctx.fillStyle = grad; ctx.fillRect(0, 0, VW, VH);
    ctx.textAlign = 'center';
    ctx.fillStyle = '#ffd83d'; ctx.font = 'bold 92px system-ui, sans-serif';
    ctx.fillText('SOLMAR HEAT', VW / 2, 240);
    ctx.fillStyle = '#ff8ab0'; ctx.font = 'bold 24px system-ui, sans-serif';
    ctx.fillText('An open-world crime caper in Port Solana', VW / 2, 286);
    ctx.fillStyle = '#e8e3d8'; ctx.font = '19px system-ui, sans-serif';
    ctx.fillText('Steal cars. Run jobs for Carmen Vega. Rob the Banco del Sol. Lose the heat.', VW / 2, 340);
    ctx.font = 'bold 22px system-ui, sans-serif'; ctx.fillStyle = '#7be495';
    ctx.fillText('ENTER — New game' + (loadSave() ? '        C — Continue' : ''), VW / 2, 430);
    ctx.fillStyle = 'rgba(255,255,255,0.75)'; ctx.font = '15px system-ui, sans-serif';
    ctx.fillText('WASD move / drive · E enter car, talk, buy · F punch · mouse aim, click to shoot', VW / 2, 480);
    ctx.fillText('Shift sprint · Space handbrake · P pause · Five stars is very bad news', VW / 2, 506);
  } else if (G.mode === 'pause') banner('PAUSED', 'Press P to keep playing', '#e8e3d8');
  else if (G.mode === 'busted') banner('BUSTED', `The Port Solana PD fined you $${G.bustedFine || 0}. Press ENTER to walk out of the station.`, '#5aa2ff');
  else if (G.mode === 'wasted') banner('WASTED', `Clínica del Sol patched you up for $${G.wastedFee || 0}. Press ENTER to leave.`, '#ff5040');
}

// ---------------- shot scenes (screenshots for the entry) ----------------

function setupShot(name) {
  const spots = G.city.spots;
  if (name === 'start') { G.mode = 'title'; return; }
  G.mode = 'play';
  if (name === 'roam') {
    G.player.x = G.city.roadsX[3]; G.player.y = G.city.roadsY[2] + 70;
    G.msg('Downtown Port Solana — the city is open.');
  } else if (name === 'chase') {
    const car = makeCar(G.rng, G.city.roadsX[3], G.city.roadsY[2], 'traffic');
    car.color = '#d94f3d'; car.angle = 0; car.kind = 'player'; car.stolen = true;
    G.cars.push(car); G.player.car = car; G.player.x = car.x; G.player.y = car.y;
    G.heat = 300;
    for (let i = 0; i < 3; i++) {
      const pc = makeCar(G.rng, car.x - 130 - i * 90, car.y + (i - 1) * 46, 'police');
      pc.angle = 0; pc.speed = 190; G.policeCars.push(pc);
    }
    G.msg('Three stars — the PD wants a word.');
  } else if (name === 'mission') {
    G.player.x = spots.club.x; G.player.y = spots.club.y + 26;
    startMission();
    G.player.x = G.city.roadsX[4]; G.player.y = G.city.roadsY[3] + 60;
  }
  // Let traffic, chasers and crowds settle into the frame.
  for (let i = 0; i < 70; i++) step(1 / 30);
  if (name === 'chase') { // settle the formation for the camera
    G.mode = 'play'; G.heat = 300; G.bust = 0.3;
    const car = G.player.car;
    G.policeCars.forEach((pc, i) => { pc.x = car.x - 120 - i * 85; pc.y = car.y + (i - 1) * 44; pc.angle = 0; pc.speed = 150; });
  }
  G.shotFrozen = true;
}

// ---------------- main loop ----------------

function step(dt) {
  G.time += dt;
  G.msgT = Math.max(0, G.msgT - dt);
  if (G.mode !== 'play') return;
  updatePlayer(dt);
  updateTraffic(G, dt);
  updatePeds(G, dt);
  updateWanted(dt);
  updatePoliceCars(G, dt);
  updateCops(G, dt);
  updateBullets(G, dt);
  updateMissions(dt);
  if (mouse.down) tryShoot();
  G.saveT += dt;
  if (G.saveT > 10) { G.saveT = 0; save(); }
}

let last = performance.now();
function frame(now) {
  const dt = Math.min(0.033, (now - last) / 1000 || 0.016);
  last = now;
  if (!G.shotFrozen) step(dt);
  render();
  requestAnimationFrame(frame);
}

if (SHOT) setupShot(SHOT);
requestAnimationFrame(frame);
