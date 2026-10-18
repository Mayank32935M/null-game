// ============================================================================
// NULL — Action Engine
// Validates and resolves all player actions. This is the single entry point
// for any action that changes authoritative game state.
//
// Flow: Player → ActionEngine → validate → resolve → worldSimulation → events
//
// The AI narrative layer cannot bypass this. Screens call actionEngine
// functions, not simulation functions directly.
// ============================================================================

import { validateLedgerEntry, processLedgerEntry, getCauseMultipliers } from './supernaturalEngine.js';
import { processCharacterDeath, advanceWorld, processNonlethalAction, checkDefeatConditions, determineEnding, checkVictoryCondition } from './worldSimulation.js';
import { createEvent, EVENT_TYPES, VISIBILITY } from './eventEngine.js';
import { randomFloat, randomInt } from './rng.js';

// ---------------------------------------------------------------------------
// Action Types
// ---------------------------------------------------------------------------

export const ACTION_TYPES = {
  LEDGER_ENTRY: 'LEDGER_ENTRY',
  WAIT: 'WAIT',
  INVESTIGATE: 'INVESTIGATE',
  PUBLIC_STATEMENT: 'PUBLIC_STATEMENT',
  SUPPORT_INVESTIGATION: 'SUPPORT_INVESTIGATION',
};

// ---------------------------------------------------------------------------
// Main Action Resolver
// ---------------------------------------------------------------------------

/**
 * Resolves a player action. This is the ONLY function that should be called
 * to change game state from user input. It validates, processes, advances
 * the world, and returns the complete result.
 *
 * @param {string} actionType — One of ACTION_TYPES
 * @param {object} params — Action-specific parameters
 * @param {object} state — The authoritative game state (mutated)
 * @param {function} rng — Seeded RNG function
 * @returns {object} ActionResult — { success, events, crimeIndex, victoryCheck, defeat, errors, data }
 */
export function resolveAction(actionType, params, state, rng) {
  const result = {
    success: false,
    events: [],
    crimeIndex: state.crimeIndex,
    victoryCheck: null,
    defeat: null,
    ending: null,
    errors: [],
    data: {},
  };

  switch (actionType) {
    case ACTION_TYPES.LEDGER_ENTRY:
      return resolveLedgerEntry(params, state, rng, result);

    case ACTION_TYPES.WAIT:
      return resolveWait(state, rng, result);

    case ACTION_TYPES.INVESTIGATE:
      return resolveInvestigate(params, state, rng, result);

    case ACTION_TYPES.SUPPORT_INVESTIGATION:
      return resolveNonlethal('supportInvestigation', params, state, rng, result);

    case ACTION_TYPES.PUBLIC_STATEMENT:
      return resolveNonlethal('publicStatement', params, state, rng, result);

    default:
      result.errors.push(`Unknown action type: ${actionType}`);
      return result;
  }
}

// ---------------------------------------------------------------------------
// Ledger Entry Resolution
// ---------------------------------------------------------------------------

function resolveLedgerEntry(params, state, rng, result) {
  // 1. Validate the entry
  const validation = validateLedgerEntry(params, state);
  if (!validation.valid) {
    result.errors = validation.errors;
    return result;
  }

  // 2. Process the Ledger entry (lifespan cost, event creation)
  const ledgerResult = processLedgerEntry(params, state, rng);
  result.events.push(ledgerResult.event);
  result.data.lifespanCost = ledgerResult.lifespanCost;
  result.data.cause = ledgerResult.cause;
  result.data.causeInfo = ledgerResult.causeInfo;

  // 3. Process the character death if targeting a known character
  if (params.targetId && state.characters[params.targetId]) {
    const deathEvents = processCharacterDeath(state, params.targetId, params.cause, rng);
    result.events.push(...deathEvents);
  } else {
    // Custom target (player typed a name not in the database)
    // Apply generic minor crime reduction based on target type
    const genericImpact = getGenericCrimeImpact(params.targetType);
    for (const [cat, delta] of Object.entries(genericImpact)) {
      if (cat in state.crimeCategories) {
        state.crimeCategories[cat] = Math.max(0, state.crimeCategories[cat] + delta);
      }
    }
  }

  // 4. Generate agency evidence from this action
  const causeMultipliers = getCauseMultipliers(params.cause);
  const evidenceEvents = generateAgencyEvidence(state, params, causeMultipliers, rng);
  result.events.push(...evidenceEvents);

  // 5. Advance the world
  const worldResult = advanceWorld(state, rng);
  result.events.push(...worldResult.events);
  result.crimeIndex = worldResult.crimeIndex;
  result.victoryCheck = worldResult.victoryCheck;

  // 6. Check defeat conditions
  result.defeat = checkDefeatConditions(state);

  // 7. Check for game end
  if (result.victoryCheck.met || result.defeat) {
    result.ending = determineEnding(state);
    result.events.push(createEvent({
      type: EVENT_TYPES.GAME_END,
      description: result.ending.description,
      visibility: VISIBILITY.PRIVATE,
      turn: state.turn,
      data: { ending: result.ending },
    }));
  }

  result.success = true;
  return result;
}

