// Cars: the factory that builds them, the traffic that drives itself around Port Solana's grid,
// the arcade physics of the car the player is driving, and the collisions between all of them.

import { CAR, CITY_W, PITCH, ROAD } from './config.js';
import { CITY_H, collideWorld, roadCenterX, roadCenterY } from './city.js';
import { pick, range } from './random.js';

// Original Port Solana models — name, paint choices and how lively the engine feels.
export const CAR_MODELS = [
  { name: 'Roca Compacto', colors: ['#c94f43', '#4f7ec9', '#e0e0e0', '#5aa469', '#e3b341'], speed: 265, accel: 1.0 },
  { name: 'Vega Sedán', colors: ['#31435c', '#7a8899', '#20242a', '#8c2f39', '#d8d3c3'], speed: 300, accel: 1.05 },
  { name: 'Brisa Roadster', colors: ['#f2a541', '#d1495b', '#30638f', '#ece5d8'], speed: 355, accel: 1.25 },
  { name: 'Duna Pickup', colors: ['#6b705c', '#a26769', '#495867', '#bb6b3f'], speed: 275, accel: 0.95 },
  { name: 'Taxi Sol', colors: ['#f4c542'], speed: 290, accel: 1.0 },
];

export function makeCar(random, x, y, angle, kind, model = null) {
  const chosen = model ?? pick(random, CAR_MODELS);
  return {
    x, y, angle, speed: 0,
    model: chosen,
    color: pick(random, chosen.colors),
    kind, // 'traffic' | 'parked' | 'police'
    health: CAR.maxHealth,
    // traffic brain
    dirX: Math.round(Math.cos(angle)), dirY: Math.round(Math.sin(angle)),
    targetX: x, targetY: y, cruise: range(random, 0.55, 0.85),
    stuckTime: 0,
    honk: 0,
    dead: false,
  };
}

/** Lane offset for right-hand traffic: heading (dx,dy) keeps this far to its own right. */
function laneOffset(dirX, dirY) {
  return { x: -dirY * (ROAD / 4), y: dirX * (ROAD / 4) };
}

/** Choose the next intersection waypoint for a traffic car at a crossing. */
function nextWaypoint(car, random) {
  const col = Math.round((car.x - ROAD / 2) / PITCH);
  const row = Math.round((car.y - ROAD / 2) / PITCH);
  const options = [];
  // Straight on, plus either turn, staying inside the road network.
  const straight = { dx: car.dirX, dy: car.dirY };
  const left = { dx: car.dirY, dy: -car.dirX };
  const right = { dx: -car.dirY, dy: car.dirX };
  for (const [dir, weight] of [[straight, 5], [left, 2], [right, 2]]) {
    const nc = col + dir.dx;
    const nr = row + dir.dy;
    if (nc >= 0 && nc <= 6 && nr >= 0 && nr <= 5) for (let i = 0; i < weight; i += 1) options.push(dir);
  }
  if (options.length === 0) { // dead end of the grid: turn around
    car.dirX *= -1; car.dirY *= -1;
  } else {
    const dir = pick(random, options);
    car.dirX = dir.dx; car.dirY = dir.dy;
  }
  const lane = laneOffset(car.dirX, car.dirY);
  car.targetX = roadCenterX(Math.round((car.x - ROAD / 2) / PITCH) + car.dirX) + lane.x;
  car.targetY = roadCenterY(Math.round((car.y - ROAD / 2) / PITCH) + car.dirY) + lane.y;
}

/** Fill the city's parking spots with stealable cars and seed the first traffic. */
export function seedCars(state) {
  const { random, city } = state;
  for (const spot of city.parkingSpots) {
    if (random() < 0.62) state.cars.push(makeCar(random, spot.x, spot.y, spot.angle, 'parked'));
  }
  for (let i = 0; i < 14; i += 1) spawnTrafficCar(state, true);
}

