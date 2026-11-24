// Everything the player sees: Port Solana drawn top-down in warm afternoon light, the cars and
// crowds, the HUD with its minimap, and the title, pause and busted/wasted cards. The camera
// follows Renzo and breathes out a little as his car gathers speed.

import { BLOCK, CITY_W, PALETTE, PITCH, ROAD, WORLD_H, WORLD_W } from './config.js';
import { CITY_H, WATER_Y, blockRect, roadCenterX, roadCenterY } from './city.js';
import { SCREEN_OVER, SCREEN_PAUSE, SCREEN_PLAY, SCREEN_TITLE } from './world.js';
import { STORY } from './missions.js';

const FONT = 'system-ui, "Segoe UI", Roboto, sans-serif';

/** The one entry point main.js calls each frame. */
export function drawFrame(ctx, state, dt) {
  const { w, h } = state.view;
  updateCamera(state, dt);
  drawWorld(ctx, state);
  if (state.screen === SCREEN_PLAY || state.screen === SCREEN_PAUSE) drawHUD(ctx, state);
  if (state.screen === SCREEN_TITLE) drawTitle(ctx, state);
  if (state.screen === SCREEN_PAUSE) drawPause(ctx, state);
  if (state.screen === SCREEN_OVER) drawOver(ctx, state);
  if (state.hurtFlash > 0 && state.screen === SCREEN_PLAY) {
    ctx.fillStyle = `rgba(200,30,30,${state.hurtFlash * 0.55})`;
    ctx.fillRect(0, 0, w, h);
  }
}

function updateCamera(state, dt) {
  const cam = state.camera;
  const focus = state.player.car ?? state.player;
  const speedRatio = state.player.car ? Math.abs(state.player.car.speed) / state.player.car.model.speed : 0;
  const targetZoom = state.player.car ? 1.02 - speedRatio * 0.24 : 1.08;
  const k = Math.min(1, dt * 4.5);
  cam.x += (focus.x - cam.x) * k;
  cam.y += (focus.y - cam.y) * k;
  cam.zoom += (targetZoom - cam.zoom) * Math.min(1, dt * 2.5);
  const viewW = state.view.w / cam.zoom;
  const viewH = state.view.h / cam.zoom;
  cam.x = Math.max(viewW / 2 - 50, Math.min(WORLD_W - viewW / 2 + 50, cam.x));
  cam.y = Math.max(viewH / 2 - 50, Math.min(WORLD_H - viewH / 2 + 50, cam.y));
}

// ---------- the world ----------

function drawWorld(ctx, state) {
  const { w, h } = state.view;
  const cam = state.camera;
  ctx.fillStyle = PALETTE.seaDeep;
  ctx.fillRect(0, 0, w, h);
  ctx.save();
  const shakeX = state.shake ? (state.random() - 0.5) * state.shake : 0;
  const shakeY = state.shake ? (state.random() - 0.5) * state.shake : 0;
  ctx.translate(w / 2, h / 2);
  ctx.scale(cam.zoom, cam.zoom);
  ctx.translate(-cam.x + shakeX, -cam.y + shakeY);

  const left = cam.x - w / cam.zoom / 2 - 40;
  const right = cam.x + w / cam.zoom / 2 + 40;
  const top = cam.y - h / cam.zoom / 2 - 40;
  const bottom = cam.y + h / cam.zoom / 2 + 40;

  drawGround(ctx, state, left, top, right, bottom);
  drawObjectiveMarker(ctx, state);
  for (const pickup of state.pickups) drawPickup(ctx, state, pickup);
  for (const car of state.cars) drawCar(ctx, state, car);
  for (const ped of state.peds) drawPed(ctx, state, ped);
  if (!state.player.car && state.screen !== SCREEN_TITLE) drawPlayer(ctx, state);
  drawBullets(ctx, state);
  drawFx(ctx, state);

  ctx.restore();
  // Warm late light over everything, and a soft vignette.
  const glow = ctx.createLinearGradient(0, 0, 0, h);
  glow.addColorStop(0, 'rgba(255,170,80,0.10)');
  glow.addColorStop(1, 'rgba(60,20,60,0.12)');
  ctx.fillStyle = glow;
  ctx.fillRect(0, 0, w, h);
}