// ---------------------------------------------------------------------------
// Wait Resolution
// ---------------------------------------------------------------------------

function resolveWait(state, rng, result) {
  const waitEvents = processNonlethalAction(state, 'wait', {}, rng);
  result.events.push(...waitEvents);

  const worldResult = advanceWorld(state, rng);
  result.events.push(...worldResult.events);
  result.crimeIndex = worldResult.crimeIndex;
  result.victoryCheck = worldResult.victoryCheck;
  result.defeat = checkDefeatConditions(state);

  if (result.victoryCheck.met || result.defeat) {
    result.ending = determineEnding(state);
  }

  result.success = true;
  return result;
}

// ---------------------------------------------------------------------------
// Investigate Resolution
// ---------------------------------------------------------------------------

function resolveInvestigate(params, state, rng, result) {
  // When the player investigates a character, they may discover evidence
  const character = state.characters[params.characterId];
  if (!character) {
    result.errors.push('Character not found.');
    return result;
  }

  // Chance of discovering useful information
  const discoveryChance = 0.6 + (state.canSeeNames ? 0.2 : 0);
  const discovered = rng() < discoveryChance;

  if (discovered) {
    result.data.discoveredInfo = {
      name: character.name,
      role: character.role,
      isPublicFigure: character.isPublicFigure,
      factionId: character.factionId,
      targetType: character.targetType,
      description: character.description,
    };

    result.events.push(createEvent({
      type: EVENT_TYPES.EVIDENCE_DISCOVERED,
      description: `Bearer investigated ${character.name} and discovered their role as ${character.role}.`,
      visibility: VISIBILITY.PRIVATE,
      turn: state.turn,
      data: {
        characterId: params.characterId,
        discoveryType: 'investigation',
        deduplicationKey: `investigate_${params.characterId}_${state.turn}`,
      },
      characterIds: [params.characterId],
    }));
  } else {
    result.data.discoveredInfo = null;
    result.data.investigationFailed = true;
  }

  // Advance world (investigation takes time)
  const worldResult = advanceWorld(state, rng);
  result.events.push(...worldResult.events);
  result.crimeIndex = worldResult.crimeIndex;
  result.victoryCheck = worldResult.victoryCheck;
  result.defeat = checkDefeatConditions(state);

  result.success = true;
  return result;
}

// ---------------------------------------------------------------------------
// Nonlethal Action Resolution
// ---------------------------------------------------------------------------

function resolveNonlethal(actionType, params, state, rng, result) {
  const actionEvents = processNonlethalAction(state, actionType, params, rng);
  result.events.push(...actionEvents);

  const worldResult = advanceWorld(state, rng);
  result.events.push(...worldResult.events);
  result.crimeIndex = worldResult.crimeIndex;
  result.victoryCheck = worldResult.victoryCheck;
  result.defeat = checkDefeatConditions(state);

  if (result.victoryCheck.met || result.defeat) {
    result.ending = determineEnding(state);
  }

  result.success = true;
  return result;
}

// ---------------------------------------------------------------------------
// Agency Evidence Generation
// ---------------------------------------------------------------------------

