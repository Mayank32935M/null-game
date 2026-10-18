// ============================================================================
// NULL — Event Engine
// Creates, stores, and queries game events. Every consequential action
// produces an event record. Events are the authoritative history of
// what happened in the game world.
// ============================================================================

/**
 * Event visibility levels — determines who can see this event.
 * PUBLIC:     Anyone can see it (news, public record)
 * LEAKED:     Supposed to be restricted but was disclosed
 * RESTRICTED: Only specific agencies/characters know
 * PRIVATE:    Only the originating entity knows
 * UNKNOWN:    The event occurred but nobody is aware of it yet
 */
export const VISIBILITY = {
  PUBLIC: 'PUBLIC',
  LEAKED: 'LEAKED',
  RESTRICTED: 'RESTRICTED',
  PRIVATE: 'PRIVATE',
  UNKNOWN: 'UNKNOWN',
};

/**
 * Event types — broad categories for filtering and processing.
 */
export const EVENT_TYPES = {
  LEDGER_ENTRY: 'LEDGER_ENTRY',           // Player used the Ledger
  DEATH: 'DEATH',                          // A character died
  FACTION_CHANGE: 'FACTION_CHANGE',        // Faction state changed
  AGENCY_ACTION: 'AGENCY_ACTION',          // Agency took an action
  EVIDENCE_DISCOVERED: 'EVIDENCE_DISCOVERED',
  PUBLIC_STATEMENT: 'PUBLIC_STATEMENT',
  INVESTIGATION_UPDATE: 'INVESTIGATION_UPDATE',
  WORLD_TICK: 'WORLD_TICK',               // A simulation turn occurred
  POWER_VACUUM: 'POWER_VACUUM',
  PLAYER_ACTION: 'PLAYER_ACTION',         // Non-Ledger player action
  SIGHT_BARGAIN: 'SIGHT_BARGAIN',
  GAME_START: 'GAME_START',
  GAME_END: 'GAME_END',
};

let _nextEventId = 1;

/**
 * Creates a new event record. Events are immutable once created.
 *
 * @param {object} params
 * @param {string} params.type — One of EVENT_TYPES
 * @param {string} params.description — Human-readable description
 * @param {string} params.visibility — One of VISIBILITY
 * @param {number} params.turn — The game turn when this occurred
 * @param {object} [params.data] — Event-specific structured data
 * @param {string[]} [params.characterIds] — Characters involved
 * @param {string[]} [params.factionIds] — Factions involved
 * @param {string[]} [params.agencyIds] — Agencies involved
 * @param {string} [params.causedBy] — ID of the event that caused this one
 * @returns {object} The event record
 */
export function createEvent({
  type,
  description,
  visibility = VISIBILITY.PUBLIC,
  turn,
  data = {},
  characterIds = [],
  factionIds = [],
  agencyIds = [],
  causedBy = null,
}) {
  const event = {
    id: `evt_${_nextEventId++}`,
    type,
    description,
    visibility,
    turn,
    timestamp: Date.now(),
    data,
    characterIds,
    factionIds,
    agencyIds,
    causedBy,
  };

  return Object.freeze(event);
}

/**
 * Resets the event ID counter. Called on new game.
 * @param {number} [startId=1]
 */
export function resetEventCounter(startId = 1) {
  _nextEventId = startId;
}

/**
 * Sets the event counter to continue from an existing event log.
 * Called when loading a saved game.
 * @param {Array} eventLog — Existing event log array
 */
export function syncEventCounter(eventLog) {
  if (!eventLog || eventLog.length === 0) {
    _nextEventId = 1;
    return;
  }
  // Find the highest existing event ID number
  let maxId = 0;
  for (const evt of eventLog) {
    if (evt.id) {
      const num = parseInt(evt.id.replace('evt_', ''), 10);
      if (!isNaN(num) && num > maxId) maxId = num;
    }
  }
  _nextEventId = maxId + 1;
}

// ---------------------------------------------------------------------------
// Query helpers — filter event logs
// ---------------------------------------------------------------------------

/**
 * Returns events visible to the player (PUBLIC or LEAKED).
 * @param {Array} eventLog
 * @returns {Array}
 */
export function getPublicEvents(eventLog) {
  return eventLog.filter(
    e => e.visibility === VISIBILITY.PUBLIC || e.visibility === VISIBILITY.LEAKED
  );
}

/**
 * Returns events of a specific type.
 * @param {Array} eventLog
 * @param {string} type — One of EVENT_TYPES
 * @returns {Array}
 */
export function getEventsByType(eventLog, type) {
  return eventLog.filter(e => e.type === type);
}

/**
 * Returns events involving a specific character.
 * @param {Array} eventLog
 * @param {string} characterId
 * @returns {Array}
 */
export function getEventsForCharacter(eventLog, characterId) {
  return eventLog.filter(e => e.characterIds.includes(characterId));
}

/**
 * Returns events from a specific turn.
 * @param {Array} eventLog
 * @param {number} turn
 * @returns {Array}
 */
export function getEventsForTurn(eventLog, turn) {
  return eventLog.filter(e => e.turn === turn);
}

/**
 * Returns events known by a specific agency.
 * An agency knows about an event if:
 * - It's PUBLIC
 * - It's LEAKED
 * - The agency is listed in agencyIds (for RESTRICTED events)
 *
 * @param {Array} eventLog
 * @param {string} agencyId
 * @returns {Array}
 */
export function getEventsKnownByAgency(eventLog, agencyId) {
  return eventLog.filter(e =>
    e.visibility === VISIBILITY.PUBLIC ||
    e.visibility === VISIBILITY.LEAKED ||
    (e.visibility === VISIBILITY.RESTRICTED && e.agencyIds.includes(agencyId))
  );
}

/**
 * Checks if an event with the given type and data.key already exists,
 * preventing duplicate event processing.
 *
 * @param {Array} eventLog
 * @param {string} type
 * @param {string} deduplicationKey
 * @returns {boolean}
 */
export function eventExists(eventLog, type, deduplicationKey) {
  return eventLog.some(
    e => e.type === type && e.data?.deduplicationKey === deduplicationKey
  );
}
