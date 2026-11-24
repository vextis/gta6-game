// The law in Port Solana: a heat-and-stars wanted system fed by witnessed crimes, patrol cars
// that hunt the player down, foot officers who shoot at high wanted levels, and the bust meter
// that fills when an officer gets close to a player who is not getting away.

import { WANTED } from './config.js';
import { collideWorld, pointInBuilding, roadCenterX, roadCenterY } from './city.js';
import { makePed } from './pedestrians.js';
import { makeCar } from './vehicles.js';
import { range } from './random.js';

export const POLICE_MODEL = { name: 'Patrulla Municipal', colors: ['#eef1f4'], speed: 338, accel: 1.18 };

// How much heat each crime adds; a crime nobody sees still counts, but for less.
const CRIMES = {
  theft: 0.7, punch: 0.55, shoot: 0.8, kill: 1.3, runover: 1.3,
  copHit: 1.6, carCrash: 0.25, robbery: 5, vandal: 0.4,
};

export function createWanted() {
  return { heat: 0, stars: 0, lastCrimeAt: -99, seenByCop: false, bustMeter: 0, copSpawnTimer: 0, footSpawnTimer: 0 };
}

/** Register a crime. Witnesses (a cop or civilian within sight) make it count in full. */
export function addCrime(state, kind) {
  const wanted = state.wanted;
  let witnessed = false;
  for (const ped of state.peds) {
    if (!ped.dead && Math.hypot(ped.x - state.player.x, ped.y - state.player.y) < WANTED.sightRange) { witnessed = true; break; }
  }
  if (!witnessed) {
    for (const car of state.cars) {
      if (car.kind === 'police' && Math.hypot(car.x - state.player.x, car.y - state.player.y) < WANTED.sightRange + 80) { witnessed = true; break; }
    }
  }
  const amount = (CRIMES[kind] ?? 0.3) * (witnessed ? 1 : 0.45);
  wanted.heat = Math.min(WANTED.maxStars, wanted.heat + amount);
  wanted.lastCrimeAt = state.time;
  wanted.stars = Math.max(wanted.stars, Math.ceil(wanted.heat - 0.001));
}

/** Forget everything: Pay 'n Spray, a finished escape, a bust or a hospital visit. */
export function clearWanted(state) {
  state.wanted.heat = 0;
  state.wanted.stars = 0;
  state.wanted.bustMeter = 0;
}

function playerTarget(state) {
  return state.player.car ?? state.player;
}

/** Spawn a patrol car on a road a few blocks from the player. */
function spawnPoliceCar(state) {
  const { random } = state;
  for (let tries = 0; tries < 10; tries += 1) {
    const vertical = random() < 0.5;
    const x = vertical ? roadCenterX(Math.floor(random() * 7)) : range(random, 80, 1900);
    const y = vertical ? range(random, 80, 1500) : roadCenterY(Math.floor(random() * 6));
    const dist = Math.hypot(x - state.player.x, y - state.player.y);
    if (dist < 480 || dist > 900) continue;
    const car = makeCar(random, x, y, Math.atan2(state.player.y - y, state.player.x - x), 'police', POLICE_MODEL);
    car.livery = 'police';
    state.cars.push(car);
    return;
  }
}

export function updateWanted(state, dt) {
  const wanted = state.wanted;
  const target = playerTarget(state);

  // Is any officer watching right now? Heat only cools while nobody is.
  wanted.seenByCop = false;
  for (const car of state.cars) {
    if (car.kind === 'police' && !car.dead && Math.hypot(car.x - target.x, car.y - target.y) < WANTED.sightRange + 60) wanted.seenByCop = true;
  }
  for (const ped of state.peds) {
    if (ped.role === 'cop' && !ped.dead && Math.hypot(ped.x - target.x, ped.y - target.y) < WANTED.sightRange) wanted.seenByCop = true;
  }
  if (state.time - wanted.lastCrimeAt > 6 && !wanted.seenByCop && wanted.stars > 0) {
    wanted.heat = Math.max(0, wanted.heat - WANTED.decayPerSecond * dt * (wanted.stars >= 4 ? 0.55 : 1));
  }
  wanted.stars = wanted.heat <= 0 ? 0 : Math.min(WANTED.maxStars, Math.ceil(wanted.heat - 0.001));

  // Keep the response proportional to the stars.
  const policeCars = state.cars.filter((c) => c.kind === 'police' && !c.dead);
  const wantedCars = wanted.stars === 0 ? 0 : Math.min(6, wanted.stars + 1);
  wanted.copSpawnTimer -= dt;
  if (policeCars.length < wantedCars && wanted.copSpawnTimer <= 0) {
    spawnPoliceCar(state);
    wanted.copSpawnTimer = 1.4;
  }
  if (wanted.stars === 0) {
    // Stand down: patrol cars peel off and become ordinary traffic, foot cops melt away.
    for (const car of policeCars) if (Math.hypot(car.x - target.x, car.y - target.y) > 420) car.kind = 'traffic';
    for (let i = state.peds.length - 1; i >= 0; i -= 1) {
      const ped = state.peds[i];
      if (ped.role === 'cop' && Math.hypot(ped.x - target.x, ped.y - target.y) > 380) state.peds.splice(i, 1);
    }
  }
  // Foot officers join at three stars and up.
  const footCops = state.peds.filter((p) => p.role === 'cop' && !p.dead);
  wanted.footSpawnTimer -= dt;
  if (wanted.stars >= 3 && footCops.length < wanted.stars - 1 && wanted.footSpawnTimer <= 0) {
    const angle = range(state.random, 0, Math.PI * 2);
    const cop = makePed(state.random, target.x + Math.cos(angle) * 430, target.y + Math.sin(angle) * 430, 'cop');
    collideWorld(state.city, cop, 10);
    state.peds.push(cop);
    wanted.footSpawnTimer = 2.2;
  }

  // The bust meter: close, sustained contact with a slow or cornered player.
  let contact = false;
  if (!state.player.car) {
    for (const car of policeCars) if (Math.hypot(car.x - target.x, car.y - target.y) < 62) contact = true;
    for (const ped of footCops) if (Math.hypot(ped.x - target.x, ped.y - target.y) < 46) contact = true;
  } else if (Math.abs(state.player.car.speed) < 26) {
    for (const car of policeCars) if (Math.hypot(car.x - target.x, car.y - target.y) < 74) contact = true;
  }
  const playerSpeed = state.player.car ? Math.abs(state.player.car.speed) : Math.hypot(state.player.vx, state.player.vy);
  if (contact && playerSpeed < 130 && wanted.stars > 0) {
    wanted.bustMeter += dt / WANTED.bustFillTime;
    if (wanted.bustMeter >= 1) state.flags.busted = true;
  } else {
    wanted.bustMeter = Math.max(0, wanted.bustMeter - dt * 0.7);
  }
}

