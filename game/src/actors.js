// Everyone who is not the player: traffic, pedestrians, police, bullets.
// They all read and poke the shared game state G (built in main.js) and call
// back through G.addHeat / G.hurtPlayer / G.msg / G.sfx.

import { collides, pushOut } from './city.js';

const CAR_COLORS = ['#d94f3d', '#3d7bd9', '#f2f2f2', '#2b2b30', '#e8b13c', '#57b06a', '#b45ad0', '#d97fb0', '#7a4a2b', '#9ad1e8'];
const SKIN = ['#f2c89b', '#c98a5a', '#8a5a34', '#f7d7b0', '#6e4525'];
const SHIRT = ['#d94f3d', '#3d7bd9', '#57b06a', '#e8e3d8', '#b45ad0', '#e8b13c', '#3dbdb0'];

export function makeCar(rng, x, y, kind) {
  return {
    x, y, angle: 0, speed: 0, kind, hp: 60,
    color: kind === 'sport' ? '#ffcf3f' : CAR_COLORS[Math.floor(rng() * CAR_COLORS.length)],
    axis: 'x', dir: 1, lane: 20, targetSpeed: 105 + rng() * 45, turnCool: 0,
  };
}

export function spawnTraffic(G, n) {
  const { city, rng } = G;
  for (let i = 0; i < n; i++) {
    const car = makeCar(rng, 0, 0, 'traffic');
    if (rng() < 0.5) { // vertical road, travelling along y
      const rx = city.roadsX[Math.floor(rng() * city.roadsX.length)];
      car.axis = 'y'; car.dir = rng() < 0.5 ? 1 : -1; car.lane = car.dir > 0 ? 20 : -20;
      car.x = rx + car.lane; car.y = 200 + rng() * 1800; car.angle = car.dir > 0 ? Math.PI / 2 : -Math.PI / 2;
    } else {
      const ry = city.roadsY[Math.floor(rng() * city.roadsY.length)];
      car.axis = 'x'; car.dir = rng() < 0.5 ? 1 : -1; car.lane = car.dir > 0 ? -20 : 20;
      car.y = ry + car.lane; car.x = 200 + rng() * 2900; car.angle = car.dir > 0 ? 0 : Math.PI;
    }
    G.cars.push(car);
  }
  // Parked cars along the kerbs, ready to steal.
  for (let i = 0; i < 16; i++) {
    const rx = city.roadsX[Math.floor(rng() * city.roadsX.length)];
    const car = makeCar(rng, rx + (rng() < 0.5 ? -38 : 38), 260 + rng() * 1750, 'parked');
    car.angle = Math.PI / 2; G.cars.push(car);
  }
}

function carAhead(G, car, gap) {
  const fx = car.x + Math.cos(car.angle) * gap, fy = car.y + Math.sin(car.angle) * gap;
  for (const o of G.cars) { if (o !== car && Math.abs(o.x - fx) < 30 && Math.abs(o.y - fy) < 30) return o; }
  const p = G.player;
  if (p.car && Math.abs(p.car.x - fx) < 32 && Math.abs(p.car.y - fy) < 32) return p.car;
  return null;
}

