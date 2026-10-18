// ============================================================================
// NULL — Game State Engine (v2)
// Authoritative game state, initialization, persistence, and state access.
//
// This is the single source of truth for the game. All state mutations
// flow through validated actions (actionEngine.js). Screens read from
// this state but never write to it directly.
//
// Save schema version: 2.0
// Backward compatible with v1.0 saves via migration.
// ============================================================================

import { AGENCIES, CHARACTERS, FACTIONS, INDICATORS, CRIME_CATEGORIES, SIM_PARAMS, LEDGER_RULES } from '../data/universe.js';
import { createRNG, generateSeed } from './rng.js';
import { resetEventCounter, syncEventCounter } from './eventEngine.js';
import { computeCrimeIndex } from './worldSimulation.js';

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const STORAGE_KEYS = {
  GAME_STATE: 'null_game_state',
  RUN_HISTORY: 'null_run_history',
};

const SAVE_VERSION = '2.0';

// ---------------------------------------------------------------------------
// Default State Factory
// ---------------------------------------------------------------------------

/**
 * Creates a fresh default game state.
 * All game state lives in this object — no separate hidden state.
 *
 * @param {object} [options]
 * @param {boolean} [options.challengeMode=false] — Enable 3-hour challenge mode
 * @param {number} [options.seed] — RNG seed (generated if not provided)
 * @returns {object} A complete game state object
 */
function createDefaultState(options = {}) {
  const seed = options.seed || generateSeed();

  // Deep-clone characters and factions so each game has independent state
  const characters = {};
  for (const [id, char] of Object.entries(CHARACTERS)) {
    characters[id] = { ...char, evidence: [], crimeImpact: { ...char.crimeImpact }, deathConsequences: { ...char.deathConsequences } };
  }

  const factions = {};
  for (const [id, faction] of Object.entries(FACTIONS)) {
    factions[id] = { ...faction, crimeContribution: { ...faction.crimeContribution }, memberIds: [...faction.memberIds], rivalFactionIds: [...faction.rivalFactionIds] };
  }

  const agencies = {};
  for (const [id, agency] of Object.entries(AGENCIES)) {
    agencies[id] = {
      ...agency,
      stages: [...agency.stages],
      currentStage: 'DORMANT',
      investigationIntensity: 0,
      evidenceCount: 0,
      hypotheses: [],
      knownEvidence: [],
    };
  }

  const indicators = {};
  for (const [key, config] of Object.entries(INDICATORS)) {
    indicators[key] = config.baseline;
  }

  const crimeCategories = {};
  for (const [key, config] of Object.entries(CRIME_CATEGORIES)) {
    crimeCategories[key] = config.baseline;
  }

  return {
    // ---- Meta ----
    saveVersion: SAVE_VERSION,
    seed,
    rngCallCount: 0,       // Track RNG calls for reproducibility on load
    turn: 0,
    createdAt: Date.now(),
    lastSavedAt: null,

    // ---- Crime Index ----
    crimeIndex: computeCrimeIndex(crimeCategories),
    crimeCategories,
    crimeIndexHistory: [100],  // For victory stability check

    // ---- World Indicators ----
    indicators,

    // ---- Characters ----
    characters,

    // ---- Factions ----
    factions,
    activePowerVacuums: [],

    // ---- Agencies ----
    agencies,
    agencySuspicion: { directorate: 0, meridian: 0, panoptic: 0 },
    agencyStatus: { directorate: 'DORMANT', meridian: 'DORMANT', panoptic: 'DORMANT' },

    // ---- Supernatural ----
    lifespanDays: SIM_PARAMS.defaultLifespanDays,
    totalLedgerEntries: 0,
    entriesByCause: {},
    sightBargainAccepted: false,
    canSeeNames: false,
    canSeeLifespans: false,

    // ---- Challenge Mode ----
    challengeMode: options.challengeMode || false,
    challengeTimer: options.challengeMode ? {
      totalSeconds: SIM_PARAMS.challengeTimerSeconds,
      elapsedSeconds: 0,
      isRunning: false,
      lastResumedAt: null,
    } : null,

    // ---- Event Log ----
    eventLog: [],

    // ---- News Feed (derived from events, for UI display) ----
    newsFeed: [],

    // ---- Compound Memory ----
    runNumber: 1,
    compoundMemoryEnabled: false,
  };
}

// ---------------------------------------------------------------------------
// Live State — module-level singleton
// ---------------------------------------------------------------------------

let _gameState = null;
let _rng = null;

// ---------------------------------------------------------------------------
// Persistence
// ---------------------------------------------------------------------------

