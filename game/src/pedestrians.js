// The people of Port Solana: they stroll the sidewalks, the park and the promenade, run when
// violence starts near them, and keep the streets feeling lived in. Foot police are pedestrians
// with role 'cop'; the police system drives those, this file drives everyone else.

import { CITY_W } from './config.js';
import { CITY_H, collideWorld, onSidewalk } from './city.js';
import { pick, range } from './random.js';

const SHIRTS = ['#e2725b', '#5b8e7d', '#f4d35e', '#ee964b', '#7fb5b5', '#c1666b', '#ece5d8', '#4f772d', '#bc6c25'];
const SKIN = ['#f1c27d', '#e0ac69', '#c68642', '#8d5524', '#ffdbac'];

export function makePed(random, x, y, role = 'civilian') {
  return {
    x, y, angle: range(random, 0, Math.PI * 2),
    speed: 0, walkSpeed: range(random, 52, 88),
    shirt: role === 'cop' ? '#2b4a73' : pick(random, SHIRTS),
    skin: pick(random, SKIN),
    role, health: role === 'cop' ? 60 : 40,
    state: 'walk', // 'walk' | 'flee' | 'down'
    targetX: x, targetY: y, retarget: 0,
    fleeX: 0, fleeY: 0, fleeTime: 0,
    shootCd: range(random, 0.4, 1.2),
    dead: false, downTime: 0,
    phase: range(random, 0, Math.PI * 2), // leg-swing phase for the walk cycle
  };
}

/** A random point a pedestrian would plausibly walk to: sidewalk, park lawn or the promenade. */
function strollTarget(state) {
  const { random } = state;
  for (let tries = 0; tries < 10; tries += 1) {
    const x = state.player.x + range(random, -560, 560);
    const y = state.player.y + range(random, -560, 560);
    if (x < 20 || x > CITY_W - 20 || y < 20 || y > CITY_H + 150) continue;
    if (onSidewalk(x, y) || y > CITY_H || (x > state.city.park.x && x < state.city.park.x + state.city.park.w && y > state.city.park.y && y < state.city.park.y + state.city.park.h)) {
      return { x, y };
    }
  }
  return null;
}

export function seedPeds(state) {
  for (let i = 0; i < 22; i += 1) {
    const target = strollTarget(state);
    if (target) state.peds.push(makePed(state.random, target.x, target.y));
  }
}

/** Startle everyone near a point: gunshots, punches and crashes send the crowd running. */
export function scarePeds(state, x, y, radius = 190) {
  for (const ped of state.peds) {
    if (ped.dead || ped.role === 'cop') continue;
    if (Math.hypot(ped.x - x, ped.y - y) < radius) {
      ped.state = 'flee';
      ped.fleeX = x;
      ped.fleeY = y;
      ped.fleeTime = range(state.random, 1.6, 3.2);
    }
  }
}

export function updatePeds(state, dt) {
  const { random } = state;
  for (const ped of state.peds) {
    if (ped.dead || ped.role === 'cop') continue;
    if (ped.state === 'down') {
      ped.downTime -= dt;
      if (ped.downTime <= 0) { ped.state = 'walk'; ped.health = 40; }
      continue;
    }
    let targetSpeed = ped.walkSpeed;
    if (ped.state === 'flee') {
      ped.fleeTime -= dt;
      ped.targetX = ped.x + (ped.x - ped.fleeX) * 2;
      ped.targetY = ped.y + (ped.y - ped.fleeY) * 2;
      targetSpeed = 205;
      if (ped.fleeTime <= 0) ped.state = 'walk';
    } else {
      ped.retarget -= dt;
      const arrived = Math.hypot(ped.targetX - ped.x, ped.targetY - ped.y) < 14;
      if (arrived || ped.retarget <= 0) {
        const target = strollTarget(state);
        if (target) { ped.targetX = target.x; ped.targetY = target.y; }
        ped.retarget = range(random, 4, 9);
      }
    }
    const dx = ped.targetX - ped.x;
    const dy = ped.targetY - ped.y;
    const dist = Math.hypot(dx, dy);
    if (dist > 2) {
      const wanted = Math.atan2(dy, dx);
      let diff = Math.atan2(Math.sin(wanted - ped.angle), Math.cos(wanted - ped.angle));
      ped.angle += Math.max(-6 * dt, Math.min(6 * dt, diff));
      ped.speed += Math.max(-600 * dt, Math.min(600 * dt, targetSpeed - ped.speed));
    } else {
      ped.speed = Math.max(0, ped.speed - 600 * dt);
    }
    ped.x += Math.cos(ped.angle) * ped.speed * dt;
    ped.y += Math.sin(ped.angle) * ped.speed * dt;
    ped.phase += ped.speed * dt * 0.11;
    collideWorld(state.city, ped, 10);
  }
  // Thin out the far crowd, top up the near one.
  for (let i = state.peds.length - 1; i >= 0; i -= 1) {
    const ped = state.peds[i];
    if (ped.role === 'civilian' && !ped.dead && Math.hypot(ped.x - state.player.x, ped.y - state.player.y) > 1250) state.peds.splice(i, 1);
  }
  const civilians = state.peds.filter((p) => p.role === 'civilian' && !p.dead).length;
  if (civilians < 20 && random() < dt * 2) {
    const target = strollTarget(state);
    if (target) state.peds.push(makePed(random, target.x, target.y));
  }
}