export function updateTraffic(G, dt) {
  const { city, rng } = G;
  for (const car of G.cars) {
    if (car.kind !== 'traffic') continue;
    car.turnCool -= dt;
    let want = car.targetSpeed;
    if (carAhead(G, car, 58)) want = 0;
    car.speed += Math.max(-260 * dt, Math.min(120 * dt, want - car.speed));
    if (car.axis === 'x') {
      car.x += car.dir * car.speed * dt;
      // Near a cross street? Sometimes turn onto it.
      for (const rx of city.roadsX) {
        if (Math.abs(car.x - rx) < 6 && car.turnCool <= 0 && rng() < 0.45) {
          car.axis = 'y'; car.x = rx + (car.dir > 0 ? 0 : 0); car.dir = rng() < 0.5 ? 1 : -1;
          car.lane = car.dir > 0 ? 20 : -20; car.x = rx + car.lane;
          car.angle = car.dir > 0 ? Math.PI / 2 : -Math.PI / 2; car.turnCool = 2; break;
        }
      }
      if (car.x < 90 || car.x > city.W - 90) { car.dir *= -1; car.angle = car.dir > 0 ? 0 : Math.PI; car.lane = car.dir > 0 ? -20 : 20; car.y += car.lane * 0 + (car.axis === 'x' ? 0 : 0); car.y = Math.round(car.y / 1); }
    } else {
      car.y += car.dir * car.speed * dt;
      for (const ry of city.roadsY) {
        if (Math.abs(car.y - ry) < 6 && car.turnCool <= 0 && rng() < 0.45) {
          car.axis = 'x'; car.y = ry; car.dir = rng() < 0.5 ? 1 : -1;
          car.lane = car.dir > 0 ? -20 : 20; car.y = ry + car.lane;
          car.angle = car.dir > 0 ? 0 : Math.PI; car.turnCool = 2; break;
        }
      }
      if (car.y < 90 || car.y > 2050) { car.dir *= -1; car.angle = car.dir > 0 ? Math.PI / 2 : -Math.PI / 2; car.lane = car.dir > 0 ? 20 : -20; }
    }
    // Keep the lane offset honest after turns and bounces.
    if (car.axis === 'x') { const ry = nearest(city.roadsY, car.y - car.lane); car.y += ((ry + car.lane) - car.y) * Math.min(1, dt * 3); }
    else { const rx = nearest(city.roadsX, car.x - car.lane); car.x += ((rx + car.lane) - car.x) * Math.min(1, dt * 3); }
  }
}
function nearest(arr, v) { let best = arr[0]; for (const a of arr) if (Math.abs(a - v) < Math.abs(best - v)) best = a; return best; }

// ---------------- pedestrians ----------------

export function spawnPeds(G, n) {
  const { city, rng } = G;
  for (let i = 0; i < n; i++) {
    let x = 0, y = 0, tries = 0;
    do { x = 120 + rng() * (city.W - 240); y = 120 + rng() * 1950; tries++; } while (collides(city, x, y, 10) && tries < 20);
    G.peds.push({
      x, y, angle: rng() * 6.28, hp: 30, state: 'walk', tx: x, ty: y, fleeT: 0,
      skin: SKIN[Math.floor(rng() * SKIN.length)], shirt: SHIRT[Math.floor(rng() * SHIRT.length)],
      speed: 52 + rng() * 30,
    });
  }
}

export function updatePeds(G, dt) {
  const { city, rng } = G;
  for (const p of G.peds) {
    if (p.state === 'down') continue;
    let sp = p.speed, tx = p.tx, ty = p.ty;
    if (p.state === 'flee') {
      p.fleeT -= dt;
      const dx = p.x - p.fleeX, dy = p.y - p.fleeY, d = Math.hypot(dx, dy) || 1;
      tx = p.x + (dx / d) * 120; ty = p.y + (dy / d) * 120; sp = 165;
      if (p.fleeT <= 0) p.state = 'walk';
    } else if (Math.hypot(p.x - tx, p.y - ty) < 8 || rng() < dt * 0.05) {
      p.tx = p.x + (rng() - 0.5) * 420; p.ty = p.y + (rng() - 0.5) * 420; tx = p.tx; ty = p.ty;
    }
    const dx = tx - p.x, dy = ty - p.y, d = Math.hypot(dx, dy);
    if (d > 2) {
      p.angle = Math.atan2(dy, dx);
      const nx = p.x + Math.cos(p.angle) * sp * dt, ny = p.y + Math.sin(p.angle) * sp * dt;
      if (!collides(city, nx, ny, 9)) { p.x = nx; p.y = ny; }
      else { p.tx = p.x + (rng() - 0.5) * 200; p.ty = p.y + (rng() - 0.5) * 200; }
    }
  }
}

export function scarePeds(G, x, y, r) {
  for (const p of G.peds) {
    if (p.state !== 'down' && Math.hypot(p.x - x, p.y - y) < r) { p.state = 'flee'; p.fleeX = x; p.fleeY = y; p.fleeT = 2.6; }
  }
}

// ---------------- police ----------------

export function updatePoliceCars(G, dt) {
  const p = G.player;
  const maxSpeed = 238 + G.stars * 14;
  for (const car of G.policeCars) {
    const dx = p.x - car.x, dy = p.y - car.y, d = Math.hypot(dx, dy) || 1;
    const want = Math.atan2(dy, dx);
    let da = want - car.angle;
    while (da > Math.PI) da -= Math.PI * 2; while (da < -Math.PI) da += Math.PI * 2;
    car.angle += Math.max(-2.6 * dt, Math.min(2.6 * dt, da));
    const target = d > 34 ? maxSpeed : maxSpeed * 0.35;
    car.speed += Math.max(-300 * dt, Math.min(170 * dt, target - car.speed));
    car.x += Math.cos(car.angle) * car.speed * dt;
    car.y += Math.sin(car.angle) * car.speed * dt;
    if (pushOut(G.city, car, 20)) car.speed *= 0.55;
  }
}

