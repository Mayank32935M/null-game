// ============================================================================
// NULL — Agency Engine
// GDD Section 2.4 — Agency Intel System
//
// Responsibility:
//   Manages agency status progression through the five-stage pipeline:
//   UNAWARE → MONITORING → ACTIVE → HUNTING → CLOSING_IN
//
//   Status is computed from suspicion values stored in gameState.
//   Called after every kill (after applyWorldReaction has updated suspicion
//   deltas) to recalculate each agency's status and persist the result.
//
//   Also tracks the "classified activity" indicator — a boolean per kill
//   that signals whether Gemini returned agencyPublicMove === null,
//   meaning the agencies made a move the player cannot see.
// ============================================================================

import {
  getGameState,
  saveGame,
  AGENCY_STATUSES,
  clamp,
} from './gameState.js';

// ---------------------------------------------------------------------------
// Suspicion → Status thresholds
// GDD 2.4: Status advances at fixed suspicion thresholds.
// Agencies NEVER go backwards — once HUNTING, they don't de-escalate.
// ---------------------------------------------------------------------------

const SUSPICION_THRESHOLDS = [
  { min: 0,  status: 'UNAWARE' },
  { min: 15, status: 'MONITORING' },
  { min: 35, status: 'ACTIVE' },
  { min: 60, status: 'HUNTING' },
  { min: 80, status: 'CLOSING_IN' },
];

// ---------------------------------------------------------------------------
// Agency metadata — flavour text, jurisdiction descriptions per region
// ---------------------------------------------------------------------------

const AGENCY_PROFILES = {
  // ── India ──
  CBI: {
    fullName: 'Central Bureau of Investigation',
    jurisdiction: 'Federal criminal investigation. Pattern analysis.',
    specialty: 'Forensic linkage between deaths',
    icon: '⬡',
    color: '#4a7aac',
  },
  RAW: {
    fullName: 'Research & Analysis Wing',
    jurisdiction: 'External intelligence. Shadow operations.',
    specialty: 'Covert surveillance networks',
    icon: '◬',
    color: '#c46030',
  },
  IB: {
    fullName: 'Intelligence Bureau',
    jurisdiction: 'Domestic intelligence. Counter-terror.',
    specialty: 'Mass communication monitoring',
    icon: '◎',
    color: '#7a5aac',
  },

  // ── USA ──
  FBI: {
    fullName: 'Federal Bureau of Investigation',
    jurisdiction: 'Domestic law enforcement. Serial patterns.',
    specialty: 'Behavioural profiling',
    icon: '⬡',
    color: '#4a7aac',
  },
  CIA: {
    fullName: 'Central Intelligence Agency',
    jurisdiction: 'Global intelligence. Covert operations.',
    specialty: 'Signal intelligence, deep cover',
    icon: '◬',
    color: '#c46030',
  },
  NSA: {
    fullName: 'National Security Agency',
    jurisdiction: 'Signals intelligence. Digital surveillance.',
    specialty: 'Communications intercept',
    icon: '◎',
    color: '#7a5aac',
  },

  // ── Japan ──
  NPA: {
    fullName: 'National Police Agency',
    jurisdiction: 'National policing. Crime statistics.',
    specialty: 'Death pattern correlation',
    icon: '⬡',
    color: '#4a7aac',
  },
  PSB: {
    fullName: 'Public Security Bureau',
    jurisdiction: 'Domestic security. Threat monitoring.',
    specialty: 'Surveillance deployment',
    icon: '◬',
    color: '#c46030',
  },
  Interpol: {
    fullName: 'International Criminal Police Organization',
    jurisdiction: 'Cross-border coordination.',
    specialty: 'International death-pattern matching',
    icon: '◎',
    color: '#7a5aac',
  },
};

// ---------------------------------------------------------------------------
// Status descriptions — what each level means for the player
// ---------------------------------------------------------------------------

const STATUS_DESCRIPTIONS = {
  UNAWARE:    'No awareness of anomalous death patterns.',
  MONITORING: 'Statistical anomaly flagged. Passive data collection.',
  ACTIVE:     'Active investigation initiated. Resources allocated.',
  HUNTING:    'Suspect profile constructed. Field agents deployed.',
  CLOSING_IN: 'Near-certain identification. Imminent confrontation.',
};

