// Solmar Heat — entry point. Owns the canvas, the fixed-step loop and the screen flow (title,
// play, pause, busted/wasted), reads the ?seed= and ?shot= parameters the screenshot flow uses,
// and wires the player's gun, fists, pockets and save key into the world simulation.

import { Input } from './input.js';
import { SoundBank } from './audio.js';
import { makeRandom } from './random.js';
import {
  SCREEN_OVER, SCREEN_PAUSE, SCREEN_PLAY, SCREEN_TITLE,
  createWorld, respawnAfterDown, stepWorld,
} from './world.js';
import { drawFrame } from './render.js';
import { playerPunch, playerShoot, toast } from './combat.js';
import { applySave, hasSave, loadSave, saveGame } from './save.js';
import { stageShot } from './shots.js';

const STEP = 1 / 60;
const params = new URLSearchParams(location.search);
const seed = Number(params.get('seed') ?? 7) || 7;
const shotName = params.get('shot');

const canvas = document.getElementById('game');
const ctx = canvas.getContext('2d');
const status = document.getElementById('status');
const input = new Input(canvas);
const sound = new SoundBank();

let state = freshWorld();
let wasOver = false;

function freshWorld() {
  const world = createWorld(makeRandom(seed), sound);
  world.view = { w: innerWidth, h: innerHeight };
  world.hasSave = hasSave();
  return world;
}

function resize() {
  const dpr = Math.min(1.5, devicePixelRatio || 1);
  canvas.width = Math.round(innerWidth * dpr);
  canvas.height = Math.round(innerHeight * dpr);
  canvas.style.width = `${innerWidth}px`;
  canvas.style.height = `${innerHeight}px`;
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  if (state) state.view = { w: innerWidth, h: innerHeight };
}
addEventListener('resize', resize);
resize();

// Screenshot mode: stage the scene, then hold the frame (the kit photographs the page).
if (shotName) {
  stageShot(state, shotName);
  state.view = { w: innerWidth, h: innerHeight };
  drawFrame(ctx, state, 0);
  requestAnimationFrame(function hold() {
    drawFrame(ctx, state, 0);
    requestAnimationFrame(hold);
  });
} else {
  requestAnimationFrame(loop);
}

let last = performance.now();
let accumulator = 0;

function loop(now) {
  requestAnimationFrame(loop);
  let frame = (now - last) / 1000;
  last = now;
  if (frame > 0.25) frame = 0.25;
  accumulator += frame;

  while (accumulator >= STEP) {
    accumulator -= STEP;
    step(STEP);
  }
  drawFrame(ctx, state, frame);
  input.endFrame();
  if (status && state.objective) status.textContent = state.objective.text;
}

/** One fixed step of the outer game: screens, menus and the player's own hands. */
function step(dt) {
  sound.unlock();
  if (input.tap('KeyM')) {
    sound.setMuted(!sound.muted);
    toast(state, sound.muted ? 'Sound off' : 'Sound on');
  }

  if (state.screen === SCREEN_TITLE) {
    stepWorld(state, idleInput(), dt); // the city idles behind the title card
    if (input.tap('Enter')) startRun(false);
    else if (input.tap('KeyC') && state.hasSave) startRun(true);
    return;
  }

  if (state.screen === SCREEN_OVER) {
    if (!wasOver) {
      wasOver = true;
      if (state.flags.busted) sound.busted();
      else sound.missionFail();
      sound.setEngine(false, 0);
      sound.setSiren(0);
    }
    if (input.tap('Enter') && state.time - state.overAt > 0.6) {
      respawnAfterDown(state);
      state.screen = SCREEN_PLAY;
      wasOver = false;
    }
    state.time += dt; // the card's blink runs on world time even while the city waits
    return;
  }
  wasOver = false;

  if (input.tap('KeyP', 'Escape')) {
    state.screen = state.screen === SCREEN_PAUSE ? SCREEN_PLAY : SCREEN_PAUSE;
    if (state.screen === SCREEN_PAUSE) {
      sound.setEngine(false, 0);
      sound.setSiren(0);
    }
    return;
  }
  if (state.screen === SCREEN_PAUSE) return;

  // The player's own violence: the mouse fires the pistol, F swings a fist.
  const player = state.player;
  if (!player.car) {
    if (input.mouseDown) playerShoot(state, player.angle);
    if (input.tap('KeyF', 'KeyJ')) playerPunch(state);
  }

  // Save at home: S while standing at Casa de Renzo.
  if (input.tap('KeyS')) {
    const home = state.city.pois.hideout;
    if (Math.hypot(player.x - home.x, player.y - home.y) < 60) {
      if (saveGame(state)) toast(state, 'Game saved at Casa de Renzo.');
      else toast(state, 'Saving is unavailable in this browser.');
    } else {
      toast(state, 'You can only save at Casa de Renzo.');
    }
  }

  stepWorld(state, input, dt);
  if (state.requestSave) {
    state.requestSave = false;
    saveGame(state);
  }
}

function startRun(continueSave) {
  state = freshWorld();
  if (continueSave) {
    const data = loadSave();
    if (data) applySave(state, data);
    toast(state, 'Welcome back to Port Solana.');
  } else {
    toast(state, 'Carmen is waiting at Café Brisa, across the city.', 5);
  }
  state.screen = SCREEN_PLAY;
  sound.unlock();
}

/** Keys nobody is pressing, for idling the world behind menus. */
const idle = {
  keys: new Set(), pressed: new Set(), mouseX: 0, mouseY: 0, mouseDown: false, mouseClicked: false,
  down: () => false, tap: () => false, endFrame() {},
};
function idleInput() {
  return idle;
}