export function updateCops(G, dt) {
  const p = G.player;
  for (const cop of G.cops) {
    if (cop.state === 'down') continue;
    const dx = p.x - cop.x, dy = p.y - cop.y, d = Math.hypot(dx, dy) || 1;
    const playerFast = p.car && Math.abs(p.car.speed) > 70;
    if (!playerFast && d > 20) {
      const sp = 148 + G.stars * 7;
      const nx = cop.x + (dx / d) * sp * dt, ny = cop.y + (dy / d) * sp * dt;
      if (!collides(G.city, nx, ny, 9)) { cop.x = nx; cop.y = ny; }
      cop.angle = Math.atan2(dy, dx);
    }
    if (!p.car && d < 26) G.hurtPlayer(10 * dt, 'baton');
    // Armed response at three stars and up: slow, aimed shots.
    cop.shotT = (cop.shotT || 0) - dt;
    if (G.stars >= 3 && d < 330 && d > 40 && cop.shotT <= 0) {
      cop.shotT = 1.7 + Math.random() * 0.8;
      shoot(G, cop.x, cop.y, Math.atan2(dy, dx) + (Math.random() - 0.5) * 0.14, true);
    }
  }
}

// ---------------- bullets & particles ----------------

export function shoot(G, x, y, angle, foe) {
  G.bullets.push({ x, y, vx: Math.cos(angle) * 720, vy: Math.sin(angle) * 720, life: 0.55, foe });
  burst(G, x + Math.cos(angle) * 14, y + Math.sin(angle) * 14, 2, '#ffd76a', 60);
  G.sfx('shot');
}

export function burst(G, x, y, n, color, spd) {
  for (let i = 0; i < n; i++) {
    const a = Math.random() * 6.28, s = (0.3 + Math.random() * 0.7) * spd;
    G.parts.push({ x, y, vx: Math.cos(a) * s, vy: Math.sin(a) * s, life: 0.32, color });
  }
}

export function updateBullets(G, dt) {
  const hit = (o, r) => o && Math.hypot(o.x - b.x, o.y - b.y) < r;
  for (let i = G.bullets.length - 1; i >= 0; i--) {
    var b = G.bullets[i];
    b.x += b.vx * dt; b.y += b.vy * dt; b.life -= dt;
    let dead = b.life <= 0 || collides(G.city, b.x, b.y, 2);
    if (!dead && b.foe) {
      if (hit(G.player, 12) && !G.player.car) { G.hurtPlayer(6, 'shot'); dead = true; }
      else if (G.player.car && hit(G.player.car, 24)) { G.player.car.hp -= 4; dead = true; }
    } else if (!dead) {
      for (const ped of G.peds) {
        if (ped.state !== 'down' && hit(ped, 11)) { damagePed(G, ped, 34); dead = true; break; }
      }
      if (!dead) for (const cop of G.cops) {
        if (cop.state !== 'down' && hit(cop, 11)) {
          cop.hp -= 34; G.addHeat(120); burst(G, cop.x, cop.y, 5, '#c03a3a', 90);
          if (cop.hp <= 0) { cop.state = 'down'; G.msg('Officer down! The heat is on.'); }
          dead = true; break;
        }
      }
      if (!dead) for (const car of [...G.cars, ...G.policeCars]) {
        if (hit(car, 24)) { car.hp -= 6; burst(G, b.x, b.y, 3, '#ffb35a', 80); dead = true; break; }
      }
    }
    if (dead) { burst(G, b.x, b.y, 2, '#ffe9a8', 50); G.bullets.splice(i, 1); }
  }
  for (let i = G.parts.length - 1; i >= 0; i--) {
    const pt = G.parts[i]; pt.x += pt.vx * dt; pt.y += pt.vy * dt; pt.life -= dt;
    if (pt.life <= 0) G.parts.splice(i, 1);
  }
}

