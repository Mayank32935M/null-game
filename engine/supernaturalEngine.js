// ============================================================================
// NULL — Supernatural Engine
// Manages the Ledger's rules, validates entries, processes the Sight Bargain,
// and enforces lifespan costs. This module owns all supernatural mechanics.
// ============================================================================

import { LEDGER_RULES, SIGHT_BARGAIN } from '../data/universe.js';
import { createEvent, EVENT_TYPES, VISIBILITY } from './eventEngine.js';
import { randomInt } from './rng.js';

// ---------------------------------------------------------------------------
// Ledger Entry Validation
// ---------------------------------------------------------------------------

/**
 * Validates a proposed Ledger entry before processing.
 * Returns a validation result with errors if invalid.
 *
 * @param {object} entry — { targetName, targetId, cause, timeOfDeath, finalActions }
 * @param {object} state — Current game state
 * @returns {{ valid: boolean, errors: string[] }}
 */
export function validateLedgerEntry(entry, state) {
  const errors = [];

  // Name required
  if (!entry.targetName || entry.targetName.trim().length === 0) {
    errors.push('A name must be written in the Ledger.');
  }

  // Cause of death required
  if (!entry.cause || !LEDGER_RULES.causes[entry.cause]) {
    errors.push('A valid cause of death must be specified.');
  }

  // Check if target exists and is alive (if targeting a known character)
  if (entry.targetId) {
    const character = state.characters[entry.targetId];
    if (!character) {
      errors.push('Target not found in the world.');
    } else if (!character.isAlive) {
      errors.push('Target is already dead. The Ledger cannot claim them twice.');
    }
  }

  // Check player lifespan
  if (state.lifespanDays <= 0) {
    errors.push('The bearer has no remaining lifespan. The Ledger cannot be used.');
  }

  return {
    valid: errors.length === 0,
    errors,
  };
}

// ---------------------------------------------------------------------------
// Ledger Entry Processing
// ---------------------------------------------------------------------------

/**
 * Processes a validated Ledger entry. This is the authoritative kill action.
 *
 * 1. Deducts lifespan cost
 * 2. Records the entry as an event
 * 3. Returns the event (caller must pass to worldSimulation for consequences)
 *
 * @param {object} entry — Validated entry { targetName, targetId, cause, finalActions }
 * @param {object} state — Game state (mutated for lifespan)
 * @param {function} rng — Seeded RNG
 * @returns {object} { event, lifespanCost, cause }
 */
export function processLedgerEntry(entry, state, rng) {
  // Calculate lifespan cost
  const lifespanCost = randomInt(
    rng,
    LEDGER_RULES.lifespanCostPerEntry.min,
    LEDGER_RULES.lifespanCostPerEntry.max
  );

  // Deduct lifespan
  state.lifespanDays = Math.max(0, state.lifespanDays - lifespanCost);

  // Determine cause details
  const causeInfo = LEDGER_RULES.causes[entry.cause] || LEDGER_RULES.causes.cardiac;

  // Record the entry
  const event = createEvent({
    type: EVENT_TYPES.LEDGER_ENTRY,
    description: `The bearer wrote ${entry.targetName} in the Ledger. Cause: ${causeInfo.name}.`,
    visibility: VISIBILITY.PRIVATE, // Only the bearer knows about the Ledger
    turn: state.turn,
    data: {
      targetName: entry.targetName,
      targetId: entry.targetId || null,
      cause: entry.cause,
      causeName: causeInfo.name,
      finalActions: entry.finalActions || null,
      lifespanCost,
      lifespanRemaining: state.lifespanDays,
      deduplicationKey: `ledger_${entry.targetName}_${state.turn}`,
    },
    characterIds: entry.targetId ? [entry.targetId] : [],
  });

  // Track total entries
  state.totalLedgerEntries = (state.totalLedgerEntries || 0) + 1;

  // Track entries by cause
  if (!state.entriesByCause) state.entriesByCause = {};
  state.entriesByCause[entry.cause] = (state.entriesByCause[entry.cause] || 0) + 1;

  return {
    event,
    lifespanCost,
    cause: entry.cause,
    causeInfo,
  };
}

// ---------------------------------------------------------------------------
// Sight Bargain
// ---------------------------------------------------------------------------

/**
 * Checks whether the Sight Bargain is available.
 * @param {object} state
 * @returns {boolean}
 */
export function isSightBargainAvailable(state) {
  return !state.sightBargainAccepted && state.lifespanDays > 0;
}

