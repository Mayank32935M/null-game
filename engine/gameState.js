// ============================================================================
// NULL — Game State Engine
// Master game state, persistence, and initialization
// ============================================================================

const STORAGE_KEYS = {
  GAME_STATE: 'null_game_state',
  RUN_HISTORY: 'null_run_history',
  LICENSE: 'null_license',
  TIER: 'null_tier',
};

// ---------------------------------------------------------------------------
// Region configuration — player name, companion, agencies per region
// ---------------------------------------------------------------------------

const REGION_CONFIG = {
  india: {
    playerName: 'Aryan Mathur',
    companionName: 'Zara Khan',
    agencies: ['CBI', 'RAW', 'IB'],
  },
  usa: {
    playerName: 'Ethan Cole',
    companionName: 'Sierra Voss',
    agencies: ['FBI', 'CIA', 'NSA'],
  },
  japan: {
    playerName: 'Ryoichi Tanaka',
    companionName: 'Akane Shirogane',
    agencies: ['NPA', 'PSB', 'Interpol'],
  },
};

// Valid agency statuses (progression order)
const AGENCY_STATUSES = [
  'UNAWARE',
  'MONITORING',
  'ACTIVE',
  'HUNTING',
  'CLOSING_IN',
];

// Valid kill methods
const KILL_METHODS = ['heartAttack', 'accident', 'publicDeath', 'manipulated'];

// Ego stage thresholds — maps ego index to Void dialogue tier (0-3)
const EGO_THRESHOLDS = [25, 50, 75]; // ≤25 → 0, ≤50 → 1, ≤75 → 2, >75 → 3

// ---------------------------------------------------------------------------
// Default game state factory
// ---------------------------------------------------------------------------

/**
 * Creates a fresh default game state for a given region.
 * @param {string} region — 'india' | 'usa' | 'japan'
 * @returns {object} A deep-copied default game state object
 */
function createDefaultState(region = 'india') {
  const config = REGION_CONFIG[region];
  if (!config) {
    throw new Error(`Invalid region "${region}". Must be one of: india, usa, japan`);
  }

  // Build agency objects dynamically from region config
  const agencySuspicion = {};
  const agencyStatus = {};
  for (const agency of config.agencies) {
    agencySuspicion[agency] = 0;
    agencyStatus[agency] = 'UNAWARE';
  }

  return {
    // ---- Meta ----
    version: '1.0',
    region,
    playerName: config.playerName,
    companionName: config.companionName,
    runNumber: 1,
    compoundMemoryEnabled: false,

    // ---- World Variables ----
    crimeRate: 100,
    crimeDelta: 0,        // tracks total change from 100 for dashboard trend display
    publicFearIndex: 0,
    egoIndex: 0,
    exposureRisk: 0,
    lifespanDays: 9847,

    // ---- Agency Suspicion ----
    agencySuspicion,
    agencyStatus,
    agencyDarkMode: false,

    // ---- Eyes Deal ----
    eyesDealActive: false,
    eyesTimeRemaining: 10800, // 3 hours in seconds
    eyesTimerStarted: null,

    // ---- Memory Loss ----
    memoryLossUsed: false,
    memoryLossAvailable: false,

    // ---- Kill Tracking ----
    killLog: [],
    totalKills: 0,
    killMethods: {
      heartAttack: 0,
      accident: 0,
      publicDeath: 0,
      manipulated: 0,
    },

    // ---- Anti-Spam: Kill Cooldown ----
    lastKillTimestamp: null,
    killCooldownSeconds: 300,   // base cooldown; actual scales with agency status

    // ---- Anti-Spam: Heat System ----
    heatLevel: 0,
    lastHeatDecayTimestamp: Date.now(),

    // ---- Anti-Spam: Pattern Detection ----
    consecutiveSameMethodKills: 0,
    lastKillMethod: null,

    // ---- Anti-Spam: Linked Deaths ----
    lastNewsTimestamp: null,

    // ---- Anti-Spam: Target Research Feed ----
    availableTargets: [],           // 4 Gemini-generated targets
    lastTargetRefreshTimestamp: null,

    // ---- Hesitation Tracking (Compound Memory) ----
    hesitationMap: {
      targetTypes: {},
      avgDecisionTime: 0,
      refusedTargets: [],
    },

    // ---- Companion ----
    companionRelationshipScore: 0,
    companionAlliance: null, // 'accepted' | 'rejected' | 'ignored'
    companionUnauthorizedKills: 0,

    // ---- Story Progress ----
    currentAct: 1,
    currentBeat: 1,
    phantomBroadcastTriggered: false,
    phantomBroadcastChoice: null, // 'kill' | 'wait' | 'manipulate'

    // ---- News Feed ----
    newsFeed: [],

    // ---- Ego Stage (0-3 → four Void dialogue tiers) ----
    egoStage: 0,

    // ---- Exposure Risk ----
    // (tracked as world variable above)

    // ---- Ending Eligibility ----
    endingEligibility: {
      godOfNewWorld: false,
      quietGod: false,
      consumed: false,
      theArchitect: false,
      ghost: false,
      checkmate: false,
      theReformer: false,
      martyr: false,
      silence: false,
    },

    // ---- Premium ----
    premiumUnlocked: false,

    // ---- Timestamps ----
    createdAt: Date.now(),
    lastSavedAt: null,
  };
}