function drawGround(ctx, state, left, top, right, bottom) {
  const city = state.city;
  // Sand and sea to the south.
  ctx.fillStyle = PALETTE.sand;
  ctx.fillRect(0, CITY_H, CITY_W, WORLD_H - CITY_H);
  ctx.fillStyle = PALETTE.sea;
  ctx.fillRect(-80, WATER_Y, WORLD_W + 160, WORLD_H - WATER_Y + 80);
  ctx.strokeStyle = 'rgba(255,255,255,0.35)';
  ctx.lineWidth = 2;
  ctx.beginPath();
  for (let i = 0; i < 9; i += 1) {
    const y = WATER_Y + 14 + i * 16 + Math.sin(state.time * 1.3 + i * 1.7) * 3;
    for (let x = -40; x < WORLD_W + 40; x += 130) {
      ctx.moveTo(x + (i % 2) * 40, y);
      ctx.quadraticCurveTo(x + 22 + (i % 2) * 40, y - 5, x + 46 + (i % 2) * 40, y);
    }
  }
  ctx.stroke();
  // Foam at the shoreline.
  ctx.strokeStyle = 'rgba(255,255,255,0.6)';
  ctx.beginPath();
  ctx.moveTo(0, WATER_Y + Math.sin(state.time * 2) * 2);
  ctx.lineTo(CITY_W, WATER_Y + Math.cos(state.time * 1.7) * 2);
  ctx.stroke();

  // Asphalt everywhere, then each block's sidewalk and ground on top.
  ctx.fillStyle = PALETTE.asphalt;
  ctx.fillRect(0, 0, CITY_W, CITY_H);
  for (let col = 0; col < 6; col += 1) {
    for (let row = 0; row < 5; row += 1) {
      const rect = blockRect(col, row);
      if (rect.x > right || rect.y > bottom || rect.x + rect.w < left || rect.y + rect.h < top) continue;
      ctx.fillStyle = PALETTE.sidewalk;
      ctx.fillRect(rect.x - 13, rect.y - 13, rect.w + 26, rect.h + 26);
      const isPark = rect.x === city.park.x && rect.y === city.park.y;
      const isLot = rect.x === city.lot.x && rect.y === city.lot.y;
      const isSpray = city.pois.spray.lot && rect.x === city.pois.spray.lot.x && rect.y === city.pois.spray.lot.y;
      ctx.fillStyle = isPark ? PALETTE.park : isLot ? '#4a4e55' : isSpray ? '#6d7f7c' : PALETTE.blockGround;
      ctx.fillRect(rect.x, rect.y, rect.w, rect.h);
      if (isLot) { // painted parking bays
        ctx.strokeStyle = 'rgba(255,255,255,0.5)';
        ctx.lineWidth = 2;
        for (let r = 0; r < 3; r += 1) for (let c = 0; c < 4; c += 1) {
          ctx.strokeRect(rect.x + 12 + c * 52, rect.y + 18 + r * 66, 46, 56);
        }
      }
      if (isSpray) {
        ctx.fillStyle = 'rgba(95,201,192,0.25)';
        ctx.fillRect(rect.x + 30, rect.y + 30, rect.w - 60, rect.h - 60);
        label(ctx, 'BRILLO AUTO SPA', rect.x + rect.w / 2, rect.y + rect.h / 2, 17, '#eafffc', 'center', 0.9);
      }
      if (isPark) {
        ctx.strokeStyle = 'rgba(236,210,154,0.7)';
        ctx.lineWidth = 7;
        ctx.beginPath();
        ctx.moveTo(rect.x, rect.y + rect.h / 2);
        ctx.lineTo(rect.x + rect.w, rect.y + rect.h / 2);
        ctx.moveTo(rect.x + rect.w / 2, rect.y);
        ctx.lineTo(rect.x + rect.w / 2, rect.y + rect.h);
        ctx.stroke();
      }
    }
  }
  // Lane dashes along every road centre, broken at intersections.
  ctx.strokeStyle = PALETTE.lane;
  ctx.lineWidth = 3;
  ctx.setLineDash([26, 22]);
  ctx.beginPath();
  for (let i = 0; i <= 6; i += 1) {
    ctx.moveTo(roadCenterX(i), 10);
    ctx.lineTo(roadCenterX(i), CITY_H - 10);
  }
  for (let j = 0; j <= 5; j += 1) {
    ctx.moveTo(10, roadCenterY(j));
    ctx.lineTo(CITY_W - 10, roadCenterY(j));
  }
  ctx.stroke();
  ctx.setLineDash([]);

  for (const tree of city.trees) {
    if (tree.x < left || tree.x > right || tree.y < top || tree.y > bottom) continue;
    drawTree(ctx, tree);
  }
  for (const building of city.buildings) {
    if (building.x > right || building.y > bottom || building.x + building.w < left || building.y + building.h < top) continue;
    drawBuilding(ctx, building);
  }
  // Doorstep signs for the named places.
  for (const poi of Object.values(city.pois)) {
    if (poi.x < left || poi.x > right || poi.y < top || poi.y > bottom) continue;
    ctx.fillStyle = poi.color;
    ctx.beginPath();
    ctx.arc(poi.x, poi.y, 11, 0, Math.PI * 2);
    ctx.fill();
    ctx.strokeStyle = 'rgba(255,255,255,0.9)';
    ctx.lineWidth = 2;
    ctx.stroke();
    label(ctx, poi.name[0], poi.x, poi.y + 1, 12, '#14202b', 'center', 1);
  }
}

