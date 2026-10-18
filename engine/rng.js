// ============================================================================
// NULL — Seeded Random Number Generator
// Deterministic randomness for reproducible simulation outcomes.
// Uses mulberry32 — a fast 32-bit PRNG with good statistical properties.
// ============================================================================

/**
 * Creates a seeded PRNG using the mulberry32 algorithm.
 * Every call to the returned function produces the next deterministic
 * float in [0, 1), exactly like Math.random() but reproducible.
 *
 * @param {number} seed — 32-bit integer seed
 * @returns {function(): number} A function that returns the next random float
 */
function createRNG(seed) {
  let state = seed | 0; // force to 32-bit integer

  return function next() {
    state = (state + 0x6D2B79F5) | 0;
    let t = Math.imul(state ^ (state >>> 15), 1 | state);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/**
 * Generates a random seed from the current timestamp and Math.random().
 * Used when the player starts a new game without specifying a seed.
 *
 * @returns {number} A 32-bit integer seed
 */
function generateSeed() {
  return (Date.now() ^ (Math.random() * 0xFFFFFFFF)) | 0;
}

// ---------------------------------------------------------------------------
// Utility functions — all take an rng function as first argument
// ---------------------------------------------------------------------------

/**
 * Returns a random integer in [min, max] inclusive.
 * @param {function} rng — seeded RNG function
 * @param {number} min
 * @param {number} max
 * @returns {number}
 */
function randomInt(rng, min, max) {
  return Math.floor(rng() * (max - min + 1)) + min;
}

/**
 * Returns a random float in [min, max).
 * @param {function} rng — seeded RNG function
 * @param {number} min
 * @param {number} max
 * @returns {number}
 */
function randomFloat(rng, min, max) {
  return rng() * (max - min) + min;
}

/**
 * Returns true with the given probability (0 to 1).
 * @param {function} rng — seeded RNG function
 * @param {number} probability — 0.0 to 1.0
 * @returns {boolean}
 */
function randomChance(rng, probability) {
  return rng() < probability;
}

/**
 * Picks a random element from an array.
 * @param {function} rng — seeded RNG function
 * @param {Array} arr
 * @returns {*}
 */
function randomPick(rng, arr) {
  if (!arr || arr.length === 0) return undefined;
  return arr[Math.floor(rng() * arr.length)];
}

/**
 * Shuffles an array in place using Fisher-Yates.
 * @param {function} rng — seeded RNG function
 * @param {Array} arr — mutated in place
 * @returns {Array} The same array, shuffled
 */
function shuffle(rng, arr) {
  for (let i = arr.length - 1; i > 0; i--) {
    const j = Math.floor(rng() * (i + 1));
    [arr[i], arr[j]] = [arr[j], arr[i]];
  }
  return arr;
}

// ---------------------------------------------------------------------------
// Exports
// ---------------------------------------------------------------------------

export {
  createRNG,
  generateSeed,
  randomInt,
  randomFloat,
  randomChance,
  randomPick,
  shuffle,
};