/**
 * Saves the current game state to localStorage.
 */
function saveGame() {
  if (!_gameState) {
    console.warn('[NULL] No active game state to save.');
    return;
  }
  _gameState.lastSavedAt = Date.now();

  // Snapshot RNG call count for reproducibility
  // (We can't directly serialize the RNG function, so we track call count)

  try {
    localStorage.setItem(STORAGE_KEYS.GAME_STATE, JSON.stringify(_gameState));
  } catch (err) {
    console.error('[NULL] Failed to save game state:', err);
  }
}

/**
 * Loads a saved game state from localStorage.
 * Returns null if no save exists or the save is malformed.
 *
 * @returns {object|null}
 */
function loadGame() {
  try {
    const raw = localStorage.getItem(STORAGE_KEYS.GAME_STATE);
    if (!raw) return null;

    const parsed = JSON.parse(raw);

    // Validate basic structure
    if (!parsed || typeof parsed !== 'object') {
      console.warn('[NULL] Malformed save data — not an object.');
      return null;
    }

    return parsed;
  } catch (err) {
    console.error('[NULL] Failed to load game state:', err);
    return null;
  }
}

// ---------------------------------------------------------------------------
// Save Migration
// ---------------------------------------------------------------------------

/**
 * Migrates a v1.0 save to the v2.0 format.
 * Preserves as much data as possible.
 *
 * @param {object} oldState — v1.0 game state
 * @returns {object} Migrated v2.0 game state
 */
function migrateV1ToV2(oldState) {
  console.log('[NULL] Migrating save from v1.0 to v2.0...');

  // Start with a fresh v2 state and overlay old data where compatible
  const fresh = createDefaultState();

  // Preserve compatible fields
  fresh.turn = oldState.totalKills || 0;
  fresh.lifespanDays = oldState.lifespanDays || SIM_PARAMS.defaultLifespanDays;
  fresh.totalLedgerEntries = oldState.totalKills || 0;
  fresh.runNumber = oldState.runNumber || 1;
  fresh.compoundMemoryEnabled = oldState.compoundMemoryEnabled || false;

  // Migrate crime rate to crime categories
  if (typeof oldState.crimeRate === 'number') {
    const ratio = oldState.crimeRate / 100;
    for (const key of Object.keys(fresh.crimeCategories)) {
      if (!CRIME_CATEGORIES[key].inverted) {
        fresh.crimeCategories[key] = CRIME_CATEGORIES[key].baseline * ratio;
      }
    }
    fresh.crimeIndex = computeCrimeIndex(fresh.crimeCategories);
  }

  // Migrate indicators
  fresh.indicators.publicFear = oldState.publicFearIndex || INDICATORS.publicFear.baseline;
  fresh.indicators.playerExposure = oldState.exposureRisk || INDICATORS.playerExposure.baseline;

  // Migrate Sight Bargain state from old "eyes deal"
  fresh.sightBargainAccepted = oldState.eyesDealActive || false;
  if (fresh.sightBargainAccepted) {
    fresh.canSeeNames = true;
    fresh.canSeeLifespans = true;
  }

  // Migrate entries by cause from old kill methods
  if (oldState.killMethods) {
    const methodMap = {
      heartAttack: 'cardiac',
      accident: 'accident',
      publicDeath: 'publicCollapse',
      manipulated: 'orchestrated',
    };
    for (const [oldKey, count] of Object.entries(oldState.killMethods)) {
      const newKey = methodMap[oldKey] || oldKey;
      fresh.entriesByCause[newKey] = count;
    }
  }

  // Migrate news feed
  if (Array.isArray(oldState.newsFeed)) {
    fresh.newsFeed = oldState.newsFeed.slice(0, 20);
  }

  fresh.saveVersion = SAVE_VERSION;
  fresh.createdAt = oldState.createdAt || Date.now();

  console.log('[NULL] Migration complete.');
  return fresh;
}

// ---------------------------------------------------------------------------
// Initialization
// ---------------------------------------------------------------------------

/**
 * Initializes the game. Checks for an existing save, migrates if needed,
 * or creates a fresh state.
 *
 * @param {object} [options]
 * @param {boolean} [options.forceNew=false] — Force a new game
 * @param {boolean} [options.challengeMode=false] — Enable challenge mode
 * @param {number} [options.seed] — RNG seed
 * @returns {object} The active game state
 */