function drawTree(ctx, tree) {
  ctx.fillStyle = 'rgba(30,40,20,0.25)';
  ctx.beginPath();
  ctx.ellipse(tree.x + 5, tree.y + 7, tree.r * 1.05, tree.r * 0.8, 0, 0, Math.PI * 2);
  ctx.fill();
  ctx.fillStyle = '#7a5b3a';
  ctx.fillRect(tree.x - 2.5, tree.y - 2, 5, 9);
  ctx.fillStyle = '#3e7d3a';
  for (const [ox, oy, r] of [[0, -4, 1], [-0.55, 2, 0.72], [0.55, 2, 0.72]]) {
    ctx.beginPath();
    ctx.arc(tree.x + ox * tree.r, tree.y + oy, tree.r * r, 0, Math.PI * 2);
    ctx.fill();
  }
  ctx.fillStyle = '#4c9150';
  ctx.beginPath();
  ctx.arc(tree.x - tree.r * 0.25, tree.y - tree.r * 0.4, tree.r * 0.5, 0, Math.PI * 2);
  ctx.fill();
}

function drawBuilding(ctx, b) {
  ctx.fillStyle = PALETTE.roofShadow;
  ctx.fillRect(b.x + 9, b.y + 12, b.w, b.h);
  ctx.fillStyle = b.roof;
  ctx.fillRect(b.x, b.y, b.w, b.h);
  ctx.strokeStyle = 'rgba(60,30,20,0.55)';
  ctx.lineWidth = 3;
  ctx.strokeRect(b.x + 4, b.y + 4, b.w - 8, b.h - 8);
  // Rooftop clutter placed by the building's own seed: AC boxes and a water tank.
  ctx.fillStyle = 'rgba(255,255,255,0.20)';
  const ax = b.x + 12 + b.seed * (b.w - 44);
  const ay = b.y + 12 + ((b.seed * 7) % 1) * (b.h - 44);
  ctx.fillRect(ax, ay, 20, 15);
  if (b.w > 76 && b.h > 76) {
    ctx.beginPath();
    ctx.arc(b.x + b.w - 22, b.y + b.h - 22, 10, 0, Math.PI * 2);
    ctx.fillStyle = 'rgba(90,60,40,0.5)';
    ctx.fill();
  }
  if (b.name) label(ctx, b.name.toUpperCase(), b.x + b.w / 2, b.y + b.h / 2, 11, 'rgba(30,18,12,0.66)', 'center', 0.75);
}

function drawObjectiveMarker(ctx, state) {
  const objective = state.objective;
  if (!objective || objective.x === null || objective.x === undefined) return;
  const pulse = 1 + Math.sin(state.time * 5) * 0.12;
  const grad = ctx.createLinearGradient(0, objective.y - 190, 0, objective.y);
  grad.addColorStop(0, 'rgba(255,217,77,0)');
  grad.addColorStop(1, 'rgba(255,217,77,0.5)');
  ctx.fillStyle = grad;
  ctx.fillRect(objective.x - 7, objective.y - 190, 14, 190);
  ctx.strokeStyle = objective.color;
  ctx.lineWidth = 3.5;
  ctx.beginPath();
  ctx.arc(objective.x, objective.y, 26 * pulse, 0, Math.PI * 2);
  ctx.stroke();
  ctx.fillStyle = objective.color;
  ctx.beginPath();
  ctx.arc(objective.x, objective.y, 5, 0, Math.PI * 2);
  ctx.fill();
}

