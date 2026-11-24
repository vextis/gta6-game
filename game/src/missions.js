// The story of Renzo in Port Solana, told in four jobs for Doña Carmen Vega of Café Brisa, plus
// the repeatable street work (taxi fares and courier runs) that keeps cash coming in afterwards.
// A mission is a list of stages; each stage is one objective with a marker on the map and the
// minimap, and this file advances them, pays out, and writes the HUD's objective line.

import { PRICES } from './config.js';
import { addCrime, clearWanted } from './police.js';
import { toast } from './combat.js';
import { range } from './random.js';

// Stage kinds: goto (reach the ring), enterCar (get in any car), deliverCar (arrive driving),
// pickup (touch the ring to take the package), hold (stay in the ring), rob (hold at the bank),
// escape (get the wanted level back to zero).
export const STORY = [
  {
    title: 'Rueda Nueva',
    sub: 'New wheels for an old friend',
    intro: 'Carmen: Renzo, you owe me for the boat. Roca needs a car — any car. Bring him one that runs.',
    reward: 450,
    stages: [
      { kind: 'goto', poi: 'cafe', text: 'Meet Carmen at Café Brisa' },
      { kind: 'enterCar', text: 'Steal a car — any car' },
      { kind: 'deliverCar', poi: 'chopshop', text: 'Deliver the car to Talleres Roca' },
    ],
  },
  {
    title: 'El Encargo',
    sub: 'A package from the marina',
    intro: 'Carmen: A parcel waits at the Marina Grill dock. The harbour police watch that pier — bring it to me fast.',
    reward: 650,
    stages: [
      { kind: 'goto', poi: 'cafe', text: 'See Carmen at Café Brisa' },
      { kind: 'pickup', poi: 'diner', text: 'Collect the package at Marina Grill' },
      { kind: 'goto', poi: 'cafe', text: 'Bring the package back to Café Brisa', heatFloor: 1.6 },
    ],
  },
  {
    title: 'El Cobro',
    sub: 'Three debts, one afternoon',
    intro: 'Carmen: Three friends of the café owe money and short memories. Visit each. Stand close. Be persuasive.',
    reward: 560,
    stages: [
      { kind: 'goto', poi: 'cafe', text: 'See Carmen at Café Brisa' },
      { kind: 'hold', poi: 'diner', seconds: 3, text: 'Persuade the debtor at Marina Grill' },
      { kind: 'hold', poi: 'gunshop', seconds: 3, text: 'Persuade the debtor at Armería Costa' },
      { kind: 'hold', poi: 'hospital', seconds: 3, text: 'Persuade the debtor at Clínica Santa Brisa' },
    ],
  },
  {
    title: 'Banco del Sol',
    sub: 'The big score',
    intro: 'Carmen: The Banco del Sol keeps the ferry company payroll in its back office. Take it — then disappear.',
    reward: 3000,
    stages: [
      { kind: 'goto', poi: 'bank', text: 'Go to the Banco del Sol' },
      { kind: 'rob', poi: 'bank', seconds: 4, text: 'Empty the back office — hold your ground' },
      { kind: 'escape', text: 'Lose the heat — a spray shop or a quiet wait' },
      { kind: 'goto', poi: 'hideout', text: 'Lie low at Casa de Renzo' },
    ],
  },
];

export function createMissionState() {
  return {
    index: 0, // next story mission to offer
    stage: 0,
    active: false,
    storyDone: false,
    holdT: 0,
    carrying: false,
    side: null, // current side job, if any
    sideTimer: 0,
  };
}

function poiPoint(state, poiId) {
  const poi = state.city.pois[poiId];
  return { x: poi.x, y: poi.y };
}

function currentStage(state) {
  const mission = STORY[state.mission.index];
  return mission ? mission.stages[state.mission.stage] : null;
}

function setObjective(state, text, x, y, color = '#ffd94d') {
  state.objective = { text, x, y, color };
}

/** Announce a mission with a banner and Carmen's words in the toast feed. */
function startMission(state) {
  const mission = STORY[state.mission.index];
  state.mission.active = true;
  state.mission.stage = 0;
  state.mission.holdT = 0;
  state.mission.carrying = false;
  state.banner = { title: mission.title, sub: mission.sub, until: state.time + 3.6 };
  toast(state, mission.intro, 6);
  state.sound.missionDone();
}

function completeMission(state) {
  const mission = STORY[state.mission.index];
  state.cash += mission.reward;
  state.respect += 1;
  state.banner = { title: 'JOB DONE', sub: `${mission.title} — $${mission.reward}`, until: state.time + 3.4 };
  state.sound.missionDone();
  state.mission.active = false;
  state.mission.index += 1;
  state.mission.stage = 0;
  state.mission.carrying = false;
  if (state.mission.index >= STORY.length) {
    state.mission.storyDone = true;
    toast(state, 'Carmen: The debt is paid, Renzo. Port Solana is yours now.', 6);
  }
  state.requestSave = true;
}

