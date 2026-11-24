// Port Solana: a generated coastal city. Deterministic from a seed so the
// screenshots and every player's first visit show the same streets.

export function mulberry32(seed) {
  let a = seed >>> 0;
  return function () {
    a |= 0; a = (a + 0x6D2B79F5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export const WORLD_W = 3360;
export const WORLD_H = 2560;
const ROAD_HALF = 52;          // half the width of a street
const STEP = 420;              // block pitch
const FIRST = 240;             // first road centre on each axis

const ROOFS = ['#e8b4a0', '#d98e73', '#f2d38a', '#a8c6b8', '#8fb4d6', '#e5e0f0', '#f0a6a6', '#bcd6a2', '#e8cfa8', '#c9a8d6'];
const SHOP_NAMES = [
  'Café Azul', 'Taco Ola', 'Marina Motors', 'Hotel Brisa', 'Farmacia Luz', 'Bar El Faro',
  'Joyas del Mar', 'Panadería Sol', 'Surf & Sun', 'Banco Popular', 'Tienda Nube', 'Cine Coral',
  'Flores Mia', 'Gimnasio Ola', 'Librería Alba', 'Pizzería Nonna', 'Helados Frida', 'Óptica Mar',
];

export function buildCity(rng) {
  const roadsX = []; for (let x = FIRST; x < WORLD_W - 100; x += STEP) roadsX.push(x);
  const roadsY = []; for (let y = FIRST; y < 2100; y += STEP) roadsY.push(y);
  const beachY = 2160, seaY = 2360;
  const buildings = [];
  let shop = 0;

  // One special building per job, each pinned to a known block so missions
  // can point at them. kind !== 'shop' buildings keep their own sign.
  const specials = [
    { kind: 'club',   name: 'Club Sirena',    color: '#b04a8a', bx: 1, by: 0 },
    { kind: 'spray',  name: "Pay 'n Spray",   color: '#4a90b0', bx: 2, by: 0 },
    { kind: 'gunshop',name: 'Armería Sol',    color: '#707a88', bx: 4, by: 0 },
    { kind: 'police', name: 'Port Solana PD', color: '#3a5a9c', bx: 6, by: 1 },
    { kind: 'bank',   name: 'Banco del Sol',  color: '#c9a227', bx: 3, by: 2 },
    { kind: 'clinic', name: 'Clínica del Sol',color: '#e8e8e8', bx: 1, by: 3 },
    { kind: 'taco',   name: 'Taco Ola',       color: '#d6722c', bx: 5, by: 3 },
    { kind: 'garage', name: 'Taller Vega',    color: '#5a8a5a', bx: 6, by: 3 },
    { kind: 'marina', name: 'Marina Azul',    color: '#2c7a9c', bx: 2, by: 3 },
  ];
  const specialAt = new Map(specials.map(s => [s.bx + ',' + s.by, s]));

  // The park takes one whole block: no buildings, just lawns and palms.
  const parkBlock = { bx: 3, by: 1 };

  for (let bx = 0; bx < roadsX.length - 1; bx++) {
    for (let by = 0; by < roadsY.length - 1; by++) {
      const x0 = roadsX[bx] + ROAD_HALF + 14, x1 = roadsX[bx + 1] - ROAD_HALF - 14;
      const y0 = roadsY[by] + ROAD_HALF + 14, y1 = roadsY[by + 1] - ROAD_HALF - 14;
      const sp = specialAt.get(bx + ',' + by);
      if (sp) {
        buildings.push({ x: x0 + 10, y: y0 + 10, w: x1 - x0 - 20, h: y1 - y0 - 20, color: sp.color, name: sp.name, kind: sp.kind });
        continue;
      }
      if (bx === parkBlock.bx && by === parkBlock.by) continue;
      // Ordinary blocks: 2–4 buildings with a service lane between them.
      const n = 2 + Math.floor(rng() * 3);
      const cellW = (x1 - x0) / (n > 2 ? 2 : 1), cellH = (y1 - y0) / (n > 2 ? 2 : 1);
      for (let i = 0; i < n; i++) {
        const cx = x0 + (i % 2) * cellW, cy = y0 + Math.floor(i / 2) * cellH;
        const named = rng() < 0.55;
        buildings.push({
          x: cx + 8, y: cy + 8, w: cellW - 16, h: cellH - 16,
          color: ROOFS[Math.floor(rng() * ROOFS.length)],
          name: named ? SHOP_NAMES[shop++ % SHOP_NAMES.length] : null,
          kind: 'shop',
        });
      }
    }
  }

  const park = {
    x: roadsX[parkBlock.bx] + ROAD_HALF + 6, y: roadsY[parkBlock.by] + ROAD_HALF + 6,
    w: STEP - ROAD_HALF * 2 - 12, h: STEP - ROAD_HALF * 2 - 12,
    trees: [],
  };
  for (let i = 0; i < 26; i++) park.trees.push({ x: park.x + 20 + rng() * (park.w - 40), y: park.y + 20 + rng() * (park.h - 40) });

  const spots = {};
  for (const b of buildings) if (b.kind !== 'shop') {
    // The working spot is the kerb in front of the building's south face.
    spots[b.kind] = { x: b.x + b.w / 2, y: b.y + b.h + 26, bx: b.x, by: b.y, bw: b.w, bh: b.h };
  }
  return { roadsX, roadsY, buildings, park, beachY, seaY, spots, W: WORLD_W, H: WORLD_H };
}

// Circle vs. every building, plus the sea and the world edge. Streets, the
// park and the sand are walkable; deep water is not.
export function collides(city, x, y, r) {
  if (x < r || y < r || x > city.W - r || y > city.H - r) return true;
  if (y > city.seaY + 90) return true;
  for (const b of city.buildings) {
    if (x > b.x - r && x < b.x + b.w + r && y > b.y - r && y < b.y + b.h + r) return true;
  }
  return false;
}

// Push a circle out of whatever building it overlaps; returns true if moved.
export function pushOut(city, o, r) {
  let moved = false;
  for (const b of city.buildings) {
    const nx = Math.max(b.x, Math.min(o.x, b.x + b.w));
    const ny = Math.max(b.y, Math.min(o.y, b.y + b.h));
    let dx = o.x - nx, dy = o.y - ny;
    const d2 = dx * dx + dy * dy;
    if (d2 < r * r) {
      if (d2 === 0) { o.y = b.y + b.h + r; moved = true; continue; }
      const d = Math.sqrt(d2); o.x = nx + (dx / d) * r; o.y = ny + (dy / d) * r; moved = true;
    }
  }
  o.x = Math.max(r, Math.min(city.W - r, o.x));
  o.y = Math.max(r, Math.min(city.H - r, o.y));
  return moved;
}

export function onRoad(city, x, y) {
  for (const rx of city.roadsX) if (Math.abs(x - rx) < ROAD_HALF) return true;
  for (const ry of city.roadsY) if (Math.abs(y - ry) < ROAD_HALF) return true;
  return false;
}

export function drawCity(ctx, city, cam) {
  const vw = ctx.canvas.width, vh = ctx.canvas.height;
  const x0 = cam.x, y0 = cam.y, x1 = cam.x + vw, y1 = cam.y + vh;
  // Base: city blocks (concrete) then park lawn, sand and sea.
  ctx.fillStyle = '#9a938c'; ctx.fillRect(0, 0, vw, vh);
  ctx.fillStyle = '#5da85e'; ctx.fillRect(city.park.x - x0, city.park.y - y0, city.park.w, city.park.h);
  ctx.fillStyle = '#eed9a0'; ctx.fillRect(0, city.beachY - y0, vw, city.seaY - city.beachY);
  ctx.fillStyle = '#2e7fb8'; ctx.fillRect(0, city.seaY - y0, vw, city.H - city.seaY);
  ctx.fillStyle = '#57a8d8';
  for (let wy = city.seaY + 24; wy < city.H; wy += 46) ctx.fillRect(0, wy - y0, vw, 5);
  // Streets.
  ctx.fillStyle = '#3c3f45';
  for (const rx of city.roadsX) ctx.fillRect(rx - ROAD_HALF - x0, 0, ROAD_HALF * 2, Math.min(vh, city.beachY + 60 - y0));
  for (const ry of city.roadsY) ctx.fillRect(0, ry - ROAD_HALF - y0, vw, ROAD_HALF * 2);
  // Lane dashes.
  ctx.fillStyle = '#e8d98a';
  for (const rx of city.roadsX) for (let y = 12; y < city.beachY; y += 56) ctx.fillRect(rx - 2 - x0, y - y0, 4, 26);
  for (const ry of city.roadsY) for (let x = 12; x < city.W; x += 56) ctx.fillRect(x - x0, ry - 2 - y0, 26, 4);
  // Palms in the park and along the beach.
  ctx.fillStyle = '#2e7d46';
  const tree = (tx, ty) => { if (tx > x0 - 20 && tx < x1 + 20 && ty > y0 - 20 && ty < y1 + 20) { ctx.beginPath(); ctx.arc(tx - x0, ty - y0, 13, 0, 7); ctx.fill(); } };
  for (const t of city.park.trees) tree(t.x, t.y);
  for (let x = 90; x < city.W; x += 210) tree(x, city.beachY + 42);
  // Buildings: shadow, roof, sign.
  for (const b of city.buildings) {
    if (b.x + b.w < x0 || b.x > x1 || b.y + b.h < y0 || b.y > y1) continue;
    ctx.fillStyle = 'rgba(0,0,0,0.28)'; ctx.fillRect(b.x - x0 + 6, b.y - y0 + 8, b.w, b.h);
    ctx.fillStyle = b.color; ctx.fillRect(b.x - x0, b.y - y0, b.w, b.h);
    ctx.fillStyle = 'rgba(255,255,255,0.20)'; ctx.fillRect(b.x - x0 + 7, b.y - y0 + 7, b.w - 14, 12);
    if (b.name) {
      ctx.fillStyle = b.kind === 'shop' ? 'rgba(30,24,40,0.75)' : 'rgba(160,30,60,0.9)';
      ctx.font = 'bold 13px system-ui, sans-serif'; ctx.textAlign = 'center';
      ctx.fillText(b.name, b.x + b.w / 2 - x0, b.y + b.h - 10 - y0);
    }
  }
}