// Status badge labels (display-friendly)
const STATUS_LABELS = {
  UNAWARE:    'Unaware',
  MONITORING: 'Monitoring',
  ACTIVE:     'Active',
  HUNTING:    'Hunting',
  CLOSING_IN: 'Closing In',
};

// ---------------------------------------------------------------------------
// Core: computeAgencyStatus
// Given a suspicion value 0–100, returns the appropriate status string.
// Agency status NEVER downgrades — we take the max of current and computed.
// ---------------------------------------------------------------------------

/**
 * Computes the agency status from a suspicion value.
 * @param {number} suspicion — 0–100
 * @returns {string} One of AGENCY_STATUSES
 */
function computeStatusFromSuspicion(suspicion) {
  let result = 'UNAWARE';
  for (const threshold of SUSPICION_THRESHOLDS) {
    if (suspicion >= threshold.min) {
      result = threshold.status;
    }
  }
  return result;
}

/**
 * Returns the index of a status in the progression array.
 * Higher index = more dangerous.
 * @param {string} status
 * @returns {number}
 */
function statusIndex(status) {
  const idx = AGENCY_STATUSES.indexOf(status);
  return idx >= 0 ? idx : 0;
}

// ---------------------------------------------------------------------------
// updateAllAgencyStatuses
// Called after every kill to recalculate all agency statuses.
// Statuses only ever escalate — never downgrade.
// Persists changes to gameState and saves.
// ---------------------------------------------------------------------------

/**
 * Recalculates all agency statuses based on current suspicion values.
 * Mutates gameState.agencyStatus in-place.
 * Returns an object describing what changed for UI notification purposes.
 *
 * @param {object} [state] — optional override; defaults to getGameState()
 * @returns {{ changes: Array<{agency: string, from: string, to: string}>, anyEscalation: boolean }}
 */
function updateAllAgencyStatuses(state) {
  const gs = state || getGameState();
  if (!gs) return { changes: [], anyEscalation: false };

  const changes = [];

  for (const agency of Object.keys(gs.agencySuspicion)) {
    const suspicion = gs.agencySuspicion[agency];
    const currentStatus = gs.agencyStatus[agency] || 'UNAWARE';
    const computed = computeStatusFromSuspicion(suspicion);

    // Only escalate, never downgrade
    if (statusIndex(computed) > statusIndex(currentStatus)) {
      changes.push({
        agency,
        from: currentStatus,
        to: computed,
      });
      gs.agencyStatus[agency] = computed;
    }
  }

  return {
    changes,
    anyEscalation: changes.length > 0,
  };
}

// ---------------------------------------------------------------------------
// Classified Activity Indicator
// GDD 2.4: When Gemini returns agencyPublicMove === null, it means
// agencies made a move the player cannot see. The "classified activity"
// dot pulses red to signal hidden threat escalation.
// ---------------------------------------------------------------------------

/**
 * Determines whether the latest kill triggered a classified (hidden) agency move.
 * @param {object} [state] — optional override; defaults to getGameState()
 * @returns {boolean} True if the most recent news feed item has agencyPublicMove === null
 */
function hasClassifiedActivity(state) {
  const gs = state || getGameState();
  if (!gs || !gs.newsFeed || gs.newsFeed.length === 0) return false;

  // Check the most recent news item (index 0 since they're prepended)
  const latest = gs.newsFeed[0];
  // null means agencies acted covertly — no public move announced
  return latest.agencyPublicMove === null;
}

/**
 * Returns a history of classified activity flags from the news feed.
 * Used by the intel board to show a timeline of hidden moves.
 * @param {object} [state]
 * @returns {Array<{index: number, headline: string, isClassified: boolean}>}
 */
function getClassifiedTimeline(state) {
  const gs = state || getGameState();
  if (!gs || !gs.newsFeed) return [];

  return gs.newsFeed.map((item, i) => ({
    index: i,
    headline: item.headline,
    isClassified: item.agencyPublicMove === null,
    publicMove: item.agencyPublicMove || null,
  }));
}