/** Busted or wasted mid-job: the job restarts from its first stage, the story keeps its place. */
export function onPlayerDown(state) {
  if (state.mission.active) {
    state.mission.stage = 0;
    state.mission.holdT = 0;
    state.mission.carrying = false;
    toast(state, 'The job fell apart. Start it again at the marker.', 4);
  }
  state.mission.side = null;
}

/** A repeatable street job: fetch a fare or a parcel at one place, drop it at another. */
function offerSideJob(state) {
  const ids = ['cafe', 'diner', 'hospital', 'gunshop', 'bank', 'hideout', 'chopshop'];
  const from = ids[Math.floor(state.random() * ids.length)];
  let to = ids[Math.floor(state.random() * ids.length)];
  if (to === from) to = 'cafe';
  const a = poiPoint(state, from);
  const b = poiPoint(state, to);
  const distance = Math.hypot(b.x - a.x, b.y - a.y);
  const courier = state.random() < 0.5;
  state.mission.side = {
    kind: courier ? 'courier' : 'taxi',
    stage: 'pickup',
    x: a.x, y: a.y, destX: b.x, destY: b.y,
    fromName: state.city.pois[from].name, toName: state.city.pois[to].name,
    reward: Math.round((courier ? PRICES.courierBase : PRICES.taxiFareBase) + distance * 0.09),
    timeLeft: 75 + distance * 0.05,
  };
}

export function updateMissions(state, dt) {
  const mission = state.mission;
  const player = state.player;
  const focus = player.car ?? player;

  if (!mission.active) {
    if (!mission.storyDone) {
      const next = STORY[mission.index];
      const cafe = poiPoint(state, 'cafe');
      setObjective(state, `New job: ${next.title} — meet Carmen`, cafe.x, cafe.y);
      if (Math.hypot(player.x - cafe.x, player.y - cafe.y) < 46 && !player.car) startMission(state);
    } else if (!mission.side) {
      offerSideJob(state);
    }
    if (!mission.active && mission.side) updateSideJob(state, dt);
    if (!mission.active) return;
  }

  const stage = currentStage(state);
  if (!stage) { completeMission(state); return; }
  const point = stage.poi ? poiPoint(state, stage.poi) : { x: focus.x, y: focus.y };
  const dist = Math.hypot(focus.x - point.x, focus.y - point.y);

  if (stage.heatFloor) state.wanted.heat = Math.max(state.wanted.heat, stage.heatFloor);

  switch (stage.kind) {
    case 'goto':
      setObjective(state, stage.text, point.x, point.y);
      if (dist < 44) advanceStage(state);
      break;
    case 'pickup':
      setObjective(state, stage.text, point.x, point.y);
      if (dist < 40) {
        mission.carrying = true;
        toast(state, 'Package on board. Move!');
        advanceStage(state);
      }
      break;
    case 'enterCar':
      setObjective(state, stage.text, focus.x, focus.y, '#7fd4ff');
      state.objective.x = null; // no world marker: the objective is wherever a car is
      if (player.car) advanceStage(state);
      break;
    case 'deliverCar':
      setObjective(state, stage.text, point.x, point.y);
      if (player.car && dist < 62) {
        // Roca takes the car: the player steps out and the car is his now.
        const car = player.car;
        player.car = null;
        player.x = car.x + 30;
        player.y = car.y + 10;
        state.cars.splice(state.cars.indexOf(car), 1);
        state.sound.doorSlam();
        advanceStage(state);
      }
      break;
    case 'hold': {
      setObjective(state, `${stage.text} — ${Math.max(0, stage.seconds - mission.holdT).toFixed(0)}s`, point.x, point.y);
      if (!player.car && dist < 46) {
        mission.holdT += dt;
        if (mission.holdT >= stage.seconds) {
          mission.holdT = 0;
          state.cash += 120;
          toast(state, 'Debt collected +$120');
          state.sound.cash();
          if (state.mission.stage >= 2) addCrime(state, 'vandal');
          advanceStage(state);
        }
      } else mission.holdT = Math.max(0, mission.holdT - dt * 2);
      break;
    }
    case 'rob': {
      setObjective(state, `${stage.text} — ${Math.max(0, stage.seconds - mission.holdT).toFixed(0)}s`, point.x, point.y);
      if (!player.car && dist < 52) {
        mission.holdT += dt;
        if (mission.holdT >= stage.seconds) {
          mission.holdT = 0;
          state.cash += 3000;
          state.wanted.heat = 5;
          state.wanted.lastCrimeAt = state.time;
          toast(state, 'Payroll taken: +$3000. RUN!', 4);
          state.sound.cash();
          advanceStage(state);
        }
      } else mission.holdT = Math.max(0, mission.holdT - dt * 2);
      break;
    }
    case 'escape':
      setObjective(state, stage.text, focus.x, focus.y, '#7fd4ff');
      state.objective.x = null;
      if (state.wanted.stars === 0) advanceStage(state);
      break;
    default:
      advanceStage(state);
  }
}

