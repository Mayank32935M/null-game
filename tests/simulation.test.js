// ============================================================================
// NULL GAME — Master Architectural & Simulation Test Suite
// Master Prompt Section 14: Testing and Quality Requirements
// ============================================================================

// Mock environment for Node.js
if (typeof globalThis.localStorage === 'undefined') {
  const store = new Map();
  globalThis.localStorage = {
    getItem: (k) => store.get(k) || null,
    setItem: (k, v) => store.set(k, String(v)),
    removeItem: (k) => store.delete(k),
    clear: () => store.clear(),
  };
}
if (typeof globalThis.window === 'undefined') {
  globalThis.window = globalThis;
}

import assert from 'node:assert';
import { createRNG, generateSeed } from '../engine/rng.js';
import {
  createDefaultState,
  initGame,
  saveGame,
  loadGame,
  resetGame,
  getGameState,
  getRNG,
  SAVE_VERSION,
} from '../engine/gameState.js';
import { resolveAction, ACTION_TYPES } from '../engine/actionEngine.js';
import {
  computeCrimeIndex,
  advanceWorld,
  processCharacterDeath,
  checkVictoryCondition,
  checkDefeatConditions,
  determineEnding,
  processNonlethalAction,
} from '../engine/worldSimulation.js';
import {
  validateLedgerEntry,
  processLedgerEntry,
  acceptSightBargain,
  isSightBargainAvailable,
  updateChallengeTimer,
} from '../engine/supernaturalEngine.js';
import {
  updateAllAgencyStatuses,
  getAgencyIntelSummary,
  getOverallThreatLevel,
} from '../engine/agencyEngine.js';
import {
  buildNarrativeContext,
  generateFallbackNarrative,
  requestNarrative,
  escapeHTML,
} from '../engine/narrativeEngine.js';
import {
  createEvent,
  EVENT_TYPES,
  VISIBILITY,
  getPublicEvents,
} from '../engine/eventEngine.js';
import { CHARACTERS, FACTIONS, SIM_PARAMS } from '../data/universe.js';

let passed = 0;
let failed = 0;

function test(name, fn) {
  try {
    fn();
    console.log(`  ✓ ${name}`);
    passed++;
  } catch (err) {
    console.error(`  ✗ ${name}`);
    console.error(`    ${err.message}`);
    failed++;
  }
}

async function testAsync(name, fn) {
  try {
    await fn();
    console.log(`  ✓ ${name}`);
    passed++;
  } catch (err) {
    console.error(`  ✗ ${name}`);
    console.error(`    ${err.message}`);
    failed++;
  }
}

console.log('\n========================================');
console.log('--- SUITE 1: RNG & DETERMINISM ---');
console.log('========================================');

test('mulberry32 seeded PRNG produces identical sequences for identical seeds', () => {
  const seed = 12345;
  const rng1 = createRNG(seed);
  const rng2 = createRNG(seed);

  for (let i = 0; i < 50; i++) {
    assert.strictEqual(rng1(), rng2(), `Mismatch at call index ${i}`);
  }
});

test('mulberry32 produces values strictly in [0, 1)', () => {
  const rng = createRNG(99999);
  for (let i = 0; i < 200; i++) {
    const val = rng();
    assert.ok(val >= 0 && val < 1, `Value ${val} out of bounds`);
  }
});

console.log('\n========================================');
console.log('--- SUITE 2: GAME STATE & PERSISTENCE ---');
console.log('========================================');

test('New-game initialization creates valid state with baseline values', () => {
  const state = createDefaultState({ seed: 42 });
  assert.strictEqual(state.saveVersion, SAVE_VERSION);
  assert.strictEqual(state.seed, 42);
  assert.strictEqual(state.turn, 0);
  assert.ok(state.crimeIndex > 80 && state.crimeIndex <= 100, `Unexpected crimeIndex: ${state.crimeIndex}`);
  assert.strictEqual(state.lifespanDays, SIM_PARAMS.defaultLifespanDays);
  assert.strictEqual(state.sightBargainAccepted, false);
  assert.strictEqual(state.totalLedgerEntries, 0);
  assert.ok(Object.keys(state.characters).length >= 8);
  assert.ok(Object.keys(state.agencies).length >= 3);
  assert.ok(Object.keys(state.factions).length >= 2);
});

test('State save and load round-trip preserves state fields and version', () => {
  const state = initGame({ forceNew: true, seed: 101 });
  state.turn = 5;
  state.lifespanDays = 8500;
  state.totalLedgerEntries = 3;
  saveGame();

  const loaded = loadGame();
  assert.strictEqual(loaded.turn, 5);
  assert.strictEqual(loaded.lifespanDays, 8500);
  assert.strictEqual(loaded.totalLedgerEntries, 3);
  assert.strictEqual(loaded.saveVersion, SAVE_VERSION);
});

test('State reset completely cleans up and generates fresh state', () => {
  initGame({ forceNew: true });
  const fresh = resetGame();
  assert.strictEqual(fresh.turn, 0);
  assert.strictEqual(fresh.totalLedgerEntries, 0);
  assert.strictEqual(fresh.eventLog.length, 0);
});

