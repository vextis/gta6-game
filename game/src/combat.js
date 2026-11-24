// Combat: the player's fists and pistol, police gunfire, bullets in flight, and every kind of
// damage the world can take — people fall, cars dent and smoke, and most of it is a crime if
// anyone is watching.

import { PLAYER } from './config.js';
import { pointInBuilding } from './city.js';
import { addCrime } from './police.js';
import { scarePeds } from './pedestrians.js';
import { spawnSparks } from './vehicles.js';

/** Drop a glowing pickup (cash, health, armour, ammo) that the player collects by walking over it. */
export function spawnPickup(state, x, y, kind, amount = 0) {
  state.pickups.push({ x, y, kind, amount, bob: state.random() * Math.PI * 2 });
}

export function spawnBullet(state, x, y, angle, fromPlayer, damage = 34) {
  state.bullets.push({
    x, y,
    vx: Math.cos(angle) * 920, vy: Math.sin(angle) * 920,
    life: 0.55, fromPlayer, damage,
  });
}

/** A foot officer's shot at the player: aimed at the chest with a human amount of spread. */
export function fireCopBullet(state, cop, target) {
  const angle = Math.atan2(target.y - cop.y, target.x - cop.x) + (state.random() - 0.5) * 0.13;
  spawnBullet(state, cop.x + Math.cos(angle) * 14, cop.y + Math.sin(angle) * 14, angle, false, 9);
  state.sound.gunshot();
  state.fx.push({ x: cop.x + Math.cos(angle) * 18, y: cop.y + Math.sin(angle) * 18, vx: 0, vy: 0, life: 0, maxLife: 0.06, color: '#ffd76a', size: 9, drag: 0 });
}

/** The player's pistol: one round, a flash, a crack, and heat if anyone saw it. */
export function playerShoot(state, angle) {
  const player = state.player;
  if (player.fireCd > 0) return;
  if (state.ammo <= 0) {
    if (player.fireCd <= -0.1) state.sound.dryFire();
    player.fireCd = 0.25;
    return;
  }
  player.fireCd = 0.21;
  state.ammo -= 1;
  const spread = (state.random() - 0.5) * 0.03;
  spawnBullet(state, player.x + Math.cos(angle) * 16, player.y + Math.sin(angle) * 16, angle + spread, true, 34);
  state.sound.gunshot();
  state.fx.push({ x: player.x + Math.cos(angle) * 22, y: player.y + Math.sin(angle) * 22, vx: 0, vy: 0, life: 0, maxLife: 0.06, color: '#ffe9a3', size: 11, drag: 0 });
  scarePeds(state, player.x, player.y, 230);
  addCrime(state, 'shoot');
}

/** A swinging fist: hits the nearest person or car in front of the player. */
export function playerPunch(state) {
  const player = state.player;
  if (player.punchCd > 0) return;
  player.punchCd = PLAYER.punchCooldown;
  state.sound.punch();
  const reachX = player.x + Math.cos(player.angle) * PLAYER.punchRange;
  const reachY = player.y + Math.sin(player.angle) * PLAYER.punchRange;
  let hit = false;
  for (const ped of state.peds) {
    if (ped.dead || ped.state === 'down') continue;
    if (Math.hypot(ped.x - reachX, ped.y - reachY) < 20) {
      damagePed(state, ped, PLAYER.punchDamage, 'punch');
      hit = true;
      break;
    }
  }
  if (!hit) {
    for (const car of state.cars) {
      if (Math.hypot(car.x - reachX, car.y - reachY) < 30) {
        damageCar(state, car, 5);
        state.shake = Math.max(state.shake, 2);
        spawnSparks(state, reachX, reachY, 3);
        hit = true;
        break;
      }
    }
  }
  if (hit) scarePeds(state, player.x, player.y, 130);
}

export function damagePlayer(state, amount, fromX = null, fromY = null) {
  const player = state.player;
  if (state.flags.wasted || state.flags.busted) return;
  let remaining = amount;
  if (player.armor > 0) {
    const absorbed = Math.min(player.armor, amount * 0.6);
    player.armor -= absorbed;
    remaining -= absorbed;
  }
  player.health -= remaining;
  state.sound.hurt();
  state.shake = Math.max(state.shake, 3);
  state.hurtFlash = 0.25;
  if (fromX !== null) {
    const angle = Math.atan2(player.y - fromY, player.x - fromX);
    if (!player.car) {
      player.vx += Math.cos(angle) * 120;
      player.vy += Math.sin(angle) * 120;
    }
  }
  if (player.health <= 0) {
    player.health = 0;
    state.flags.wasted = true;
  }
}

export function damagePed(state, ped, amount, cause) {
  if (ped.dead) return;
  ped.health -= amount;
  if (ped.health <= 0) {
    killPed(state, ped, cause);
    return;
  }
  if (cause === 'punch' && state.random() < 0.55) {
    ped.state = 'down';
    ped.downTime = 2.6;
    if (ped.role !== 'cop') addCrime(state, 'punch');
  } else if (ped.role !== 'cop') {
    ped.state = 'flee';
    ped.fleeX = state.player.x;
    ped.fleeY = state.player.y;
    ped.fleeTime = 2.4;
    if (cause === 'punch') addCrime(state, 'punch');
  }
}