function drawPickup(ctx, state, pickup) {
  const bobY = Math.sin(state.time * 4 + pickup.bob) * 3;
  const y = pickup.y + bobY;
  const styles = {
    cash: ['#39d353', '$'], health: ['#f2f2f2', '+'], armor: ['#5b8dd9', 'A'], ammo: ['#f4a259', '≡'],
  };
  const [color, glyph] = styles[pickup.kind] ?? styles.cash;
  ctx.fillStyle = 'rgba(0,0,0,0.25)';
  ctx.beginPath();
  ctx.ellipse(pickup.x, pickup.y + 8, 11, 5, 0, 0, Math.PI * 2);
  ctx.fill();
  ctx.fillStyle = color;
  ctx.beginPath();
  ctx.arc(pickup.x, y, 10, 0, Math.PI * 2);
  ctx.fill();
  ctx.strokeStyle = 'rgba(255,255,255,0.85)';
  ctx.lineWidth = 1.6;
  ctx.stroke();
  label(ctx, glyph, pickup.x, y + 1, 12, pickup.kind === 'health' ? '#d33' : '#10231a', 'center', 1);
}

function drawCar(ctx, state, car) {
  ctx.save();
  ctx.translate(car.x, car.y);
  ctx.rotate(car.angle);
  ctx.fillStyle = 'rgba(15,15,20,0.35)';
  roundRect(ctx, -20, -8 + 5, 46, 22, 6);
  ctx.fill();
  ctx.fillStyle = car.color;
  roundRect(ctx, -23, -11, 46, 22, 6);
  ctx.fill();
  ctx.strokeStyle = 'rgba(0,0,0,0.35)';
  ctx.lineWidth = 1.4;
  roundRect(ctx, -23, -11, 46, 22, 6);
  ctx.stroke();
  // Cabin, glass and details.
  ctx.fillStyle = 'rgba(20,28,38,0.9)';
  roundRect(ctx, -6, -8.5, 17, 17, 3);
  ctx.fill();
  ctx.fillStyle = 'rgba(140,200,230,0.75)';
  roundRect(ctx, 8, -8, 4.5, 16, 2);
  ctx.fill();
  ctx.fillStyle = 'rgba(0,0,0,0.75)';
  for (const [wx, wy] of [[-15, -12.5], [13, -12.5], [-15, 9.5], [13, 9.5]]) ctx.fillRect(wx, wy, 8, 3.4);
  ctx.fillStyle = '#fff6c9';
  ctx.fillRect(21.5, -8, 2.4, 4.6);
  ctx.fillRect(21.5, 3.4, 2.4, 4.6);
  ctx.fillStyle = '#d33';
  ctx.fillRect(-24.5, -8, 2.2, 4.6);
  ctx.fillRect(-24.5, 3.4, 2.2, 4.6);
  if (car.livery === 'police') {
    ctx.fillStyle = '#2456a6';
    ctx.fillRect(-23, -3.4, 46, 6.8);
    const flash = Math.sin(state.time * 11) > 0;
    ctx.fillStyle = flash ? '#ff4444' : '#ff8888';
    ctx.fillRect(-4, -9.5, 6, 5);
    ctx.fillStyle = flash ? '#88aaff' : '#4466ff';
    ctx.fillRect(3, -9.5, 6, 5);
    label(ctx, 'POLICÍA', 1, 0.5, 6.4, '#ffffff', 'center', 1);
  }
  if (car.model.name === 'Taxi Sol') {
    ctx.fillStyle = '#14202b';
    ctx.fillRect(-3, -3.4, 7, 6.8);
    label(ctx, 'TAXI', 0.5, 0.4, 4.6, '#f4c542', 'center', 1);
  }
  if (car.health < 55) {
    ctx.fillStyle = `rgba(30,30,30,${0.45 - car.health * 0.006})`;
    roundRect(ctx, -23, -11, 46, 22, 6);
    ctx.fill();
  }
  ctx.restore();
}

function drawPersonFigure(ctx, x, y, angle, shirt, skin, phase, moving, capColor = null) {
  ctx.fillStyle = 'rgba(15,15,20,0.3)';
  ctx.beginPath();
  ctx.ellipse(x + 3, y + 5, 10, 7, 0, 0, Math.PI * 2);
  ctx.fill();
  ctx.save();
  ctx.translate(x, y);
  ctx.rotate(angle);
  if (moving) {
    ctx.strokeStyle = '#2e3440';
    ctx.lineWidth = 3.4;
    const swing = Math.sin(phase) * 6;
    ctx.beginPath();
    ctx.moveTo(0, 0);
    ctx.lineTo(-3 + swing * 0.4, 5 + Math.abs(swing) * 0.3);
    ctx.moveTo(0, 0);
    ctx.lineTo(-3 - swing * 0.4, -5 - Math.abs(swing) * 0.3);
    ctx.stroke();
  }
  ctx.fillStyle = shirt;
  ctx.beginPath();
  ctx.arc(0, 0, 8, 0, Math.PI * 2);
  ctx.fill();
  ctx.fillStyle = skin;
  ctx.beginPath();
  ctx.arc(2.5, 0, 4.6, 0, Math.PI * 2);
  ctx.fill();
  if (capColor) {
    ctx.fillStyle = capColor;
    ctx.beginPath();
    ctx.arc(2.5, 0, 4.8, Math.PI * 0.7, Math.PI * 1.9);
    ctx.fill();
  }
  ctx.restore();
}