// ---------------------------------------------------------------------------
// Agency intel summary — aggregated data for the intel board
// ---------------------------------------------------------------------------

/**
 * Builds a complete intel summary for each agency in the current region.
 * Used by intel.js to render the three-column board.
 *
 * @param {object} [state]
 * @returns {Array<object>} Array of agency intel objects
 */
function getAgencyIntelSummary(state) {
  const gs = state || getGameState();
  if (!gs) return [];

  const agencies = Object.keys(gs.agencySuspicion);

  return agencies.map(agency => {
    const profile = AGENCY_PROFILES[agency] || {
      fullName: agency,
      jurisdiction: 'Unknown',
      specialty: 'Unknown',
      icon: '●',
      color: '#4a7aac',
    };

    const suspicion = gs.agencySuspicion[agency];
    const status = gs.agencyStatus[agency] || 'UNAWARE';
    const statusDesc = STATUS_DESCRIPTIONS[status] || '';
    const statusLabel = STATUS_LABELS[status] || status;

    // Find the latest public move from this agency in the news feed
    const latestMove = gs.newsFeed?.find(
      n => n.agencyPublicMove && n.agencyPublicMove.toLowerCase().includes(agency.toLowerCase())
    );

    // Count kills since this agency last escalated
    const killsSinceStart = gs.totalKills || 0;

    // Next threshold — what suspicion value triggers escalation
    const currentIdx = statusIndex(status);
    const nextThreshold = SUSPICION_THRESHOLDS[currentIdx + 1] || null;

    return {
      agency,
      ...profile,
      suspicion,
      status,
      statusLabel,
      statusDesc,
      latestPublicMove: latestMove?.agencyPublicMove || null,
      nextThreshold: nextThreshold ? nextThreshold.min : null,
      nextStatus: nextThreshold ? STATUS_LABELS[nextThreshold.status] : null,
      distanceToNext: nextThreshold ? Math.max(0, nextThreshold.min - suspicion) : 0,
      killsSinceStart,
      isClassifiedActive: hasClassifiedActivity(gs),
    };
  });
}

// ---------------------------------------------------------------------------
// Threat level — overall danger assessment
// ---------------------------------------------------------------------------

/**
 * Computes the overall threat level based on the highest agency status.
 * @param {object} [state]
 * @returns {{ level: string, label: string, color: string }}
 */
function getOverallThreatLevel(state) {
  const gs = state || getGameState();
  if (!gs) return { level: 'NONE', label: 'No Threat', color: '#444444' };

  let maxIdx = 0;
  for (const agency of Object.keys(gs.agencyStatus)) {
    const idx = statusIndex(gs.agencyStatus[agency]);
    if (idx > maxIdx) maxIdx = idx;
  }

  const levels = [
    { level: 'NONE', label: 'No Threat', color: '#444444' },
    { level: 'LOW', label: 'Low', color: '#1A3A5C' },
    { level: 'MODERATE', label: 'Moderate', color: '#D4A017' },
    { level: 'HIGH', label: 'High', color: '#c46030' },
    { level: 'CRITICAL', label: 'Critical', color: '#C41E3A' },
  ];

  return levels[maxIdx] || levels[0];
}

// ---------------------------------------------------------------------------
// Exports
// ---------------------------------------------------------------------------

export {
  // Core
  updateAllAgencyStatuses,
  computeStatusFromSuspicion,

  // Classified activity
  hasClassifiedActivity,
  getClassifiedTimeline,

  // Intel data
  getAgencyIntelSummary,
  getOverallThreatLevel,

  // Metadata
  AGENCY_PROFILES,
  STATUS_DESCRIPTIONS,
  STATUS_LABELS,
  SUSPICION_THRESHOLDS,
};

// Expose on window for console debugging
window.updateAllAgencyStatuses = updateAllAgencyStatuses;
window.getAgencyIntelSummary = getAgencyIntelSummary;
window.hasClassifiedActivity = hasClassifiedActivity;
window.getOverallThreatLevel = getOverallThreatLevel;
