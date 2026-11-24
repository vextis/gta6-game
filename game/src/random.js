// A small seeded random generator (mulberry32) so a given seed always builds the same Port
// Solana and the screenshot scenes are reproducible frame for frame.

export function makeRandom(seed) {
  let state = (seed >>> 0) || 1;
  return function random() {
    state = (state + 0x6d2b79f5) >>> 0;
    let t = state;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** Random float in [min, max). */
export function range(random, min, max) {
  return min + random() * (max - min);
}

/** Random integer in [min, max], both ends included. */
export function intRange(random, min, max) {
  return Math.floor(range(random, min, max + 1));
}

/** One element of a non-empty array, chosen by the seeded generator. */
export function pick(random, items) {
  return items[Math.floor(random() * items.length)];
}