function drawPed(ctx, state, ped) {
  if (ped.state === 'down' || ped.dead) {
    ctx.save();
    ctx.translate(ped.x, ped.y);
    ctx.rotate(ped.angle + Math.PI / 2);
    ctx.globalAlpha = ped.dead ? 0.85 : 0.95;
    ctx.fillStyle = ped.shirt;
    roundRect(ctx, -11, -5, 22, 10, 5);
    ctx.fill();
    ctx.fillStyle = ped.skin;
    ctx.beginPath();
    ctx.arc(13, 0, 4.4, 0, Math.PI * 2);
    ctx.fill();
    ctx.restore();
    ctx.globalAlpha = 1;
    return;
  }
  const moving = ped.speed > 8 || (ped.role === 'cop' && ped.state !== 'down');
  drawPersonFigure(ctx, ped.x, ped.y, ped.angle, ped.shirt, ped.skin, ped.phase, moving, ped.role === 'cop' ? '#1d3355' : null);
}

function drawPlayer(ctx, state) {
  const player = state.player;
  // A faint aim line toward the mouse while on foot.
  if (state.screen === SCREEN_PLAY && state.aimX !== undefined) {
    ctx.strokeStyle = 'rgba(255,255,255,0.18)';
    ctx.lineWidth = 1.4;
    ctx.setLineDash([5, 7]);
    ctx.beginPath();
    ctx.moveTo(player.x, player.y);
    ctx.lineTo(state.aimX, state.aimY);
    ctx.stroke();
    ctx.setLineDash([]);
  }
  const moving = Math.hypot(player.vx, player.vy) > 12;
  drawPersonFigure(ctx, player.x, player.y, player.angle, '#ff7847', '#e0ac69', player.phase, moving);
  // A white ring so Renzo is never lost in the crowd.
  ctx.strokeStyle = 'rgba(255,255,255,0.75)';
  ctx.lineWidth = 1.8;
  ctx.beginPath();
  ctx.arc(player.x, player.y, 13.5, 0, Math.PI * 2);
  ctx.stroke();
}

function drawBullets(ctx, state) {
  ctx.strokeStyle = '#ffe9a3';
  ctx.lineWidth = 2.2;
  ctx.beginPath();
  for (const bullet of state.bullets) {
    ctx.moveTo(bullet.x - bullet.vx * 0.016, bullet.y - bullet.vy * 0.016);
    ctx.lineTo(bullet.x, bullet.y);
  }
  ctx.stroke();
}

function drawFx(ctx, state) {
  for (const p of state.fx) {
    const ratio = 1 - p.life / p.maxLife;
    ctx.globalAlpha = Math.max(0, ratio);
    ctx.fillStyle = p.color;
    ctx.beginPath();
    ctx.arc(p.x, p.y, p.size * (p.color.includes('70,70') ? 1 + p.life : 1), 0, Math.PI * 2);
    ctx.fill();
  }
  ctx.globalAlpha = 1;
}

// ---------- HUD ----------