/** Death, from any cause: the body stays where it fell, and a civilian's wallet sometimes spills. */
export function killPed(state, ped, cause) {
  ped.dead = true;
  ped.state = 'down';
  ped.downTime = 9999;
  ped.corpseTime = 24;
  state.fx.push({ x: ped.x, y: ped.y, vx: 0, vy: 0, life: 0, maxLife: 0.5, color: 'rgba(150,40,40,0.55)', size: 13, drag: 0 });
  if (ped.role === 'cop') {
    addCrime(state, 'copHit');
    spawnPickup(state, ped.x + 10, ped.y + 6, 'ammo', 6);
  } else {
    if (cause === 'runover') addCrime(state, 'runover');
    else if (cause === 'shot' || cause === 'punch') addCrime(state, 'kill');
    if (state.random() < 0.6) spawnPickup(state, ped.x + 8, ped.y - 6, 'cash', 10 + Math.floor(state.random() * 45));
  }
  scarePeds(state, ped.x, ped.y, 200);
}

export function damageCar(state, car, amount) {
  if (car.dead) return;
  car.health -= amount;
  if (car.health <= 0) {
    car.dead = true;
    car.speed = 0;
    state.fx.push({ x: car.x, y: car.y, vx: 0, vy: 0, life: 0, maxLife: 0.7, color: 'rgba(255,140,50,0.8)', size: 20, drag: 0 });
    if (state.player.car === car) state.flags.carWrecked = true;
  }
}

/** Move every bullet, and settle what it hits: buildings eat them, then cars, people, the player. */
export function updateBullets(state, dt) {
  for (let i = state.bullets.length - 1; i >= 0; i -= 1) {
    const bullet = state.bullets[i];
    bullet.x += bullet.vx * dt;
    bullet.y += bullet.vy * dt;
    bullet.life -= dt;
    let spent = bullet.life <= 0;
    if (!spent && pointInBuilding(state.city, bullet.x, bullet.y)) {
      spawnSparks(state, bullet.x, bullet.y, 2);
      spent = true;
    }
    if (!spent) {
      for (const car of state.cars) {
        if (Math.hypot(car.x - bullet.x, car.y - bullet.y) < 23) {
          if (bullet.fromPlayer || state.player.car !== car) {
            damageCar(state, car, bullet.damage);
            spawnSparks(state, bullet.x, bullet.y, 3);
            if (bullet.fromPlayer && car.kind === 'police') addCrime(state, 'copHit');
          }
          spent = true;
          break;
        }
      }
    }
    if (!spent && bullet.fromPlayer) {
      for (const ped of state.peds) {
        if (ped.dead) continue;
        if (Math.hypot(ped.x - bullet.x, ped.y - bullet.y) < 12) {
          damagePed(state, ped, bullet.damage, 'shot');
          spent = true;
          break;
        }
      }
    }
    if (!spent && !bullet.fromPlayer) {
      const target = state.player.car ?? state.player;
      const radius = state.player.car ? 23 : 12;
      if (Math.hypot(target.x - bullet.x, target.y - bullet.y) < radius) {
        if (state.player.car) damageCar(state, state.player.car, bullet.damage * 0.7);
        else damagePlayer(state, bullet.damage, bullet.x - bullet.vx * 0.1, bullet.y - bullet.vy * 0.1);
        spent = true;
      }
    }
    if (spent) state.bullets.splice(i, 1);
  }
}

/** Collect whatever the player walks or drives over: cash, health, armour, ammunition. */
export function updatePickups(state) {
  const target = state.player.car ?? state.player;
  for (let i = state.pickups.length - 1; i >= 0; i -= 1) {
    const pickup = state.pickups[i];
    if (Math.hypot(pickup.x - target.x, pickup.y - target.y) > 26) continue;
    if (pickup.kind === 'cash') {
      state.cash += pickup.amount;
      state.sound.cash();
      toast(state, `+$${pickup.amount}`);
    } else if (pickup.kind === 'health') {
      if (state.player.health >= 100) continue;
      state.player.health = Math.min(100, state.player.health + 35);
      state.sound.pickup();
      toast(state, 'First aid +35');
    } else if (pickup.kind === 'armor') {
      if (state.player.armor >= 100) continue;
      state.player.armor = 100;
      state.sound.pickup();
      toast(state, 'Kevlar vest on');
    } else if (pickup.kind === 'ammo') {
      state.ammo += pickup.amount;
      state.sound.pickup();
      toast(state, `+${pickup.amount} rounds`);
    }
    state.pickups.splice(i, 1);
  }
}

/** A short message at the bottom of the HUD; the renderer keeps the newest few alive. */
export function toast(state, text, seconds = 2.6) {
  state.toasts.push({ text, until: state.time + seconds });
  if (state.toasts.length > 3) state.toasts.shift();
}