/** Add one traffic car on a road somewhere, anywhere when `anywhere` else far from the player. */
export function spawnTrafficCar(state, anywhere = false) {
  const { random } = state;
  for (let tries = 0; tries < 12; tries += 1) {
    const vertical = random() < 0.5;
    const roadI = Math.floor(random() * 7);
    const roadJ = Math.floor(random() * 6);
    const x = vertical ? roadCenterX(roadI) : range(random, 60, CITY_W - 60);
    const y = vertical ? range(random, 60, CITY_H - 60) : roadCenterY(roadJ);
    const dist = Math.hypot(x - state.player.x, y - state.player.y);
    if (!anywhere && dist < 520) continue;
    if (anywhere && dist < 240) continue;
    const angle = vertical ? (random() < 0.5 ? Math.PI / 2 : -Math.PI / 2) : (random() < 0.5 ? 0 : Math.PI);
    const car = makeCar(random, x, y, angle, 'traffic');
    nextWaypoint(car, random);
    state.cars.push(car);
    return car;
  }
  return null;
}

const wrapAngle = (a) => Math.atan2(Math.sin(a), Math.cos(a));

/** Move one car forward by its speed and heading, with building collision. Returns how far the
 *  car actually travelled, which is ~0 when it is wedged against a wall. */
function advanceCar(state, car, dt) {
  const startX = car.x;
  const startY = car.y;
  car.x += Math.cos(car.angle) * car.speed * dt;
  car.y += Math.sin(car.angle) * car.speed * dt;
  collideWorld(state.city, car, 20);
  return Math.hypot(car.x - startX, car.y - startY);
}

/** Traffic: follow lane waypoints, brake for whatever is ahead, recover when wedged. */
export function updateTraffic(state, dt) {
  const { random } = state;
  for (const car of state.cars) {
    if (car.kind !== 'traffic' || car.dead) continue;
    const toTarget = Math.hypot(car.targetX - car.x, car.targetY - car.y);
    if (toTarget < 34) nextWaypoint(car, random);
    const wanted = Math.atan2(car.targetY - car.y, car.targetX - car.x);
    const diff = wrapAngle(wanted - car.angle);
    car.angle += Math.max(-2.4 * dt, Math.min(2.4 * dt, diff));

    // Something ahead? A car, a pedestrian, the player — brake and wait.
    const aheadX = car.x + Math.cos(car.angle) * 58;
    const aheadY = car.y + Math.sin(car.angle) * 58;
    let blocked = false;
    for (const other of state.cars) {
      if (other !== car && Math.hypot(other.x - aheadX, other.y - aheadY) < 30) { blocked = true; break; }
    }
    if (!blocked && Math.hypot(state.player.x - aheadX, state.player.y - aheadY) < 26 && !state.player.car) blocked = true;
    if (!blocked) for (const ped of state.peds) {
      if (!ped.dead && Math.hypot(ped.x - aheadX, ped.y - aheadY) < 22) { blocked = true; break; }
    }

    const topSpeed = car.model.speed * car.cruise * (blocked ? 0 : 1);
    const rate = blocked ? CAR.brake : CAR.accel * car.model.accel * 0.55;
    car.speed += Math.max(-rate * dt, Math.min(rate * dt, topSpeed - car.speed));
    if (Math.abs(diff) > 1.1) car.speed = Math.min(car.speed, 60); // creep around corners
    const moved = advanceCar(state, car, dt);
    if (car.speed > 40 && moved < car.speed * dt * 0.25) {
      car.stuckTime += dt;
      if (car.stuckTime > 0.9) { // wedged: reverse a touch and pick a fresh waypoint
        car.speed = -70;
        car.stuckTime = 0;
        nextWaypoint(car, random);
      }
    } else car.stuckTime = Math.max(0, car.stuckTime - dt);
  }
  // Keep the streets populated: replace traffic that wandered too far away.
  for (let i = state.cars.length - 1; i >= 0; i -= 1) {
    const car = state.cars[i];
    if (car.kind === 'traffic' && Math.hypot(car.x - state.player.x, car.y - state.player.y) > 1500) state.cars.splice(i, 1);
  }
  const trafficCount = state.cars.filter((c) => c.kind === 'traffic' && !c.dead).length;
  if (trafficCount < 13 && random() < dt * 1.5) spawnTrafficCar(state);
}