function initGame(options = {}) {
  // Try to load existing save unless forcing a new game
  if (!options.forceNew) {
    const saved = loadGame();
    if (saved) {
      // Check version and migrate if needed
      if (saved.saveVersion !== SAVE_VERSION) {
        if (saved.version === '1.0' || !saved.saveVersion) {
          _gameState = migrateV1ToV2(saved);
        } else {
          console.warn('[NULL] Unknown save version, starting fresh.');
          _gameState = createDefaultState(options);
        }
      } else {
        _gameState = saved;
      }

      // Restore RNG
      _rng = createRNG(_gameState.seed);
      // Fast-forward RNG to the correct position
      for (let i = 0; i < (_gameState.rngCallCount || 0); i++) {
        _rng();
      }

      // Sync event counter
      syncEventCounter(_gameState.eventLog);

      return _gameState;
    }
  }

  // Create fresh state
  _gameState = createDefaultState(options);
  _rng = createRNG(_gameState.seed);
  resetEventCounter();

  // Compound memory
  if (options.compoundMemory) {
    const history = getRunHistory();
    if (history.length > 0) {
      _gameState.compoundMemoryEnabled = true;
      _gameState.runNumber = history.length + 1;
    }
  }

  saveGame();
  return _gameState;
}

// ---------------------------------------------------------------------------
// State Accessors
// ---------------------------------------------------------------------------

/**
 * Returns the current live game state.
 * @returns {object|null}
 */
function getGameState() {
  return _gameState;
}

/**
 * Returns the seeded RNG function.
 * Wraps the raw RNG to track call count for save/load reproducibility.
 * @returns {function}
 */
function getRNG() {
  if (!_rng) {
    console.warn('[NULL] RNG not initialized — creating ephemeral RNG.');
    _rng = createRNG(Date.now());
  }
  return function trackedRNG() {
    _gameState.rngCallCount = (_gameState.rngCallCount || 0) + 1;
    return _rng();
  };
}

// ---------------------------------------------------------------------------
// Run History (Compound Memory)
// ---------------------------------------------------------------------------

/**
 * Saves a run profile to persistent history.
 * @param {object} state — Final game state
 */
function saveRunProfile(state) {
  const profile = {
    runNumber: state.runNumber,
    totalEntries: state.totalLedgerEntries,
    entriesByCause: { ...state.entriesByCause },
    sightBargainTaken: state.sightBargainAccepted,
    crimeIndexFinal: state.crimeIndex,
    lifespanFinal: state.lifespanDays,
    turn: state.turn,
    completedAt: Date.now(),
  };

  try {
    const existing = JSON.parse(localStorage.getItem(STORAGE_KEYS.RUN_HISTORY) || '[]');
    existing.push(profile);
    localStorage.setItem(STORAGE_KEYS.RUN_HISTORY, JSON.stringify(existing));
  } catch (err) {
    console.error('[NULL] Failed to save run profile:', err);
  }
}

/**
 * Retrieves all saved run profiles.
 * @returns {Array}
 */
function getRunHistory() {
  try {
    return JSON.parse(localStorage.getItem(STORAGE_KEYS.RUN_HISTORY) || '[]');
  } catch {
    return [];
  }
}

// ---------------------------------------------------------------------------
// Reset
// ---------------------------------------------------------------------------

/**
 * Wipes all game data and returns a fresh state.
 * @param {object} [options] — Same as createDefaultState options
 * @returns {object} Fresh game state
 */
function resetGame(options = {}) {
  localStorage.removeItem(STORAGE_KEYS.GAME_STATE);
  _gameState = createDefaultState(options);
  _rng = createRNG(_gameState.seed);
  resetEventCounter();
  saveGame();
  return _gameState;
}

// ---------------------------------------------------------------------------
// Utility
// ---------------------------------------------------------------------------

/**
 * Clamps a value between min and max.
 * @param {number} value
 * @param {number} min
 * @param {number} max
 * @returns {number}
 */
function clamp(value, min, max) {
  return Math.max(min, Math.min(max, value));
}

// ---------------------------------------------------------------------------
// Exports
// ---------------------------------------------------------------------------

const AGENCY_STATUSES = ['DORMANT', 'AWARE', 'INVESTIGATING', 'PURSUING', 'CONVERGING'];

export {
  // Constants
  STORAGE_KEYS,
  SAVE_VERSION,
  AGENCY_STATUSES,

  // Factory
  createDefaultState,

  // Persistence
  saveGame,
  loadGame,
  saveRunProfile,
  getRunHistory,

  // Lifecycle
  resetGame,
  initGame,

  // Accessors
  getGameState,
  getRNG,

  // Utility
  clamp,
};

// Expose on window for cross-module access and debugging
if (typeof window !== 'undefined') {
  window.getGameState = getGameState;
  window.getRNG = getRNG;
  window.gameState = initGame();
}