/**
 * Generates evidence that agencies collect from a Ledger entry.
 * Evidence quantity and quality depends on the cause of death and
 * the target's profile.
 *
 * @param {object} state
 * @param {object} params — The Ledger entry params
 * @param {object} causeMultipliers — { suspicionMultiplier, publicFearMultiplier }
 * @param {function} rng
 * @returns {object[]} Events
 */
function generateAgencyEvidence(state, params, causeMultipliers, rng) {
  const events = [];
  const agencies = Object.keys(state.agencies);

  for (const agencyId of agencies) {
    const agency = state.agencies[agencyId];

    // Evidence points generated depends on:
    // 1. Cause of death risk multiplier
    // 2. Whether the target is a public figure
    // 3. Number of previous entries (pattern detection)
    // 4. Agency's current investigation intensity
    const baseEvidence = randomFloat(rng, 3, 12);
    const causeMultiplier = causeMultipliers.suspicionMultiplier;
    const publicFigureBonus = params.isPublicFigure ? 1.5 : 1.0;
    const patternBonus = Math.min(2.0, 1.0 + (state.totalLedgerEntries || 0) * 0.1);

    const evidencePoints = baseEvidence * causeMultiplier * publicFigureBonus * patternBonus;

    // Add to agency investigation intensity
    agency.investigationIntensity = Math.min(
      100,
      (agency.investigationIntensity || 0) + evidencePoints
    );

    // Add to agency evidence count
    agency.evidenceCount = (agency.evidenceCount || 0) + 1;

    // Update agency stage based on investigation intensity
    const oldStage = agency.currentStage;
    agency.currentStage = computeAgencyStage(agency.investigationIntensity);

    if (agency.currentStage !== oldStage) {
      events.push(createEvent({
        type: EVENT_TYPES.AGENCY_ACTION,
        description: `${agency.name} investigation escalated to ${agency.currentStage}.`,
        visibility: agency.currentStage === 'CONVERGING' ? VISIBILITY.PUBLIC : VISIBILITY.RESTRICTED,
        turn: state.turn,
        data: {
          agencyId,
          oldStage,
          newStage: agency.currentStage,
          deduplicationKey: `agency_escalation_${agencyId}_${state.turn}`,
        },
        agencyIds: [agencyId],
      }));
    }

    // Update player exposure based on agency progress
    if (agency.investigationIntensity > 50) {
      state.indicators.playerExposure = Math.min(
        100,
        state.indicators.playerExposure + evidencePoints * 0.15
      );
    }
  }

  return events;
}

/**
 * Computes agency stage from investigation intensity.
 * @param {number} intensity — 0 to 100
 * @returns {string} Stage name
 */
function computeAgencyStage(intensity) {
  if (intensity >= 85) return 'CONVERGING';
  if (intensity >= 65) return 'PURSUING';
  if (intensity >= 40) return 'INVESTIGATING';
  if (intensity >= 15) return 'AWARE';
  return 'DORMANT';
}

// ---------------------------------------------------------------------------
// Generic Crime Impact
// ---------------------------------------------------------------------------

/**
 * Returns a generic crime impact for custom targets (not in the character database).
 * @param {string} targetType — e.g. 'petty_criminal', 'corrupt_official', 'syndicate_leader'
 * @returns {object} Crime category deltas
 */
function getGenericCrimeImpact(targetType) {
  const impacts = {
    petty_criminal: { violent: -1, organised: 0, corruption: 0, exploitation: -0.5 },
    corrupt_official: { violent: 0, organised: -2, corruption: -5, exploitation: -3 },
    syndicate_leader: { violent: -3, organised: -6, corruption: -1, exploitation: -3 },
    enforcer: { violent: -4, organised: -2, corruption: 0, exploitation: -1 },
    financier: { violent: 0, organised: -3, corruption: -2, exploitation: -5 },
    trafficker: { violent: -2, organised: -3, corruption: 0, exploitation: -6 },
  };
  return impacts[targetType] || { violent: -0.5, organised: -0.5, corruption: 0, exploitation: 0 };
}