/** The player's driving: throttle, brake/reverse, steering that bites harder with speed. */
export function drivePlayerCar(state, car, input, dt) {
  const throttle = input.down('KeyW', 'ArrowUp');
  const brake = input.down('KeyS', 'ArrowDown');
  const left = input.down('KeyA', 'ArrowLeft');
  const right = input.down('KeyD', 'ArrowRight');
  const handbrake = input.down('Space');
  const top = car.model.speed * (car.health < 30 ? 0.55 : 1);

  if (throttle) car.speed += CAR.accel * car.model.accel * dt;
  if (brake) car.speed -= (car.speed > 12 ? CAR.brake : CAR.accel * 0.7) * dt;
  car.speed = Math.max(-CAR.reverse, Math.min(top, car.speed));
  if (!throttle && !brake) {
    const drag = CAR.drag * car.speed * dt + Math.sign(car.speed) * 14 * dt;
    car.speed -= Math.abs(drag) > Math.abs(car.speed) ? car.speed : drag;
  }
  if (handbrake) car.speed -= car.speed * 1.6 * dt;

  const steerInput = (left ? -1 : 0) + (right ? 1 : 0);
  const speedRatio = Math.min(1, Math.abs(car.speed) / 160);
  const grip = handbrake ? 1.5 : 1;
  if (steerInput !== 0 && car.speed !== 0) {
    car.angle += steerInput * CAR.gripTurn * grip * speedRatio * dt * Math.sign(car.speed);
  }
  const moved = advanceCar(state, car, dt);
  if (Math.abs(car.speed) > 60 && moved < Math.abs(car.speed) * dt * 0.3) {
    // Hit something solid at speed: crunch.
    car.health -= Math.abs(car.speed) * 0.06;
    state.shake = Math.min(9, Math.abs(car.speed) * 0.03);
    state.sound.crash(Math.min(1, Math.abs(car.speed) / 220));
    spawnSparks(state, car.x + Math.cos(car.angle) * 22, car.y + Math.sin(car.angle) * 22, 8);
    car.speed *= -0.25;
  }
  if (car.health <= 0 && !car.dead) {
    car.dead = true;
    car.speed = 0;
    spawnSmoke(state, car.x, car.y, 14);
  }
}

/** Car-to-car bumps: circles push apart, swap a little speed, dent both and spark. */
export function collideCars(state) {
  const cars = state.cars;
  for (let i = 0; i < cars.length; i += 1) {
    for (let j = i + 1; j < cars.length; j += 1) {
      const a = cars[i];
      const b = cars[j];
      const dx = b.x - a.x;
      const dy = b.y - a.y;
      const dist = Math.hypot(dx, dy);
      const minDist = 40;
      if (dist === 0 || dist >= minDist) continue;
      const nx = dx / dist;
      const ny = dy / dist;
      const overlap = (minDist - dist) / 2;
      const aFixed = a.kind === 'parked';
      const bFixed = b.kind === 'parked';
      if (!aFixed) { a.x -= nx * overlap; a.y -= ny * overlap; }
      if (!bFixed) { b.x += nx * overlap; b.y += ny * overlap; }
      const impact = Math.abs(a.speed - b.speed);
      if (impact > 55) {
        a.health -= impact * 0.05;
        b.health -= impact * 0.05;
        state.sound.crash(Math.min(1, impact / 260));
        spawnSparks(state, (a.x + b.x) / 2, (a.y + b.y) / 2, 6);
        if (state.player.car === a || state.player.car === b) state.shake = Math.min(7, impact * 0.02);
      }
      const swap = (a.speed + b.speed) / 2;
      if (!aFixed) a.speed = swap * 0.8;
      if (!bFixed) b.speed = swap * 0.8;
    }
  }
}

export function spawnSparks(state, x, y, count) {
  for (let i = 0; i < count; i += 1) {
    const a = state.random() * Math.PI * 2;
    const s = 40 + state.random() * 130;
    state.fx.push({ x, y, vx: Math.cos(a) * s, vy: Math.sin(a) * s, life: 0, maxLife: 0.3 + state.random() * 0.25, color: '#ffd76a', size: 2.2, drag: 3 });
  }
}

export function spawnSmoke(state, x, y, count) {
  for (let i = 0; i < count; i += 1) {
    state.fx.push({
      x: x + (state.random() - 0.5) * 14, y: y + (state.random() - 0.5) * 14,
      vx: (state.random() - 0.5) * 16, vy: -22 - state.random() * 26,
      life: 0, maxLife: 0.9 + state.random() * 0.9, color: 'rgba(70,70,75,0.5)', size: 7 + state.random() * 8, drag: 0.4,
    });
  }
}