console.log('\n========================================');
console.log('--- SUITE 3: SUPERNATURAL ARTEFACT RULES ---');
console.log('========================================');

test('validateLedgerEntry rejects empty names and invalid causes', () => {
  const state = createDefaultState();
  const v1 = validateLedgerEntry({ targetName: '', cause: 'cardiac' }, state);
  assert.strictEqual(v1.valid, false);

  const v2 = validateLedgerEntry({ targetName: 'Test Target', cause: 'flying_anvil' }, state);
  assert.strictEqual(v2.valid, false);

  const v3 = validateLedgerEntry({ targetName: 'Valid Name', cause: 'cardiac' }, state);
  assert.strictEqual(v3.valid, true);
});

test('validateLedgerEntry rejects already dead targets', () => {
  const state = createDefaultState();
  state.characters.victorCrane.isAlive = false;

  const res = validateLedgerEntry({
    targetName: 'Victor Crane',
    targetId: 'victorCrane',
    cause: 'cardiac',
  }, state);

  assert.strictEqual(res.valid, false);
  assert.ok(res.errors[0].includes('already dead'));
});

test('processLedgerEntry deducts lifespan within documented bounds (3 to 14 days)', () => {
  const state = createDefaultState({ seed: 777 });
  const rng = createRNG(777);
  const initialLifespan = state.lifespanDays;

  const result = processLedgerEntry(
    { targetName: 'Generic Target', cause: 'cardiac' },
    state,
    rng
  );

  const cost = initialLifespan - state.lifespanDays;
  assert.ok(cost >= 3 && cost <= 14, `Lifespan cost ${cost} out of bounds`);
  assert.strictEqual(result.lifespanCost, cost);
  assert.strictEqual(state.totalLedgerEntries, 1);
});

test('acceptSightBargain cuts lifespan by exactly 50% and grants sight', () => {
  const state = createDefaultState();
  state.lifespanDays = 9000;
  assert.strictEqual(isSightBargainAvailable(state), true);

  const outcome = acceptSightBargain(state);
  assert.strictEqual(outcome.lifespanCost, 4500);
  assert.strictEqual(state.lifespanDays, 4500);
  assert.strictEqual(state.sightBargainAccepted, true);
  assert.strictEqual(state.canSeeNames, true);
  assert.strictEqual(state.canSeeLifespans, true);
  assert.strictEqual(isSightBargainAvailable(state), false);
});

console.log('\n========================================');
console.log('--- SUITE 4: DETERMINISTIC WORLD SIMULATION ---');
console.log('========================================');

test('computeCrimeIndex stays strictly in [0, 100]', () => {
  const maxCrime = {
    violent: 200,
    organised: 200,
    corruption: 200,
    exploitation: 200,
    institutionalCapacity: 0,
  };
  const minCrime = {
    violent: 0,
    organised: 0,
    corruption: 0,
    exploitation: 0,
    institutionalCapacity: 200,
  };

  const highIdx = computeCrimeIndex(maxCrime);
  const lowIdx = computeCrimeIndex(minCrime);

  assert.ok(highIdx <= 100 && highIdx > 90, `highIdx: ${highIdx}`);
  assert.ok(lowIdx >= 0 && lowIdx < 10, `lowIdx: ${lowIdx}`);
});

test('Eliminating faction leader Victor Crane triggers power vacuum and chaos surge', () => {
  const state = createDefaultState({ seed: 123 });
  const rng = createRNG(123);
  const initialViolent = state.crimeCategories.violent;

  const events = processCharacterDeath(state, 'victorCrane', 'cardiac', rng);

  assert.strictEqual(state.characters.victorCrane.isAlive, false);
  const vacuumEvent = events.find(e => e.type === EVENT_TYPES.POWER_VACUUM);
  assert.ok(vacuumEvent, 'Power vacuum event was not generated');
  assert.ok(state.activePowerVacuums.length > 0, 'No active power vacuum tracked');
  assert.ok(state.crimeCategories.violent >= initialViolent, 'Chaos surge failed to increase violent crime');
});

test('Natural crime drift increases crime over time without intervention', () => {
  const state = createDefaultState({ seed: 555 });
  const rng = createRNG(555);
  const initialCrime = state.crimeIndex;

  // Advance world 5 turns with no kills
  for (let t = 0; t < 5; t++) {
    advanceWorld(state, rng);
  }

  assert.ok(state.crimeIndex >= initialCrime, `Crime should drift upward; was ${initialCrime}, now ${state.crimeIndex}`);
  assert.strictEqual(state.turn, 5);
});

test('Nonlethal actions (supportInvestigation) increase institutional capacity', () => {
  const state = createDefaultState({ seed: 888 });
  const rng = createRNG(888);
  const initialCapacity = state.crimeCategories.institutionalCapacity;

  processNonlethalAction(state, 'supportInvestigation', {}, rng);
  assert.ok(state.crimeCategories.institutionalCapacity > initialCapacity);
});

