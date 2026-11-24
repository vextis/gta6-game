// The world state: one object that every system reads and writes — the city, Renzo, the traffic,
// the crowd, the law, the money and the story — plus the per-frame update order that turns it
// all into a living city. Rendering lives in render.js; this file only simulates.

import { buildCity, collideWorld } from './city.js';
import { SoundBank } from './audio.js';
import { createWanted, updateWanted, updatePoliceCars, updateFootCops, addCrime } from './police.js';
import { seedCars, updateTraffic, drivePlayerCar, collideCars, spawnSmoke } from './vehicles.js';
import { seedPeds, updatePeds } from './pedestrians.js';
import { fireCopBullet, updateBullets, updatePickups, damagePlayer, killPed, toast } from './combat.js';
import { createMissionState, updateMissions, updateServices, onPlayerDown } from './missions.js';
import { PLAYER } from './config.js';

export const SCREEN_TITLE = 'title';
export const SCREEN_PLAY = 'play';
export const SCREEN_PAUSE = 'pause';
export const SCREEN_OVER = 'over'; // busted or wasted card; state.flags says which

export function createWorld(random, sound) {
  const city = buildCity(random);
  const hideout = city.pois.hideout;
  const state = {
    random,
    sound: sound ?? new SoundBank(),
    city,
    time: 0,
    playSeconds: 0,
    screen: SCREEN_TITLE,
    player: {
      x: hideout.x, y: hideout.y + 26, angle: -Math.PI / 2,
      vx: 0, vy: 0, health: PLAYER.maxHealth, armor: 0,
      car: null, punchCd: 0, fireCd: 0, phase: 0,
    },
    cars: [],
    peds: [],
    bullets: [],
    pickups: [],
    fx: [],
    toasts: [],
    banner: null,
    objective: null,
    cash: 120,
    respect: 0,
    ammo: 24,
    wanted: createWanted(),
    mission: createMissionState(),
    flags: { busted: false, wasted: false, carWrecked: false },
    camera: { x: hideout.x, y: hideout.y, zoom: 1 },
    shake: 0,
    hurtFlash: 0,
    requestSave: false,
    overAt: 0,
  };
  seedCars(state);
  seedPeds(state);
  return state;
}

/** Step the whole simulation forward by dt seconds (fixed-stepped by main.js). */
export function stepWorld(state, input, dt) {
  state.time += dt;
  state.playSeconds += dt;
  const player = state.player;

  updatePlayer(state, input, dt);
  updateTraffic(state, dt);
  if (player.car) drivePlayerCar(state, player.car, input, dt);
  updatePoliceCars(state, dt);
  updatePeds(state, dt);
  updateFootCops(state, dt, fireCopBullet);
  collideCars(state);
  runOverChecks(state);
  updateBullets(state, dt);
  updatePickups(state);
  updateWanted(state, dt);
  updateMissions(state, dt);
  updateServices(state, input, dt);
  updateFx(state, dt);

  // A wrecked car throws its driver out onto the street.
  if (state.flags.carWrecked && player.car) {
    player.x = player.car.x + 30;
    player.y = player.car.y + 16;
    player.car = null;
    state.flags.carWrecked = false;
    toast(state, 'Your ride is wrecked!');
  }
  // Smoke drifts from badly hurt cars, the player's included.
  for (const car of state.cars) {
    if (car.health < 35 && !car.dead && state.random() < dt * 6) spawnSmoke(state, car.x, car.y, 1);
  }
  if (state.shake > 0) state.shake = Math.max(0, state.shake - dt * 26);
  if (state.hurtFlash > 0) state.hurtFlash = Math.max(0, state.hurtFlash - dt);

  // Sound follows the action: engine while driving, sirens by the nearest patrol car.
  const driving = Boolean(player.car);
  state.sound.setEngine(driving, driving ? Math.abs(player.car.speed) / player.car.model.speed : 0);
  let siren = 0;
  for (const car of state.cars) {
    if (car.kind === 'police' && !car.dead) {
      const dist = Math.hypot(car.x - player.x, car.y - player.y);
      siren = Math.max(siren, Math.max(0, 1 - dist / 620));
    }
  }
  state.sound.setSiren(state.wanted.stars > 0 ? siren : 0);
  state.sound.updateMusic(dt, true);

  if (state.flags.busted || state.flags.wasted) {
    state.screen = SCREEN_OVER;
    state.overAt = state.time;
  }
}

