// Port Solana itself: a sun-soaked grid of stucco blocks, palms and named places, generated from
// the seed so every visit (and every screenshot) shows the same city. Also answers the spatial
// questions every other system asks: where the roads are, what a point collides with, where a
// car may park.

import { BLOCK, CITY_W, COLS, PITCH, ROAD, ROWS, WORLD_H } from './config.js';
import { intRange, pick, range } from './random.js';

export const CITY_H = ROWS * PITCH + ROAD; // where the last road ends and the beach begins
export const WATER_Y = CITY_H + 190; // the shoreline; past it the sea stops cars and swimmers

const ROOF_COLORS = ['#d96f4e', '#e08a5a', '#c95f63', '#e3a15c', '#b8574f', '#dda26a', '#c97b84'];
const WALL_NAMES = [
  'Hotel Palma Real', 'Café Brisa', 'Farmacia Sol', 'Hotel Coralina', 'Bar La Ola', 'Panadería Mar',
  'Hotel Brisa Norte', 'Tienda Azul', 'Bar El Faro', 'Hotel Dunas', 'Café Terraza', 'Joyas del Mar',
];

/** X centre of vertical road i (0..COLS) and y centre of horizontal road j (0..ROWS). */
export function roadCenterX(i) { return ROAD / 2 + i * PITCH; }
export function roadCenterY(j) { return ROAD / 2 + j * PITCH; }

/** The block cell (column, row) as a pixel rectangle. */
export function blockRect(col, row) {
  return { x: ROAD + col * PITCH, y: ROAD + row * PITCH, w: BLOCK, h: BLOCK };
}

/**
 * Build the whole city. Returns building rectangles (solid, with roof colour and an optional
 * business name), trees, the named places of interest with their doorstep markers, parking spots
 * and the special lots (park, beach car park) other systems decorate.
 */
export function buildCity(random) {
  const buildings = [];
  const trees = [];
  const parkingSpots = [];
  const pois = {};

  const addBuilding = (x, y, w, h, name = null) => {
    const building = { x, y, w, h, roof: pick(random, ROOF_COLORS), name, seed: random() };
    buildings.push(building);
    return building;
  };
  const addPoi = (id, name, col, row, color) => {
    const rect = blockRect(col, row);
    const building = addBuilding(rect.x + 42, rect.y + 42, rect.w - 84, rect.h - 84, name);
    pois[id] = {
      id, name, color,
      x: rect.x + rect.w / 2,
      y: rect.y + rect.h - 12, // doorstep on the south sidewalk
      building,
      col, row,
    };
    return pois[id];
  };

  // The named places the story and the services hang on.
  addPoi('police', 'Comisaría Central', 0, 0, '#7fa6c9');
  addPoi('hospital', 'Clínica Santa Brisa', 5, 0, '#e8e4da');
  addPoi('gunshop', 'Armería Costa', 3, 0, '#8a7f6a');
  addPoi('bank', 'Banco del Sol', 2, 2, '#e6cf8e');
  addPoi('cafe', 'Café Brisa', 1, 3, '#d98c5f');
  addPoi('hideout', 'Casa de Renzo', 0, 4, '#c2b49a');
  addPoi('chopshop', 'Talleres Roca', 5, 4, '#7d7468');
  addPoi('diner', 'Marina Grill', 2, 4, '#6fb3a5');

  // Pay 'n Spray is a drive-in lot, not a building: a painted apron on its block with a marker.
  const sprayRect = blockRect(4, 1);
  pois.spray = {
    id: 'spray', name: "Brillo Auto Spa", color: '#5fc9c0',
    x: sprayRect.x + sprayRect.w / 2, y: sprayRect.y + sprayRect.h / 2, building: null, col: 4, row: 1,
    lot: sprayRect,
  };

  // The park block: lawns and palms, no buildings.
  const parkRect = blockRect(3, 3);
  for (let i = 0; i < 16; i += 1) {
    trees.push({ x: parkRect.x + range(random, 18, parkRect.w - 18), y: parkRect.y + range(random, 18, parkRect.h - 18), r: range(random, 13, 20) });
  }

  // The beach car park block becomes rows of parking spots.
  const lotRect = blockRect(1, 1);
  for (let rowI = 0; rowI < 3; rowI += 1) {
    for (let colI = 0; colI < 4; colI += 1) {
      parkingSpots.push({ x: lotRect.x + 34 + colI * 52, y: lotRect.y + 40 + rowI * 66, angle: Math.PI / 2 });
    }
  }

  const special = new Set(['0,0', '5,0', '3,0', '2,2', '1,3', '0,4', '5,4', '2,4', '4,1', '3,3', '1,1']);
  let nameIndex = 0;
  for (let col = 0; col < COLS; col += 1) {
    for (let row = 0; row < ROWS; row += 1) {
      if (special.has(`${col},${row}`)) continue;
      const rect = blockRect(col, row);
      const count = intRange(random, 2, 3);
      for (let k = 0; k < count; k += 1) {
        const w = range(random, 62, 96);
        const h = range(random, 62, 96);
        const x = rect.x + 14 + (k % 2) * (rect.w / 2) + range(random, 0, 12);
        const y = rect.y + 14 + Math.floor(k / 2) * (rect.h / 2) + range(random, 0, 12);
        const name = random() < 0.4 ? WALL_NAMES[nameIndex++ % WALL_NAMES.length] : null;
        addBuilding(Math.min(x, rect.x + rect.w - w - 10), Math.min(y, rect.y + rect.h - h - 10), w, h, name);
      }
      // A couple of palms on the block's corners.
      if (random() < 0.8) trees.push({ x: rect.x + 12, y: rect.y + 12, r: range(random, 11, 16) });
      if (random() < 0.8) trees.push({ x: rect.x + rect.w - 12, y: rect.y + rect.h - 12, r: range(random, 11, 16) });
    }
  }

  // Palms along the beach and street corners on the promenade.
  for (let x = 60; x < CITY_W - 40; x += range(random, 90, 150)) {
    trees.push({ x, y: CITY_H + range(random, 26, 60), r: range(random, 13, 19) });
  }
  // Curbside parking spots scattered along block edges for stealable parked cars.
  for (let i = 0; i < 26; i += 1) {
    const vertical = random() < 0.5;
    if (vertical) {
      const roadI = intRange(random, 0, COLS);
      parkingSpots.push({ x: roadCenterX(roadI) + (random() < 0.5 ? -ROAD / 2 + 15 : ROAD / 2 - 15), y: range(random, 140, CITY_H - 140), angle: 0 });
    } else {
      const roadJ = intRange(random, 0, ROWS);
      parkingSpots.push({ x: range(random, 140, CITY_W - 140), y: roadCenterY(roadJ) + (random() < 0.5 ? -ROAD / 2 + 15 : ROAD / 2 - 15), angle: Math.PI / 2 });
    }
  }

  return { buildings, trees, parkingSpots, pois, park: parkRect, lot: lotRect };
}