function drawHUD(ctx, state) {
  const { w } = state.view;
  const player = state.player;

  // Objective panel, top-left.
  if (state.objective) {
    ctx.fillStyle = 'rgba(12,18,26,0.72)';
    const text = state.objective.text;
    const lines = wrapText(text, 30);
    roundRect(ctx, 14, 14, 268, 62 + lines.length * 19, 9);
    ctx.fill();
    label(ctx, state.mission.active ? `JOB — ${currentMissionTitle(state)}` : 'OBJECTIVE', 28, 33, 11, '#ffd94d', 'left', 1);
    ctx.fillStyle = '#f4f1e8';
    ctx.font = `600 14.5px ${FONT}`;
    ctx.textAlign = 'left';
    ctx.textBaseline = 'middle';
    lines.forEach((line, i) => ctx.fillText(line, 28, 56 + i * 19));
    if (state.objective.x !== null && state.objective.x !== undefined) {
      const focus = player.car ?? player;
      const dist = Math.hypot(state.objective.x - focus.x, state.objective.y - focus.y);
      label(ctx, `${Math.round(dist / 10)} m`, 28, 56 + lines.length * 19, 11.5, '#9fd8ff', 'left', 1);
    }
  }

  // Cash, respect and wanted stars, top-right.
  ctx.fillStyle = 'rgba(12,18,26,0.72)';
  roundRect(ctx, w - 218, 14, 204, 78, 9);
  ctx.fill();
  label(ctx, `$${state.cash.toLocaleString('en-US')}`, w - 28, 40, 25, '#7be495', 'right', 1);
  label(ctx, `RESPECT ${state.respect}`, w - 28, 66, 12, '#f4f1e8', 'right', 1);
  for (let i = 0; i < 5; i += 1) {
    const x = w - 196 + i * 27;
    const lit = i < state.wanted.stars;
    const flash = state.wanted.seenByCop && lit && Math.sin(state.time * 8) > 0;
    drawStar(ctx, x, 118, 11, lit ? (flash ? '#ff5544' : '#ffd94d') : 'rgba(255,255,255,0.22)');
  }

  // Health and armour, bottom-left; weapon beside them.
  const barW = 210;
  ctx.fillStyle = 'rgba(12,18,26,0.72)';
  roundRect(ctx, 14, state.view.h - 66, barW + 20, 52, 9);
  ctx.fill();
  drawBar(ctx, 24, state.view.h - 52, barW, 13, player.health / 100, '#e5484d', 'HEALTH');
  if (player.armor > 0) drawBar(ctx, 24, state.view.h - 32, barW, 9, player.armor / 100, '#5b8dd9', '');
  label(ctx, player.car ? player.car.model.name.toUpperCase() : 'PISTOL', 252, state.view.h - 46, 12.5, '#f4f1e8', 'left', 1);
  if (!player.car) label(ctx, `${state.ammo} rounds`, 252, state.view.h - 26, 12, '#ffd94d', 'left', 1);

  // Speedometer while driving.
  if (player.car) {
    const kmh = Math.round(Math.abs(player.car.speed) * 0.62);
    label(ctx, `${kmh}`, w - 28, state.view.h - 216, 30, '#ffffff', 'right', 1);
    label(ctx, 'km/h', w - 28, state.view.h - 192, 11, '#cfd8e3', 'right', 1);
  }

  drawMinimap(ctx, state);
  drawToasts(ctx, state);

  // The arrest bar, centre-bottom, when an officer has hands nearly on Renzo.
  if (state.wanted.bustMeter > 0.02) {
    const bw = 300;
    const x = (w - bw) / 2;
    const y = state.view.h - 118;
    ctx.fillStyle = 'rgba(12,18,26,0.8)';
    roundRect(ctx, x - 10, y - 24, bw + 20, 52, 9);
    ctx.fill();
    label(ctx, 'THE LAW IS CLOSING IN — RUN!', w / 2, y - 8, 12.5, '#ff8877', 'center', 1);
    ctx.fillStyle = '#3a3f46';
    roundRect(ctx, x, y + 6, bw, 10, 5);
    ctx.fill();
    ctx.fillStyle = '#e5484d';
    roundRect(ctx, x, y + 6, bw * Math.min(1, state.wanted.bustMeter), 10, 5);
    ctx.fill();
  }

  // Mission banner: big and brief.
  if (state.banner) {
    const remain = state.banner.until - state.time;
    const alpha = Math.min(1, remain / 0.6, (3.6 - remain) / 0.4 + 0.2);
    ctx.globalAlpha = Math.max(0, Math.min(1, alpha));
    label(ctx, state.banner.title, w / 2, 120, 44, '#ffd94d', 'center', 1);
    label(ctx, state.banner.sub, w / 2, 152, 17, '#ffffff', 'center', 1);
    ctx.globalAlpha = 1;
  }
}

function currentMissionTitle(state) {
  if (!state.mission.active) return '';
  const mission = STORY[state.mission.index];
  return mission ? mission.title.toUpperCase() : '';
}