test('Victory condition requires crimeIndex < 25 for 3 consecutive turns', () => {
  const state = createDefaultState();
  state.crimeIndexHistory = [30, 24, 22]; // only 2 turns below
  let v = checkVictoryCondition(state);
  assert.strictEqual(v.met, false);

  state.crimeIndexHistory = [30, 24, 22, 21]; // 3 turns below
  v = checkVictoryCondition(state);
  assert.strictEqual(v.met, true);
});

test('Defeat conditions trigger when lifespan <= 0 or exposure >= 95', () => {
  const state = createDefaultState();
  assert.strictEqual(checkDefeatConditions(state), null);

  state.lifespanDays = 0;
  const d1 = checkDefeatConditions(state);
  assert.ok(d1 && d1.type === 'consumed');

  state.lifespanDays = 5000;
  state.indicators.playerExposure = 96;
  const d2 = checkDefeatConditions(state);
  assert.ok(d2 && d2.type === 'exposed');
});

console.log('\n========================================');
console.log('--- SUITE 5: ACTIONS & AGENCIES ---');
console.log('========================================');

test('resolveAction coordinates ledger kill, advances world, and escalates agency', () => {
  const state = createDefaultState({ seed: 333 });
  const rng = createRNG(333);

  const result = resolveAction(
    ACTION_TYPES.LEDGER_ENTRY,
    {
      targetName: 'Tomasz Kovic',
      targetId: 'tomaszKovic',
      cause: 'cardiac',
    },
    state,
    rng
  );

  assert.strictEqual(result.success, true);
  assert.strictEqual(state.characters.tomaszKovic.isAlive, false);
  assert.strictEqual(state.totalLedgerEntries, 1);
  assert.strictEqual(state.turn, 1);
  assert.ok(result.events.length >= 3, `Expected at least 3 events, got ${result.events.length}`);

  // Agency investigation intensity must have increased
  const directorate = state.agencies.directorate;
  assert.ok(directorate.investigationIntensity > 0);
});

test('Agency summary and threat levels compute properly', () => {
  const state = createDefaultState();
  state.agencies.directorate.investigationIntensity = 70;
  state.agencies.directorate.currentStage = 'PURSUING';
  updateAllAgencyStatuses(state);

  const summary = getAgencyIntelSummary(state);
  assert.strictEqual(summary.length, 3);
  const dir = summary.find(a => a.agency === 'directorate');
  assert.strictEqual(dir.status, 'PURSUING');

  const threat = getOverallThreatLevel(state);
  assert.strictEqual(threat.level, 'HIGH');
});

console.log('\n========================================');
console.log('--- SUITE 6: NARRATIVE ENGINE & FALLBACKS ---');
console.log('========================================');

test('generateFallbackNarrative generates news without AI and contains no forbidden terms', () => {
  const state = createDefaultState({ seed: 444 });
  const rng = createRNG(444);
  const event = createEvent({
    type: EVENT_TYPES.DEATH,
    description: 'Victor Crane died of cardiac arrest.',
    turn: 1,
    data: { targetName: 'Victor Crane', cause: 'cardiac' },
  });

  const context = buildNarrativeContext(state, event);
  const narrative = generateFallbackNarrative('newsArticle', context, rng);

  assert.ok(narrative.headline.includes('Victor Crane'));
  assert.strictEqual(narrative.fromAI, false);
  assert.ok(typeof narrative.detail === 'string' && narrative.detail.length > 5);

  // Immersion check: must not mention forbidden supernatural terms
  const forbidden = ['ledger', 'supernatural', 'magic', 'spell'];
  const text = `${narrative.headline} ${narrative.detail}`.toLowerCase();
  for (const f of forbidden) {
    assert.strictEqual(text.includes(f), false, `Forbidden word ${f} found in narrative`);
  }
});

test('escapeHTML prevents script injection', () => {
  const malicious = '<script>alert("xss")</script>&"\'';
  const escaped = escapeHTML(malicious);
  assert.strictEqual(escaped.includes('<script>'), false);
  assert.ok(escaped.includes('&lt;script&gt;'));
});

await testAsync('requestNarrative cleanly falls back when provider has no API key', async () => {
  const state = createDefaultState({ seed: 777 });
  const rng = createRNG(777);
  const event = createEvent({
    type: EVENT_TYPES.DEATH,
    description: 'A suspect died.',
    turn: 1,
    data: { targetName: 'Elena Rostova', cause: 'accident' },
  });

  const context = buildNarrativeContext(state, event);
  // Empty provider object with no key
  const mockProvider = {
    generateNarrative: async () => { throw new Error('API key not set'); }
  };

  const narrative = await requestNarrative('newsArticle', context, {
    provider: mockProvider,
    rng,
  });

  assert.ok(narrative);
  assert.strictEqual(narrative.fromAI, false);
  assert.ok(narrative.headline.length > 0);
});

console.log('\n========================================');
console.log(`TOTAL TESTS: ${passed + failed}`);
console.log(`PASSED: ${passed}`);
console.log(`FAILED: ${failed}`);
console.log('========================================\n');

if (failed > 0) {
  process.exit(1);
}