/** Renzo on foot: run with WASD, aim with the mouse, punch with F, steal with E. */
function updatePlayer(state, input, dt) {
  const player = state.player;
  player.punchCd = Math.max(0, player.punchCd - dt);
  player.fireCd = Math.max(-0.2, player.fireCd - dt);
  if (player.car) {
    player.x = player.car.x;
    player.y = player.car.y;
    player.angle = player.car.angle;
    if (input.tap('KeyE')) {
      // Step out on the left side of the car.
      player.car = null;
      player.x += Math.cos(player.angle - Math.PI / 2) * 26;
      player.y += Math.sin(player.angle - Math.PI / 2) * 26;
      collideWorld(state.city, player, PLAYER.radius);
      state.sound.doorSlam();
    }
    return;
  }

  const run = input.down('ShiftLeft', 'ShiftRight');
  const speed = run ? PLAYER.runSpeed : PLAYER.walkSpeed;
  let mx = (input.down('KeyD', 'ArrowRight') ? 1 : 0) - (input.down('KeyA', 'ArrowLeft') ? 1 : 0);
  let my = (input.down('KeyS', 'ArrowDown') ? 1 : 0) - (input.down('KeyW', 'ArrowUp') ? 1 : 0);
  const len = Math.hypot(mx, my) || 1;
  mx = (mx / len) * speed;
  my = (my / len) * speed;
  player.vx += (mx - player.vx) * Math.min(1, dt * 10);
  player.vy += (my - player.vy) * Math.min(1, dt * 10);
  player.x += player.vx * dt;
  player.y += player.vy * dt;
  collideWorld(state.city, player, PLAYER.radius);
  const moving = Math.hypot(player.vx, player.vy);
  player.phase += moving * dt * 0.09;

  // Face the mouse when it has moved; otherwise face the way he walks.
  const cam = state.camera;
  const mouseWorldX = cam.x + (input.mouseX - state.view.w / 2) / cam.zoom;
  const mouseWorldY = cam.y + (input.mouseY - state.view.h / 2) / cam.zoom;
  if (Math.hypot(mouseWorldX - player.x, mouseWorldY - player.y) > 24) {
    player.angle = Math.atan2(mouseWorldY - player.y, mouseWorldX - player.x);
  } else if (moving > 12) {
    player.angle = Math.atan2(player.vy, player.vx);
  }
  state.aimX = mouseWorldX;
  state.aimY = mouseWorldY;

  // Steal / enter the nearest car. Peek rather than consume: the gun shop uses the same key
  // when no car is at hand, and updateServices runs after this.
  if (input.pressed.has('KeyE')) {
    let best = null;
    let bestDist = 42;
    for (const car of state.cars) {
      if (car.dead) continue;
      const dist = Math.hypot(car.x - player.x, car.y - player.y);
      if (dist < bestDist) { best = car; bestDist = dist; }
    }
    if (best) {
      input.pressed.delete('KeyE');
      const wasParked = best.kind === 'parked';
      const wasTraffic = best.kind === 'traffic';
      best.kind = 'player';
      best.speed = Math.min(best.speed, 40);
      player.car = best;
      player.vx = 0;
      player.vy = 0;
      state.sound.doorSlam();
      if (wasParked || wasTraffic) {
        addCrime(state, 'theft');
        if (wasTraffic) toast(state, 'Driver dragged out — the car is yours');
      }
    }
  }
}

/** Cars at speed are lethal: pedestrians in the path of any fast car go down. */
function runOverChecks(state) {
  for (const car of state.cars) {
    if (Math.abs(car.speed) < 46 || car.dead) continue;
    const driven = state.player.car === car;
    for (const ped of state.peds) {
      if (ped.dead) continue;
      if (Math.hypot(ped.x - car.x, ped.y - car.y) < 21) {
        if (ped.role === 'cop') {
          killPed(state, ped, 'runover');
          if (driven) addCrime(state, 'copHit');
        } else {
          killPed(state, ped, driven ? 'runover' : 'accident');
          if (!driven && car.kind === 'traffic') car.speed *= 0.4; // the driver brakes in shock
        }
      }
    }
    // The player on foot can be knocked down by traffic — and by the law.
    if (!state.player.car && Math.hypot(state.player.x - car.x, state.player.y - car.y) < 21) {
      damagePlayer(state, car.kind === 'police' ? 16 : 22, car.x, car.y);
      state.player.vx += Math.cos(Math.atan2(state.player.y - car.y, state.player.x - car.x)) * 260;
      state.player.vy += Math.sin(Math.atan2(state.player.y - car.y, state.player.x - car.x)) * 260;
    }
  }
}

function updateFx(state, dt) {
  for (let i = state.fx.length - 1; i >= 0; i -= 1) {
    const p = state.fx[i];
    p.life += dt;
    if (p.life >= p.maxLife) {
      state.fx.splice(i, 1);
      continue;
    }
    p.x += p.vx * dt;
    p.y += p.vy * dt;
    const drag = Math.max(0, 1 - p.drag * dt);
    p.vx *= drag;
    p.vy *= drag;
  }
  // Corpses fade after a while so the streets do not fill up.
  for (let i = state.peds.length - 1; i >= 0; i -= 1) {
    const ped = state.peds[i];
    if (ped.dead) {
      ped.corpseTime -= dt;
      if (ped.corpseTime <= 0) state.peds.splice(i, 1);
    }
  }
  state.toasts = state.toasts.filter((t) => t.until > state.time);
  if (state.banner && state.banner.until < state.time) state.banner = null;
}

/** After a bust or a wasting: pay the price, wake up somewhere official, heat gone. */
export function respawnAfterDown(state) {
  const player = state.player;
  const busted = state.flags.busted;
  const poi = busted ? state.city.pois.police : state.city.pois.hospital;
  const fine = busted ? Math.min(state.cash, 150 + state.wanted.stars * 60) : Math.min(state.cash, 100);
  state.cash -= fine;
  if (player.car) {
    player.car.kind = 'parked';
    player.car.speed = 0;
    player.car = null;
  }
  player.x = poi.x;
  player.y = poi.y + 18;
  player.vx = 0;
  player.vy = 0;
  player.health = PLAYER.maxHealth;
  player.armor = 0;
  state.wanted.heat = 0;
  state.wanted.stars = 0;
  state.wanted.bustMeter = 0;
  state.flags.busted = false;
  state.flags.wasted = false;
  onPlayerDown(state);
  toast(state, busted ? `Busted. The Comisaría keeps $${fine} of yours.` : `You wake at Clínica Santa Brisa. Bill: $${fine}.`, 5);
  state.requestSave = true;
}