function drawMinimap(ctx, state) {
  const size = 188;
  const x0 = state.view.w - size - 14;
  const y0 = state.view.h - size - 14;
  const scale = Math.min(size / WORLD_W, size / WORLD_H);
  const mapW = WORLD_W * scale;
  const mapH = WORLD_H * scale;
  const ox = x0 + (size - mapW) / 2;
  const oy = y0 + (size - mapH) / 2;
  ctx.fillStyle = 'rgba(10,16,22,0.82)';
  roundRect(ctx, x0 - 4, y0 - 4, size + 8, size + 8, 10);
  ctx.fill();
  ctx.fillStyle = '#20313d';
  ctx.fillRect(ox, oy, mapW, mapH);
  ctx.fillStyle = PALETTE.sea;
  ctx.fillRect(ox, oy + WATER_Y * scale, mapW, (WORLD_H - WATER_Y) * scale);
  ctx.fillStyle = '#8b8378';
  for (let col = 0; col < 6; col += 1) for (let row = 0; row < 5; row += 1) {
    const rect = blockRect(col, row);
    ctx.fillRect(ox + (rect.x + 8) * scale, oy + (rect.y + 8) * scale, (BLOCK - 16) * scale, (BLOCK - 16) * scale);
  }
  ctx.fillStyle = PALETTE.park;
  ctx.fillRect(ox + state.city.park.x * scale, oy + state.city.park.y * scale, state.city.park.w * scale, state.city.park.h * scale);
  const blip = (wx, wy, color, r = 3) => {
    ctx.fillStyle = color;
    ctx.beginPath();
    ctx.arc(ox + wx * scale, oy + wy * scale, r, 0, Math.PI * 2);
    ctx.fill();
  };
  for (const poi of Object.values(state.city.pois)) blip(poi.x, poi.y, poi.color, 2.4);
  for (const car of state.cars) if (car.kind === 'police' && !car.dead) blip(car.x, car.y, Math.sin(state.time * 9) > 0 ? '#ff5544' : '#5599ff', 3);
  if (state.objective && state.objective.x !== null && state.objective.x !== undefined) {
    const pulse = 3.6 + Math.sin(state.time * 5) * 1.1;
    blip(state.objective.x, state.objective.y, '#ffd94d', pulse);
  }
  // The player: a white arrow that turns with him.
  const focus = state.player.car ?? state.player;
  ctx.save();
  ctx.translate(ox + focus.x * scale, oy + focus.y * scale);
  ctx.rotate(focus.angle);
  ctx.fillStyle = '#ffffff';
  ctx.beginPath();
  ctx.moveTo(6.5, 0);
  ctx.lineTo(-4.5, -4);
  ctx.lineTo(-4.5, 4);
  ctx.closePath();
  ctx.fill();
  ctx.restore();
  label(ctx, 'N', x0 + size - 4, y0 + 8, 11, '#ffffff', 'right', 1);
  label(ctx, 'PORT SOLANA', x0 + 4, y0 + size - 2, 9.5, 'rgba(255,255,255,0.6)', 'left', 1);
}

function drawToasts(ctx, state) {
  const { w, h } = state.view;
  let y = h - 150;
  for (let i = state.toasts.length - 1; i >= 0; i -= 1) {
    const toast = state.toasts[i];
    const alpha = Math.min(1, (toast.until - state.time) / 0.5);
    ctx.globalAlpha = Math.max(0, alpha);
    ctx.font = `600 14px ${FONT}`;
    const width = ctx.measureText(toast.text).width + 30;
    ctx.fillStyle = 'rgba(12,18,26,0.78)';
    roundRect(ctx, (w - width) / 2, y - 15, width, 30, 15);
    ctx.fill();
    label(ctx, toast.text, w / 2, y + 1, 14, '#ffe9a3', 'center', 1);
    y -= 38;
  }
  ctx.globalAlpha = 1;
}

// ---------- screens ----------

function drawTitle(ctx, state) {
  const { w, h } = state.view;
  const grad = ctx.createLinearGradient(0, 0, 0, h);
  grad.addColorStop(0, 'rgba(24,10,40,0.42)');
  grad.addColorStop(0.55, 'rgba(24,10,40,0.18)');
  grad.addColorStop(1, 'rgba(10,6,20,0.66)');
  ctx.fillStyle = grad;
  ctx.fillRect(0, 0, w, h);

  label(ctx, 'SOLMAR', w / 2, h * 0.24, 92, '#ffb347', 'center', 1);
  label(ctx, 'HEAT', w / 2, h * 0.24 + 84, 92, '#ff7847', 'center', 1);
  label(ctx, 'P O R T   S O L A N A', w / 2, h * 0.24 + 138, 19, '#ffe9a3', 'center', 1);
  label(ctx, 'Renzo crossed the sea with nothing but a debt. The city owes him a living — one job at a time.', w / 2, h * 0.24 + 172, 15.5, '#f4f1e8', 'center', 1);

  const has = state.hasSave;
  const blink = Math.sin(state.time * 3.2) > -0.2;
  if (blink) label(ctx, has ? 'Press ENTER for a new life — or C to continue the old one' : 'Press ENTER to start', w / 2, h * 0.68, 19, '#ffffff', 'center', 1);
  label(ctx, 'WASD / arrows — move & drive · E — enter / steal car · F — punch · Mouse + click — pistol', w / 2, h * 0.78, 14, '#cfd8e3', 'center', 1);
  label(ctx, 'Shift — run · Space — handbrake · S — save at Casa de Renzo · P — pause · M — mute', w / 2, h * 0.78 + 24, 14, '#cfd8e3', 'center', 1);
  label(ctx, 'An original open-world crime caper. Every name, street and story in Port Solana is invented.', w / 2, h - 26, 12, 'rgba(255,255,255,0.55)', 'center', 1);
}

