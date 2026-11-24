// Solmar Heat — the handover program for the gta6-01 entry.
//
// The game itself is the static folder game/ (an original open-world crime
// caper set in Port Solana: steal cars, run Carmen Vega's jobs, rob the
// Banco del Sol, dodge the Port Solana PD). It needs no build step and no
// network: any static server can host it, and game/index.html is the door.
//
// This program does the handing-in. It mirrors game/ and screenshots/ into
// the output directory (MAKEFUN_OUTPUT_DIR locally, /output under the
// grader), sanity-checks the shape of the entry the way the scorer will —
// 3 or 4 screenshots, none over 256 KiB, a sane file count under game/ —
// and writes dossier.json with the vendored buildDossier so the judge
// reads the same summary I would.
//
//   mkdir -p out && MAKEFUN_OUTPUT_DIR=out node main.ts
//   node serve.ts   # then open http://localhost:8080 to play

import { cpSync, existsSync, mkdirSync, readdirSync, statSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { buildDossier } from './vendor/makefun-game.ts';

const here = fileURLToPath(new URL('.', import.meta.url));
const out = process.env.MAKEFUN_OUTPUT_DIR ?? '/output';
const SHOT_CAP = 262144; // 256 KiB, the scorer's per-screenshot ceiling

function walk(dir, base, acc) {
  for (const name of readdirSync(dir)) {
    const p = join(dir, name);
    if (statSync(p).isDirectory()) walk(p, base, acc);
    else acc.push(p.slice(base.length + 1));
  }
  return acc;
}

// The game folder must be present and non-trivial before anything is copied.
const gameDir = join(here, 'game');
if (!existsSync(join(gameDir, 'index.html'))) throw new Error('game/index.html is missing — nothing to hand in');
const gameFiles = walk(gameDir, gameDir, []);
if (gameFiles.length < 3) throw new Error(`game/ holds only ${gameFiles.length} files — the city did not build`);

// Screenshots: the cover is the first by name; all must be real and small.
const shotDir = join(here, 'screenshots');
const shots = existsSync(shotDir) ? readdirSync(shotDir).filter(f => /\.(png|jpe?g)$/i.test(f)).sort() : [];
if (shots.length < 3 || shots.length > 4) throw new Error(`need 3 or 4 screenshots, found ${shots.length}`);
for (const f of shots) {
  const bytes = statSync(join(shotDir, f)).size;
  if (bytes > SHOT_CAP) throw new Error(`screenshot ${f} is ${bytes} bytes — over the 256 KiB cap`);
}

mkdirSync(out, { recursive: true });
cpSync(gameDir, join(out, 'game'), { recursive: true });
mkdirSync(join(out, 'screenshots'), { recursive: true });
cpSync(shotDir, join(out, 'screenshots'), { recursive: true });

writeFileSync(
  join(out, 'dossier.json'),
  buildDossier(out, {
    text_max_bytes: 163840,
    screenshots: { max: 4, max_bytes: SHOT_CAP },
    game_max_files: 993,
    game_max_bytes: 50331648,
    game_path_max_bytes: 1000,
  }),
);

console.log(`Solmar Heat handed in: ${gameFiles.length} game files, ${shots.length} screenshots (${shots.join(', ')}) -> ${out}`);
