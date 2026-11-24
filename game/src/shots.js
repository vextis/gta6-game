// The screenshot scenes behind ?shot=start|roam|chase|mission. Each one builds the real world
// from the seed, places Renzo and the law where the story needs them, and plays the simulation
// forward with a small autopilot, so every screenshot is a genuine frame of the game being
// played — the same seed always staging the same frame.

import { SCREEN_PLAY, SCREEN_TITLE, stepWorld } from './world.js';
import { makeCar } from './vehicles.js';
import { makePed } from './pedestrians.js';
import { playerShoot } from './combat.js';
import { onRoad, roadCenterY } from './city.js';

const STEP = 1 / 60;

/** A silent stand-in for the keyboard: the autopilots press its keys, the world reads them. */
function fakeInput() {
  return {
    keys: new Set(),
    pressed: new Set(),
    mouseX: 900,
    mouseY: 300,
    mouseDown: false,
    mouseClicked: false,
    down(...codes) { return codes.some((c) => this.keys.has(c)); },
    tap() { return false; },
    endFrame() { this.pressed.clear(); this.mouseClicked = false; },
  };
}

function runSteps(state, input, seconds, steer = null) {
  const steps = Math.round(seconds / STEP);
  for (let i = 0; i < steps; i += 1) {
    if (steer) steer(state, input);
    stepWorld(state, input, STEP);
    input.endFrame();
  }
}

/** Autopilot for the driving scene: hold the throttle and keep the car straight and fast on
 *  its avenue, heading across town toward the chop shop side of the map. */
function driveEastFast(state, input) {
  input.keys.add('KeyW');
  const car = state.player.car;
  if (!car) return;
  const wanted = Math.atan2(1032 - car.y, 900); // a point far east on the same avenue
  let diff = Math.atan2(Math.sin(wanted - car.angle), Math.cos(wanted - car.angle));
  input.keys.delete('KeyA');
  input.keys.delete('KeyD');
  if (diff > 0.1) input.keys.add('KeyD');
  else if (diff < -0.1) input.keys.add('KeyA');
}

function snapCamera(state, x, y, zoom) {
  state.camera.x = x;
  state.camera.y = y;
  state.camera.zoom = zoom;
}

/**
 * Stage the named scene on a freshly built world and leave the state ready to draw.
 * Returns nothing; main.js draws the frame (and the screenshot tool photographs it).
 */
export function stageShot(state, name) {
  const input = fakeInput();
  const player = state.player;
  state.view = { w: 1280, h: 800 };

  if (name === 'roam') {
    // Mid-morning downtown: Renzo on foot near the bank, the city awake around him, Carmen's
    // first job waiting across the map.
    state.screen = SCREEN_PLAY;
    player.x = 700;
    player.y = roadCenterY(2) + 60;
    state.cash = 320;
    runSteps(state, input, 5);
    // Presentation pass: tow any traffic car that ended up wedged off the road near the camera.
    state.cars = state.cars.filter((car) => car.kind !== 'traffic' || onRoad(car.x, car.y)
      || Math.hypot(car.x - player.x, car.y - player.y) > 620);
    snapCamera(state, player.x, player.y, 1.08);
    return;
  }

  if (name === 'chase') {
    // Four stars and climbing: a stolen roadster, the patrol on his tail, Roca's yard the only
    // safe pair of hands in Port Solana.
    state.screen = SCREEN_PLAY;
    const roadY = roadCenterY(3);
    player.x = 380;
    player.y = roadY + 24;
    // Clear the avenue ahead so the staged chase runs clean at full speed.
    state.cars = state.cars.filter((car) => car.kind !== 'traffic'
      || Math.hypot(car.x - player.x, car.y - player.y) > 850);
    const car = makeCar(state.random, player.x, player.y, 0, 'player',
      { name: 'Brisa Roadster', colors: ['#d1495b'], speed: 355, accel: 1.25 });
    car.speed = 235;
    state.cars.push(car);
    player.car = car;
    for (let i = 0; i < 3; i += 1) {
      const cop = makeCar(state.random, player.x - 74 - i * 62, roadY + (i % 2 === 0 ? 22 : -22),
        0, 'police', { name: 'Patrulla Municipal', colors: ['#eef1f4'], speed: 338, accel: 1.18 });
      cop.livery = 'police';
      cop.speed = 232;
      state.cars.push(cop);
    }
    state.wanted.heat = 3.6; // ceil(heat) is the star count: 3.6 reads as four stars
    state.wanted.stars = 4;
    state.wanted.lastCrimeAt = 0;
    state.cash = 940;
    state.mission.active = true;
    state.mission.index = 0;
    state.mission.stage = 2; // deliver the car
    runSteps(state, input, 1.9, driveEastFast);
    snapCamera(state, player.x, player.y, 0.95);
    return;
  }

  if (name === 'mission') {
    // The Banco del Sol job, seconds after the payroll changed hands: five stars, officers
    // closing in on foot, and Renzo shooting his way toward a getaway.
    state.screen = SCREEN_PLAY;
    const bank = state.city.pois.bank;
    player.x = bank.x - 30;
    player.y = bank.y + 34;
    player.angle = Math.PI * 0.85;
    state.cash = 3120;
    state.ammo = 17;
    state.wanted.heat = 5;
    state.wanted.stars = 5;
    state.wanted.lastCrimeAt = 0;
    state.mission.active = true;
    state.mission.index = 3;
    state.mission.stage = 2; // escape
    for (let i = 0; i < 2; i += 1) {
      const cop = makePed(state.random, bank.x - 170 - i * 46, bank.y - 74 + i * 104, 'cop');
      state.peds.push(cop);
    }
    const patrol = makeCar(state.random, bank.x - 350, bank.y + 150, -0.4, 'police',
      { name: 'Patrulla Municipal', colors: ['#eef1f4'], speed: 338, accel: 1.18 });
    patrol.livery = 'police';
    patrol.speed = 60;
    state.cars.push(patrol);
    runSteps(state, input, 1.15);
    playerShoot(state, player.angle); // the staged frame catches the muzzle flash
    snapCamera(state, player.x, player.y, 1.08);
    return;
  }

  // 'start' and anything else: the title card over the promenade at golden hour, traffic
  // drifting past behind the lettering.
  state.screen = SCREEN_TITLE;
  player.x = 1010;
  player.y = 1560;
  runSteps(state, input, 4);
  snapCamera(state, 1010, 1470, 0.78);
}