// ---------------------------------------------------------------------------
// The live game state — module-level singleton
// ---------------------------------------------------------------------------

let gameState = null;

// ---------------------------------------------------------------------------
// Persistence
// ---------------------------------------------------------------------------

/**
 * Saves the current game state to localStorage.
 */
function saveGame() {
  if (!gameState) {
    console.warn('[NULL] No active game state to save.');
    return;
  }
  gameState.lastSavedAt = Date.now();
  try {
    localStorage.setItem(STORAGE_KEYS.GAME_STATE, JSON.stringify(gameState));
  } catch (err) {
    console.error('[NULL] Failed to save game state:', err);
  }
}

/**
 * Loads a previously saved game state from localStorage.
 * @returns {object|null} The parsed game state, or null if none exists.
 */
function loadGame() {
  try {
    const raw = localStorage.getItem(STORAGE_KEYS.GAME_STATE);
    return raw ? JSON.parse(raw) : null;
  } catch (err) {
    console.error('[NULL] Failed to load game state:', err);
    return null;
  }
}

/**
 * Saves a run profile to the persistent run history (for Compound Memory).
 * Called at the end of a playthrough — win or lose.
 * @param {object} state — The final game state for the completed run.
 */
function saveRunProfile(state) {
  const profile = {
    runNumber: state.runNumber,
    region: state.region,
    killMethods: { ...state.killMethods },
    hesitationMap: JSON.parse(JSON.stringify(state.hesitationMap)),
    companionChoice: state.companionAlliance,
    eyesDealTaken: state.eyesDealActive,
    memoryLossUsed: state.memoryLossUsed,
    phantomChoice: state.phantomBroadcastChoice,
    egoFinal: state.egoIndex,
    totalKills: state.totalKills,
    crimeRateFinal: state.crimeRate,
    outcome: state.currentEnding || null,
    completedAt: Date.now(),
  };

  try {
    const existing = JSON.parse(
      localStorage.getItem(STORAGE_KEYS.RUN_HISTORY) || '[]'
    );
    existing.push(profile);
    localStorage.setItem(STORAGE_KEYS.RUN_HISTORY, JSON.stringify(existing));
  } catch (err) {
    console.error('[NULL] Failed to save run profile:', err);
  }
}

/**
 * Retrieves all saved run profiles.
 * @returns {Array} Array of run profile objects.
 */
function getRunHistory() {
  try {
    return JSON.parse(
      localStorage.getItem(STORAGE_KEYS.RUN_HISTORY) || '[]'
    );
  } catch {
    return [];
  }
}

// ---------------------------------------------------------------------------
// Reset
// ---------------------------------------------------------------------------

/**
 * Wipes ALL NULL game data from localStorage and returns a fresh default state.
 * Does NOT automatically assign the fresh state as the live state — caller
 * must do that explicitly (or use initGame).
 * @param {string} region — Region for the fresh state (default: 'india')
 * @returns {object} A brand-new default game state.
 */
function resetGame(region = 'india') {
  localStorage.removeItem(STORAGE_KEYS.GAME_STATE);
  localStorage.removeItem(STORAGE_KEYS.RUN_HISTORY);
  localStorage.removeItem(STORAGE_KEYS.LICENSE);
  localStorage.removeItem(STORAGE_KEYS.TIER);
  const fresh = createDefaultState(region);
  gameState = fresh;
  return fresh;
}

// ---------------------------------------------------------------------------
// Initialization
// ---------------------------------------------------------------------------