export function damagePed(G, ped, dmg) {
  ped.hp -= dmg;
  burst(G, ped.x, ped.y, 5, '#c03a3a', 90);
  if (ped.hp <= 0 && ped.state !== 'down') {
    ped.state = 'down'; G.addHeat(150); G.msg('You flattened a pedestrian!'); scarePeds(G, ped.x, ped.y, 220);
  } else { G.addHeat(60); ped.state = 'flee'; ped.fleeX = G.player.x; ped.fleeY = G.player.y; ped.fleeT = 3; }
}

// ---------------- drawing ----------------

export function drawCar(ctx, car, cam, time) {
  const x = car.x - cam.x, y = car.y - cam.y;
  if (x < -70 || y < -70 || x > ctx.canvas.width + 70 || y > ctx.canvas.height + 70) return;
  ctx.save(); ctx.translate(x, y); ctx.rotate(car.angle);
  ctx.fillStyle = 'rgba(0,0,0,0.3)'; ctx.fillRect(-19, -8, 42, 21);
  ctx.fillStyle = car.kind === 'police' ? '#20242c' : car.color;
  roundRect(ctx, -21, -11, 42, 22, 6); ctx.fill();
  if (car.kind === 'police') { ctx.fillStyle = '#f2f2f2'; roundRect(ctx, -6, -11, 15, 22, 4); ctx.fill(); }
  ctx.fillStyle = '#bfe6f5'; roundRect(ctx, 2, -8, 8, 16, 3); ctx.fill();   // windshield
  ctx.fillStyle = '#22242a'; roundRect(ctx, -13, -8, 6, 16, 2); ctx.fill(); // rear window
  ctx.fillStyle = '#15161a';
  for (const [wx, wy] of [[-13, -12], [12, -12], [-13, 9], [12, 9]]) ctx.fillRect(wx, wy, 8, 4);
  if (car.kind === 'police') {
    ctx.fillStyle = Math.floor(time * 4) % 2 ? '#ff4040' : '#4080ff';
    ctx.fillRect(-3, -3, 7, 6);
  }
  if (car.hp < 25) { ctx.fillStyle = 'rgba(40,40,40,0.55)'; roundRect(ctx, -21, -11, 16, 22, 6); ctx.fill(); }
  ctx.restore();
}
function roundRect(ctx, x, y, w, h, r) {
  ctx.beginPath();
  ctx.moveTo(x + r, y); ctx.arcTo(x + w, y, x + w, y + h, r); ctx.arcTo(x + w, y + h, x, y + h, r);
  ctx.arcTo(x, y + h, x, y, r); ctx.arcTo(x, y, x + w, y, r); ctx.closePath();
}

export function drawPerson(ctx, o, cam, opts = {}) {
  const x = o.x - cam.x, y = o.y - cam.y;
  if (x < -30 || y < -30 || x > ctx.canvas.width + 30 || y > ctx.canvas.height + 30) return;
  ctx.save(); ctx.translate(x, y);
  if (o.state === 'down') {
    ctx.rotate(o.angle || 0); ctx.fillStyle = o.shirt || '#555';
    roundRect(ctx, -11, -5, 22, 10, 5); ctx.fill();
    ctx.fillStyle = o.skin || '#c98a5a'; ctx.beginPath(); ctx.arc(14, 0, 5, 0, 7); ctx.fill();
    ctx.restore(); return;
  }
  ctx.fillStyle = 'rgba(0,0,0,0.25)'; ctx.beginPath(); ctx.arc(1, 2, 8, 0, 7); ctx.fill();
  ctx.fillStyle = opts.uniform || o.shirt || '#888';
  ctx.beginPath(); ctx.arc(0, 0, 8, 0, 7); ctx.fill();
  ctx.fillStyle = o.skin || '#c98a5a'; ctx.beginPath(); ctx.arc(0, 0, 4.6, 0, 7); ctx.fill();
  if (opts.cop) { ctx.fillStyle = '#20386b'; ctx.beginPath(); ctx.arc(0, 0, 5.4, Math.PI, 0); ctx.fill(); }
  ctx.restore();
}

export function drawBullets(ctx, G, cam) {
  ctx.fillStyle = '#ffe9a8';
  for (const b of G.bullets) ctx.fillRect(b.x - cam.x - 2, b.y - cam.y - 2, 4, 4);
  for (const pt of G.parts) { ctx.fillStyle = pt.color; ctx.fillRect(pt.x - cam.x - 2, pt.y - cam.y - 2, 4, 4); }
}