/** True when the point is on asphalt (either road direction), inside the city part. */
export function onRoad(x, y) {
  if (y > CITY_H + 4) return false;
  const mx = ((x % PITCH) + PITCH) % PITCH;
  const my = ((y % PITCH) + PITCH) % PITCH;
  return mx < ROAD || my < ROAD;
}

/** True when the point is on a sidewalk ring around a block (where pedestrians prefer to walk). */
export function onSidewalk(x, y) {
  if (y > CITY_H) return false;
  const mx = ((x % PITCH) + PITCH) % PITCH;
  const my = ((y % PITCH) + PITCH) % PITCH;
  const nearBlockX = mx >= ROAD - 20 && mx < PITCH - 4;
  const nearBlockY = my >= ROAD - 20 && my < PITCH - 4;
  return (nearBlockX && my >= ROAD - 20) || (nearBlockY && mx >= ROAD - 20);
}

/** Push a circle (centre + radius) out of every building and clamp it inside the world. */
export function collideWorld(city, point, radius) {
  for (const b of city.buildings) {
    const nearestX = Math.max(b.x, Math.min(point.x, b.x + b.w));
    const nearestY = Math.max(b.y, Math.min(point.y, b.y + b.h));
    const dx = point.x - nearestX;
    const dy = point.y - nearestY;
    const distSq = dx * dx + dy * dy;
    if (distSq < radius * radius) {
      if (distSq > 0.0001) {
        const dist = Math.sqrt(distSq);
        point.x = nearestX + (dx / dist) * radius;
        point.y = nearestY + (dy / dist) * radius;
      } else {
        // Centre is inside the building: push out through the nearest face.
        const left = point.x - b.x;
        const right = b.x + b.w - point.x;
        const top = point.y - b.y;
        const bottom = b.y + b.h - point.y;
        const min = Math.min(left, right, top, bottom);
        if (min === left) point.x = b.x - radius;
        else if (min === right) point.x = b.x + b.w + radius;
        else if (min === top) point.y = b.y - radius;
        else point.y = b.y + b.h + radius;
      }
    }
  }
  point.x = Math.max(radius, Math.min(CITY_W - radius, point.x));
  point.y = Math.max(radius, Math.min(WORLD_H - radius - 6, point.y));
  if (point.y > WATER_Y + 46) point.y = WATER_Y + 46; // nobody wades out to sea
  return point;
}

/** Does a bullet's point sit inside a building? Buildings eat bullets. */
export function pointInBuilding(city, x, y) {
  for (const b of city.buildings) {
    if (x >= b.x && x <= b.x + b.w && y >= b.y && y <= b.y + b.h) return true;
  }
  return false;
}
