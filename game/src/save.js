// Saving: Port Solana persists to the browser's localStorage — cash, respect, story progress,
// ammunition and where Renzo woke up. Saving happens at the hideout (S), automatically after
// every finished job, and never costs anything.

import { SAVE_KEY } from './config.js';

export function hasSave() {
  try {
    return localStorage.getItem(SAVE_KEY) !== null;
  } catch {
    return false; // storage can be unavailable (private mode); the game just runs unsaved
  }
}

export function saveGame(state) {
  const data = {
    cash: state.cash,
    respect: state.respect,
    ammo: state.ammo,
    armor: state.player.armor,
    missionIndex: state.mission.index,
    storyDone: state.mission.storyDone,
    playerX: Math.round(state.player.x),
    playerY: Math.round(state.player.y),
    playSeconds: Math.round(state.playSeconds),
  };
  try {
    localStorage.setItem(SAVE_KEY, JSON.stringify(data));
    return true;
  } catch {
    return false;
  }
}

export function loadSave() {
  try {
    const raw = localStorage.getItem(SAVE_KEY);
    if (!raw) return null;
    const data = JSON.parse(raw);
    if (typeof data !== 'object' || data === null || typeof data.cash !== 'number') return null;
    return data;
  } catch {
    return null;
  }
}

/** Apply a loaded save onto a fresh world: money and progress carry, health and heat do not. */
export function applySave(state, data) {
  state.cash = data.cash;
  state.respect = data.respect ?? 0;
  state.ammo = data.ammo ?? 24;
  state.player.armor = data.armor ?? 0;
  state.mission.index = Math.min(data.missionIndex ?? 0, 4);
  state.mission.storyDone = Boolean(data.storyDone) || state.mission.index >= 4;
  state.playSeconds = data.playSeconds ?? 0;
  if (typeof data.playerX === 'number' && typeof data.playerY === 'number') {
    state.player.x = data.playerX;
    state.player.y = data.playerY;
  }
}

export function wipeSave() {
  try {
    localStorage.removeItem(SAVE_KEY);
  } catch {
    /* nothing to wipe */
  }
}