/**
 * Processes the Sight Bargain. The bearer sacrifices half their remaining
 * lifespan in exchange for the ability to see names and lifespans.
 *
 * @param {object} state — Game state (mutated)
 * @returns {object} { event, lifespanBefore, lifespanAfter, lifespanCost }
 */
export function acceptSightBargain(state) {
  if (state.sightBargainAccepted) {
    return { error: 'The Sight Bargain has already been accepted.' };
  }

  const lifespanBefore = state.lifespanDays;
  const lifespanCost = Math.floor(lifespanBefore * SIGHT_BARGAIN.lifespanCostFraction);
  state.lifespanDays = lifespanBefore - lifespanCost;
  state.sightBargainAccepted = true;

  // Grant abilities
  state.canSeeNames = true;
  state.canSeeLifespans = true;

  const event = createEvent({
    type: EVENT_TYPES.SIGHT_BARGAIN,
    description: `The bearer accepted the Sight Bargain. ${lifespanCost} days sacrificed.`,
    visibility: VISIBILITY.PRIVATE,
    turn: state.turn,
    data: {
      lifespanBefore,
      lifespanAfter: state.lifespanDays,
      lifespanCost,
      deduplicationKey: `sight_bargain_${state.turn}`,
    },
  });

  return { event, lifespanBefore, lifespanAfter: state.lifespanDays, lifespanCost };
}

// ---------------------------------------------------------------------------
// Challenge Timer (3-hour mode)
// ---------------------------------------------------------------------------

/**
 * Starts the challenge timer. Called when entering timed challenge mode
 * or when the Sight Bargain is accepted (configurable).
 *
 * @param {object} state
 */
export function startChallengeTimer(state) {
  if (state.challengeMode) {
    state.challengeTimer = {
      totalSeconds: SIGHT_BARGAIN.challengeTimerSeconds,
      elapsedSeconds: state.challengeTimer?.elapsedSeconds || 0,
      isRunning: true,
      lastResumedAt: Date.now(),
    };
  }
}

/**
 * Updates the challenge timer with elapsed real time.
 * Call this periodically or on state access.
 *
 * @param {object} state
 * @returns {object|null} { remaining, expired } or null if no timer
 */
export function updateChallengeTimer(state) {
  if (!state.challengeTimer || !state.challengeTimer.isRunning) return null;

  const now = Date.now();
  const elapsed = (now - state.challengeTimer.lastResumedAt) / 1000;
  state.challengeTimer.elapsedSeconds += elapsed;
  state.challengeTimer.lastResumedAt = now;

  const remaining = Math.max(
    0,
    state.challengeTimer.totalSeconds - state.challengeTimer.elapsedSeconds
  );

  return {
    remaining,
    expired: remaining <= 0,
    elapsedSeconds: state.challengeTimer.elapsedSeconds,
    totalSeconds: state.challengeTimer.totalSeconds,
  };
}

/**
 * Pauses the challenge timer. Call on save or when the player pauses.
 * @param {object} state
 */
export function pauseChallengeTimer(state) {
  if (!state.challengeTimer || !state.challengeTimer.isRunning) return;

  // Record elapsed time before pausing
  const now = Date.now();
  const elapsed = (now - state.challengeTimer.lastResumedAt) / 1000;
  state.challengeTimer.elapsedSeconds += elapsed;
  state.challengeTimer.isRunning = false;
  state.challengeTimer.lastResumedAt = null;
}

/**
 * Resumes the challenge timer after a pause or load.
 * @param {object} state
 */
export function resumeChallengeTimer(state) {
  if (!state.challengeTimer) return;
  state.challengeTimer.isRunning = true;
  state.challengeTimer.lastResumedAt = Date.now();
}

// ---------------------------------------------------------------------------
// Cause of Death Risk Multipliers
// ---------------------------------------------------------------------------

/**
 * Returns the suspicion and fear multipliers for a given cause of death.
 * Used by the agency engine to scale evidence generation.
 *
 * @param {string} cause — Cause key from LEDGER_RULES.causes
 * @returns {{ suspicionMultiplier: number, publicFearMultiplier: number }}
 */
export function getCauseMultipliers(cause) {
  const info = LEDGER_RULES.causes[cause];
  if (!info) {
    return { suspicionMultiplier: 1.0, publicFearMultiplier: 1.0 };
  }
  return {
    suspicionMultiplier: info.suspicionMultiplier,
    publicFearMultiplier: info.publicFearMultiplier,
  };
}

/**
 * Returns all available causes of death for UI rendering.
 * @returns {object[]}
 */
export function getAvailableCauses() {
  return Object.values(LEDGER_RULES.causes);
}