function advanceStage(state) {
  state.mission.stage += 1;
  state.mission.holdT = 0;
  if (state.mission.stage >= STORY[state.mission.index].stages.length) completeMission(state);
  else toast(state, STORY[state.mission.index].stages[state.mission.stage].text, 3.4);
}

function updateSideJob(state, dt) {
  const side = state.mission.side;
  const player = state.player;
  const focus = player.car ?? player;
  side.timeLeft -= dt;
  if (side.timeLeft <= 0) {
    toast(state, 'Job timed out.');
    state.sound.missionFail();
    state.mission.side = null;
    return;
  }
  if (side.stage === 'pickup') {
    const label = side.kind === 'taxi' ? `Pick up a fare at ${side.fromName}` : `Collect a parcel at ${side.fromName}`;
    setObjective(state, `${label} — ${Math.ceil(side.timeLeft)}s`, side.x, side.y, '#7fd4ff');
    if (Math.hypot(focus.x - side.x, focus.y - side.y) < 48) {
      side.stage = 'deliver';
      toast(state, side.kind === 'taxi' ? 'Fare on board!' : 'Parcel on board!');
      state.sound.pickup();
    }
  } else {
    setObjective(state, `Drop off at ${side.toName} — ${Math.ceil(side.timeLeft)}s`, side.destX, side.destY, '#7fd4ff');
    if (Math.hypot(focus.x - side.destX, focus.y - side.destY) < 52) {
      const bonus = Math.round(side.timeLeft * 0.4);
      state.cash += side.reward + bonus;
      state.respect += 1;
      state.banner = { title: 'JOB DONE', sub: `$${side.reward} + $${bonus} swift bonus`, until: state.time + 2.6 };
      state.sound.missionDone();
      state.mission.side = null;
      state.requestSave = true;
    }
  }
}

/** Services the city offers when the player stands (or parks) in a place's ring and pays. */
export function updateServices(state, input, dt) {
  const player = state.player;
  const spray = state.city.pois.spray;
  if (player.car) {
    const inSpray = Math.abs(player.x - spray.x) < 74 && Math.abs(player.y - spray.y) < 74;
    if (inSpray && Math.abs(player.car.speed) < 8) {
      if (state.cash >= PRICES.sprayJob && (state.wanted.stars > 0 || player.car.health < 100)) {
        state.cash -= PRICES.sprayJob;
        player.car.health = 100;
        player.car.dead = false;
        clearWanted(state);
        toast(state, `Brillo Auto Spa: fresh paint, clean record — $${PRICES.sprayJob}`);
        state.sound.cash();
        state.requestSave = true;
      } else if (state.wanted.stars === 0 && player.car.health >= 100) {
        // Nothing to fix; the hint below says so once.
      }
    }
    return;
  }
  // On foot: the gun shop sells rounds (E) and kevlar vests (Q), the clinic mends wounds free.
  const gun = state.city.pois.gunshop;
  const carAtHand = state.cars.some((car) => Math.hypot(car.x - player.x, car.y - player.y) < 44);
  if (Math.hypot(player.x - gun.x, player.y - gun.y) < 42 && !carAtHand) {
    if (input.tap('KeyE')) {
      if (state.cash >= PRICES.ammoBox) {
        state.cash -= PRICES.ammoBox;
        state.ammo += 24;
        toast(state, `Armería Costa: +24 rounds — $${PRICES.ammoBox}`);
        state.sound.cash();
      } else toast(state, 'Not enough cash for ammunition.');
    }
    if (input.tap('KeyQ')) {
      if (player.armor >= 100) toast(state, 'Your vest is already whole.');
      else if (state.cash >= PRICES.armorVest) {
        state.cash -= PRICES.armorVest;
        player.armor = 100;
        toast(state, `Armería Costa: kevlar vest — $${PRICES.armorVest}`);
        state.sound.cash();
      } else toast(state, 'Not enough cash for a vest.');
    }
  }
  const clinic = state.city.pois.hospital;
  if (Math.hypot(player.x - clinic.x, player.y - clinic.y) < 46 && player.health < 100) {
    player.health = Math.min(100, player.health + 26 * dt); // a slow mend while you wait at the door
  }
}