/**
 * Initializes the game. Checks for an existing save:
 *   - If found → loads it and sets it as the live state.
 *   - If not found → creates a fresh default state for the given region.
 *
 * Also handles Compound Memory: if a run history exists and the player
 * opted in, the run number is set accordingly.
 *
 * @param {object} options
 * @param {string} options.region — Starting region (default: 'india')
 * @param {boolean} options.compoundMemory — Enable compound memory (default: false)
 * @param {boolean} options.forceNew — Force a new game even if a save exists (default: false)
 * @returns {object} The active game state.
 */
function initGame({ region = 'india', compoundMemory = false, forceNew = false } = {}) {
  // Attempt to load existing save unless forcing a new game
  if (!forceNew) {
    const saved = loadGame();
    if (saved) {
      gameState = saved;
      // Recompute ego stage from loaded ego index
      gameState.egoStage = computeEgoStage(gameState.egoIndex);
      return gameState;
    }
  }

  // Create fresh state
  const fresh = createDefaultState(region);

  // Compound Memory setup
  if (compoundMemory) {
    const history = getRunHistory();
    if (history.length > 0) {
      fresh.compoundMemoryEnabled = true;
      fresh.runNumber = history.length + 1;
    }
  }

  gameState = fresh;
  saveGame();
  return gameState;
}

// ---------------------------------------------------------------------------
// State accessors & helpers
// ---------------------------------------------------------------------------

/**
 * Returns the current live game state.
 * @returns {object|null}
 */
function getGameState() {
  return gameState;
}

/**
 * Computes the ego stage (0-3) from an ego index value.
 * @param {number} egoIndex — 0–100
 * @returns {number} 0 | 1 | 2 | 3
 */
function computeEgoStage(egoIndex) {
  if (egoIndex <= EGO_THRESHOLDS[0]) return 0;
  if (egoIndex <= EGO_THRESHOLDS[1]) return 1;
  if (egoIndex <= EGO_THRESHOLDS[2]) return 2;
  return 3;
}

/**
 * Updates the ego index and recalculates the ego stage.
 * Clamps to 0–100 range.
 * @param {number} delta — Amount to add (can be negative)
 */
function updateEgoIndex(delta) {
  if (!gameState) return;
  gameState.egoIndex = clamp(gameState.egoIndex + delta, 0, 100);
  gameState.egoStage = computeEgoStage(gameState.egoIndex);
}

/**
 * Checks whether the current tier is premium.
 * @returns {boolean}
 */
function checkPremium() {
  return localStorage.getItem(STORAGE_KEYS.TIER) === 'premium';
}

/**
 * Unlocks premium with a license key.
 * @param {string} licenseKey
 * @returns {boolean} Whether the unlock succeeded.
 */
function unlockPremium(licenseKey) {
  if (isValidKeyFormat(licenseKey)) {
    localStorage.setItem(STORAGE_KEYS.LICENSE, licenseKey);
    localStorage.setItem(STORAGE_KEYS.TIER, 'premium');
    if (gameState) {
      gameState.premiumUnlocked = true;
      saveGame();
    }
    return true;
  }
  return false;
}

/**
 * Basic license key format validation.
 * Accepts typical Gumroad-style keys: XXXX-XXXX-XXXX-XXXX (alphanumeric, dashes).
 * @param {string} key
 * @returns {boolean}
 */
function isValidKeyFormat(key) {
  if (!key || typeof key !== 'string') return false;
  // Gumroad keys: groups of alphanumeric characters separated by dashes
  return /^[A-Za-z0-9]{4,}(-[A-Za-z0-9]{4,}){2,}$/.test(key.trim());
}

/**
 * Clamps a numeric value between min and max.
 * @param {number} value
 * @param {number} min
 * @param {number} max
 * @returns {number}
 */
function clamp(value, min, max) {
  return Math.max(min, Math.min(max, value));
}

/**
 * Returns the region config for a given region key.
 * @param {string} region
 * @returns {object}
 */
function getRegionConfig(region) {
  return REGION_CONFIG[region] || null;
}

// ---------------------------------------------------------------------------
// Exports
// ---------------------------------------------------------------------------

export {
  // Constants
  STORAGE_KEYS,
  REGION_CONFIG,
  AGENCY_STATUSES,
  KILL_METHODS,
  EGO_THRESHOLDS,
  COOLDOWN_SCALING,
  HEAT_SPIKE,
  CRIME_RATE_FLOORS,

  // State factory
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
  getRegionConfig,
  checkPremium,
  unlockPremium,

  // Helpers
  computeEgoStage,
  updateEgoIndex,
  clamp,
  isValidKeyFormat,
};
// Expose live accessor to window so other modules and console can reach it
window.getGameState = getGameState;

// Auto-init on load so window.gameState is always populated
window.gameState = initGame({ region: 'india' });
