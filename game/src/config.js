// Solmar Heat — tuning and world constants. Everything in the game reads its sizes, speeds and
// prices from here so the feel of Port Solana can be adjusted in one place.

// The city grid: square blocks separated by two-lane roads, a beach and the sea along the south.
export const ROAD = 96; // road width in world pixels
export const BLOCK = 224; // block size in world pixels
export const PITCH = ROAD + BLOCK; // distance between neighbouring road centrelines
export const COLS = 6; // blocks across
export const ROWS = 5; // blocks down
export const CITY_W = COLS * PITCH + ROAD; // asphalt-and-blocks width
export const BEACH_H = 300; // sand strip south of the last road
export const WORLD_W = CITY_W;
export const WORLD_H = ROWS * PITCH + ROAD + BEACH_H;

// The person on foot.
export const PLAYER = {
  radius: 11,
  walkSpeed: 158,
  runSpeed: 252,
  accel: 1500,
  maxHealth: 100,
  punchRange: 34,
  punchDamage: 34,
  punchCooldown: 0.34,
};

// Cars: arcade handling, one set of numbers for every body with per-type multipliers.
export const CAR = {
  length: 46,
  width: 22,
  accel: 340,
  brake: 520,
  reverse: 150,
  drag: 0.9,
  gripTurn: 2.6, // steering rate at speed, rad/s
  maxHealth: 100,
};

// Wanted levels run 0..5 stars. Heat is the fractional pressure underneath the stars.
export const WANTED = {
  maxStars: 5,
  decayPerSecond: 0.045, // heat lost while no crime is fresh and no cop sees the player
  sightRange: 330, // a cop or pedestrian inside this range witnesses crimes
  bustFillTime: 1.6, // seconds of close police contact on foot to get busted
};

// Prices and rewards, in Port Solana dollars.
export const PRICES = {
  sprayJob: 100, // Pay 'n Spray: repair + lose the heat
  ammoBox: 50, // +24 pistol rounds at the gun shop
  armorVest: 150,
  taxiFareBase: 40,
  courierBase: 120,
};

export const SAVE_KEY = 'solmar-heat-save-v1';

// A warm late-afternoon palette: sun-soaked stucco, teal sea, coral roofs.
export const PALETTE = {
  asphalt: '#3d4148',
  asphaltEdge: '#34383f',
  lane: '#e8c96a',
  sidewalk: '#b8ab98',
  blockGround: '#a89a83',
  park: '#5f9e52',
  sand: '#ecd29a',
  sea: '#2e8fa3',
  seaDeep: '#22707f',
  roofShadow: 'rgba(30,20,10,0.35)',
};