const wrapAngle = (a) => Math.atan2(Math.sin(a), Math.cos(a));

/** Patrol cars hunt: steer at where the player is heading, ram when close, box in when closer. */
export function updatePoliceCars(state, dt) {
  const target = playerTarget(state);
  const lead = state.player.car ? 0.35 : 0.12;
  const aimX = target.x + (state.player.car ? Math.cos(target.angle) * target.speed * lead : state.player.vx * lead);
  const aimY = target.y + (state.player.car ? Math.sin(target.angle) * target.speed * lead : state.player.vy * lead);
  for (const car of state.cars) {
    if (car.kind !== 'police' || car.dead) continue;
    if (state.wanted.stars === 0) {
      // Standing down: peel away from the player at cruising speed until traffic rules take over.
      const awayX = car.x + (car.x - target.x) * 2;
      const awayY = car.y + (car.y - target.y) * 2;
      const awayAngle = Math.atan2(awayY - car.y, awayX - car.x);
      const awayDiff = wrapAngle(awayAngle - car.angle);
      car.angle += Math.max(-2.4 * dt, Math.min(2.4 * dt, awayDiff));
      car.speed += Math.max(-300 * dt, Math.min(300 * dt, 150 - car.speed));
      car.x += Math.cos(car.angle) * car.speed * dt;
      car.y += Math.sin(car.angle) * car.speed * dt;
      collideWorld(state.city, car, 20);
      continue;
    }
    const dist = Math.hypot(aimX - car.x, aimY - car.y);
    const wanted = Math.atan2(aimY - car.y, aimX - car.x);
    const diff = wrapAngle(wanted - car.angle);
    car.angle += Math.max(-3.1 * dt, Math.min(3.1 * dt, diff));
    let top = car.model.speed * (car.health < 30 ? 0.5 : 1);
    if (!state.player.car && dist < 60) top = 95; // roll up to make the arrest, not the kill
    if (Math.abs(diff) > 1.2) top = Math.min(top, 90);
    const rate = top > car.speed ? 300 : 560;
    car.speed += Math.max(-rate * dt, Math.min(rate * dt, top - car.speed));
    const startX = car.x;
    const startY = car.y;
    car.x += Math.cos(car.angle) * car.speed * dt;
    car.y += Math.sin(car.angle) * car.speed * dt;
    collideWorld(state.city, car, 20);
    const travelled = Math.hypot(car.x - startX, car.y - startY);
    if (travelled < Math.abs(car.speed) * dt * 0.25 && Math.abs(car.speed) > 50) car.speed *= -0.3; // wedged on a wall: back off
  }
}

/** Foot officers keep their distance, strafe, and fire on the player at three stars and up. */
export function updateFootCops(state, dt, fireBullet) {
  const target = playerTarget(state);
  for (const cop of state.peds) {
    if (cop.role !== 'cop' || cop.dead) continue;
    if (cop.state === 'down') {
      cop.downTime -= dt;
      if (cop.downTime <= 0) cop.dead = true; // stays down; removed by the caller's sweep
      continue;
    }
    const dx = target.x - cop.x;
    const dy = target.y - cop.y;
    const dist = Math.hypot(dx, dy) || 1;
    let moveX = 0;
    let moveY = 0;
    if (dist > 210) { moveX = dx / dist; moveY = dy / dist; }
    else if (dist < 120) { moveX = -dx / dist; moveY = -dy / dist; }
    else { moveX = -dy / dist * 0.5; moveY = dx / dist * 0.5; } // strafe
    const speed = state.wanted.stars >= 4 ? 168 : 148;
    cop.x += moveX * speed * dt;
    cop.y += moveY * speed * dt;
    cop.angle = Math.atan2(dy, dx);
    cop.phase += speed * dt * 0.11;
    collideWorld(state.city, cop, 10);

    cop.shootCd -= dt;
    if (cop.shootCd <= 0 && dist < 320 && state.wanted.stars >= 3) {
      const blocked = pointInBuilding(state.city, cop.x + dx * 0.5, cop.y + dy * 0.5);
      if (!blocked) {
        fireBullet(state, cop, target);
        cop.shootCd = range(state.random, 0.85, 1.5);
      } else {
        cop.shootCd = 0.3;
      }
    }
  }
}