function drawPause(ctx, state) {
  const { w, h } = state.view;
  ctx.fillStyle = 'rgba(8,10,16,0.62)';
  ctx.fillRect(0, 0, w, h);
  label(ctx, 'PAUSED', w / 2, h * 0.4, 52, '#ffd94d', 'center', 1);
  label(ctx, 'P or Esc — back to the streets', w / 2, h * 0.4 + 48, 16, '#ffffff', 'center', 1);
  label(ctx, 'S at Casa de Renzo saves the game. Jobs autosave when they are done.', w / 2, h * 0.4 + 76, 14, '#cfd8e3', 'center', 1);
}

function drawOver(ctx, state) {
  const { w, h } = state.view;
  const busted = state.flags.busted;
  ctx.fillStyle = busted ? 'rgba(16,30,60,0.55)' : 'rgba(60,8,8,0.55)';
  ctx.fillRect(0, 0, w, h);
  label(ctx, busted ? 'BUSTED' : 'WASTED', w / 2, h * 0.42, 76, busted ? '#7fb5ff' : '#ff6b5e', 'center', 1);
  label(ctx, busted ? 'The Comisaría Central thanks you for your donation.' : 'The Clínica Santa Brisa patches you up — for a price.', w / 2, h * 0.42 + 58, 16, '#ffffff', 'center', 1);
  if (Math.sin(state.time * 3.2) > -0.2) label(ctx, 'Press ENTER to wake up', w / 2, h * 0.42 + 96, 17, '#ffe9a3', 'center', 1);
}

// ---------- small helpers ----------

function roundRect(ctx, x, y, w, h, r) {
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.arcTo(x + w, y, x + w, y + h, r);
  ctx.arcTo(x + w, y + h, x, y + h, r);
  ctx.arcTo(x, y + h, x, y, r);
  ctx.arcTo(x, y, x + w, y, r);
  ctx.closePath();
}

function label(ctx, text, x, y, size, color, align = 'center', weight = 1) {
  ctx.font = `${weight >= 1 ? 700 : 600} ${size}px ${FONT}`;
  ctx.textAlign = align;
  ctx.textBaseline = 'middle';
  ctx.fillStyle = color;
  ctx.fillText(text, x, y);
}

function drawBar(ctx, x, y, w, h, ratio, color, caption) {
  ctx.fillStyle = '#2b2f36';
  roundRect(ctx, x, y, w, h, h / 2);
  ctx.fill();
  ctx.fillStyle = color;
  if (ratio > 0.01) {
    roundRect(ctx, x, y, w * Math.max(0.02, Math.min(1, ratio)), h, h / 2);
    ctx.fill();
  }
  if (caption) label(ctx, caption, x + 5, y + h / 2 + 0.5, 8.5, 'rgba(255,255,255,0.85)', 'left', 1);
}

function drawStar(ctx, cx, cy, r, color) {
  ctx.fillStyle = color;
  ctx.beginPath();
  for (let i = 0; i < 10; i += 1) {
    const radius = i % 2 === 0 ? r : r * 0.45;
    const angle = -Math.PI / 2 + (i * Math.PI) / 5;
    const x = cx + Math.cos(angle) * radius;
    const y = cy + Math.sin(angle) * radius;
    if (i === 0) ctx.moveTo(x, y);
    else ctx.lineTo(x, y);
  }
  ctx.closePath();
  ctx.fill();
}

function wrapText(text, chars) {
  const words = text.split(' ');
  const lines = [];
  let line = '';
  for (const word of words) {
    if ((line + ' ' + word).trim().length > chars && line) {
      lines.push(line);
      line = word;
    } else line = (line + ' ' + word).trim();
  }
  if (line) lines.push(line);
  return lines.slice(0, 3);
}
