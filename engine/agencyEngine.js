// ============================================================================
// NULL — Agency Engine (v2)
// GDD Section 2.4 — Agency Intel System & Master Prompt Section 7
//
// Manages investigative agencies, suspicion levels, investigation intensity,
// and evidence collection. Works with both v2 state.agencies and legacy
// state.agencySuspicion / state.agencyStatus properties.
// ============================================================================

import { AGENCIES, AGENCY_STAGE_INFO } from '../data/universe.js';
import { getGameState, saveGame, clamp, AGENCY_STATUSES } from './gameState.js';

// ---------------------------------------------------------------------------
// Suspicion thresholds for stages
// ---------------------------------------------------------------------------

export const SUSPICION_THRESHOLDS = [
  { min: 0,  status: 'DORMANT',       legacyStatus: 'UNAWARE' },
  { min: 15, status: 'AWARE',         legacyStatus: 'MONITORING' },
  { min: 40, status: 'INVESTIGATING', legacyStatus: 'ACTIVE' },
  { min: 65, status: 'PURSUING',      legacyStatus: 'HUNTING' },
  { min: 85, status: 'CONVERGING',    legacyStatus: 'CLOSING_IN' },
];

export const STATUS_DESCRIPTIONS = {
  DORMANT:       'No active investigation. Death patterns not yet flagged.',
  AWARE:         'Statistical anomaly flagged. Passive data collection initiated.',
  INVESTIGATING: 'Active task force formed. Resources allocated. Evidence being gathered.',
  PURSUING:      'Suspect profile constructed. Direct surveillance and field operations.',
  CONVERGING:    'Apprehension protocol activated. Direct confrontation imminent.',
  // Legacy aliases
  UNAWARE:       'No awareness of anomalous death patterns.',
  MONITORING:    'Statistical anomaly flagged. Passive data collection.',
  ACTIVE:        'Active investigation initiated. Resources allocated.',
  HUNTING:       'Suspect profile constructed. Field agents deployed.',
  CLOSING_IN:    'Near-certain identification. Imminent confrontation.',
};

export const STATUS_LABELS = {
  DORMANT:       'Dormant',
  AWARE:         'Aware',
  INVESTIGATING: 'Investigating',
  PURSUING:      'Pursuing',
  CONVERGING:    'Converging',
  // Legacy aliases
  UNAWARE:       'Unaware',
  MONITORING:    'Monitoring',
  ACTIVE:        'Active',
  HUNTING:       'Hunting',
  CLOSING_IN:    'Closing In',
};

// ---------------------------------------------------------------------------
// Agency Profiles — populated from universe.js with fallback defaults
// ---------------------------------------------------------------------------

export const AGENCY_PROFILES = {};
for (const [id, agency] of Object.entries(AGENCIES)) {
  AGENCY_PROFILES[id] = {
    fullName: agency.fullName || agency.name,
    jurisdiction: agency.jurisdiction,
    specialty: agency.specialty,
    icon: agency.icon || '⬡',
    color: agency.color || '#4a7aac',
  };
}

// Ensure legacy agency keys also map gracefully
if (!AGENCY_PROFILES.CBI) {
  AGENCY_PROFILES.CBI = {
    fullName: 'Central Bureau of Investigation',
    jurisdiction: 'Federal criminal investigation. Pattern analysis.',
    specialty: 'Forensic linkage between deaths',
    icon: '⬡',
    color: '#4a7aac',
  };
}
if (!AGENCY_PROFILES.RAW) {
  AGENCY_PROFILES.RAW = {
    fullName: 'Research & Analysis Wing',
    jurisdiction: 'External intelligence. Shadow operations.',
    specialty: 'Covert surveillance networks',
    icon: '◬',
    color: '#c46030',
  };
}
if (!AGENCY_PROFILES.IB) {
  AGENCY_PROFILES.IB = {
    fullName: 'Intelligence Bureau',
    jurisdiction: 'Domestic intelligence. Counter-terror.',
    specialty: 'Mass communication monitoring',
    icon: '◎',
    color: '#7a5aac',
  };
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function statusIndex(status) {
  const normalized = status === 'UNAWARE' ? 'DORMANT'
    : status === 'MONITORING' ? 'AWARE'
    : status === 'ACTIVE' ? 'INVESTIGATING'
    : status === 'HUNTING' ? 'PURSUING'
    : status === 'CLOSING_IN' ? 'CONVERGING'
    : status;
  const idx = AGENCY_STATUSES.indexOf(normalized);
  return idx >= 0 ? idx : 0;
}

export function computeStatusFromSuspicion(suspicion) {
  let result = 'DORMANT';
  for (const threshold of SUSPICION_THRESHOLDS) {
    if (suspicion >= threshold.min) {
      result = threshold.status;
    }
  }
  return result;
}

// ---------------------------------------------------------------------------
// updateAllAgencyStatuses
// ---------------------------------------------------------------------------

export function updateAllAgencyStatuses(state) {
  const gs = state || getGameState();
  if (!gs) return { changes: [], anyEscalation: false };

  const changes = [];

  // 1. Update rich agencies if present
  if (gs.agencies) {
    for (const [id, agency] of Object.entries(gs.agencies)) {
      const intensity = agency.investigationIntensity || 0;
      const currentStage = agency.currentStage || 'DORMANT';
      const computed = computeStatusFromSuspicion(intensity);

      if (statusIndex(computed) > statusIndex(currentStage)) {
        changes.push({ agency: id, from: currentStage, to: computed });
        agency.currentStage = computed;
      }

      // Sync mirror properties
      if (!gs.agencySuspicion) gs.agencySuspicion = {};
      if (!gs.agencyStatus) gs.agencyStatus = {};
      gs.agencySuspicion[id] = intensity;
      gs.agencyStatus[id] = agency.currentStage;
    }
  } else if (gs.agencySuspicion) {
    // Fallback for legacy state
    for (const agency of Object.keys(gs.agencySuspicion)) {
      const suspicion = gs.agencySuspicion[agency];
      const currentStatus = gs.agencyStatus?.[agency] || 'DORMANT';
      const computed = computeStatusFromSuspicion(suspicion);

      if (statusIndex(computed) > statusIndex(currentStatus)) {
        changes.push({ agency, from: currentStatus, to: computed });
        if (!gs.agencyStatus) gs.agencyStatus = {};
        gs.agencyStatus[agency] = computed;
      }
    }
  }

  return {
    changes,
    anyEscalation: changes.length > 0,
  };
}

// ---------------------------------------------------------------------------
// Classified Activity Indicator
// ---------------------------------------------------------------------------

export function hasClassifiedActivity(state) {
  const gs = state || getGameState();
  if (!gs || !gs.newsFeed || gs.newsFeed.length === 0) return false;
  const latest = gs.newsFeed[0];
  return latest.agencyPublicMove === null || latest.agencyPublicMove === undefined;
}

export function getClassifiedTimeline(state) {
  const gs = state || getGameState();
  if (!gs || !gs.newsFeed) return [];

  return gs.newsFeed.map((item, i) => ({
    index: i,
    headline: item.headline,
    isClassified: item.agencyPublicMove === null || item.agencyPublicMove === undefined,
    publicMove: item.agencyPublicMove || null,
  }));
}

// ---------------------------------------------------------------------------
// Agency Intel Summary for Intel Screen
// ---------------------------------------------------------------------------

export function getAgencyIntelSummary(state) {
  const gs = state || getGameState();
  if (!gs) return [];

  // Determine agency list from state.agencies or fallback
  const agencyList = gs.agencies ? Object.keys(gs.agencies) : Object.keys(gs.agencySuspicion || {});

  return agencyList.map(agencyId => {
    const agencyObj = gs.agencies?.[agencyId];
    const profile = AGENCY_PROFILES[agencyId] || {
      fullName: agencyObj?.name || agencyId,
      jurisdiction: agencyObj?.jurisdiction || 'Intelligence operation',
      specialty: agencyObj?.specialty || 'Investigation',
      icon: agencyObj?.icon || '⬡',
      color: agencyObj?.color || '#4a7aac',
    };

    const suspicion = agencyObj
      ? Math.round(agencyObj.investigationIntensity || 0)
      : Math.round(gs.agencySuspicion?.[agencyId] || 0);

    const status = agencyObj?.currentStage || gs.agencyStatus?.[agencyId] || 'DORMANT';
    const statusDesc = STATUS_DESCRIPTIONS[status] || '';
    const statusLabel = STATUS_LABELS[status] || status;

    // Find latest public move from newsfeed or event log
    const latestMove = gs.newsFeed?.find(
      n => n.agencyPublicMove && n.agencyPublicMove.toLowerCase().includes(agencyId.toLowerCase())
    );

    const currentIdx = statusIndex(status);
    const nextThreshold = SUSPICION_THRESHOLDS[currentIdx + 1] || null;

    return {
      agency: agencyId,
      ...profile,
      suspicion,
      status,
      statusLabel,
      statusDesc,
      latestPublicMove: latestMove?.agencyPublicMove || null,
      nextThreshold: nextThreshold ? nextThreshold.min : null,
      nextStatus: nextThreshold ? STATUS_LABELS[nextThreshold.status] : null,
      distanceToNext: nextThreshold ? Math.max(0, nextThreshold.min - suspicion) : 0,
      killsSinceStart: gs.totalLedgerEntries || gs.totalKills || 0,
      evidenceCount: agencyObj?.evidenceCount || 0,
      isClassifiedActive: hasClassifiedActivity(gs),
    };
  });
}

// ---------------------------------------------------------------------------
// Threat Level
// ---------------------------------------------------------------------------

export function getOverallThreatLevel(state) {
  const gs = state || getGameState();
  if (!gs) return { level: 'NONE', label: 'No Threat', color: '#444444' };

  let maxIdx = 0;
  const statusMap = gs.agencies
    ? Object.fromEntries(Object.entries(gs.agencies).map(([k, v]) => [k, v.currentStage]))
    : (gs.agencyStatus || {});

  for (const agency of Object.keys(statusMap)) {
    const idx = statusIndex(statusMap[agency]);
    if (idx > maxIdx) maxIdx = idx;
  }

  const levels = [
    { level: 'NONE', label: 'Dormant', color: '#444444' },
    { level: 'LOW', label: 'Aware', color: '#1A3A5C' },
    { level: 'MODERATE', label: 'Investigating', color: '#D4A017' },
    { level: 'HIGH', label: 'Pursuing', color: '#c46030' },
    { level: 'CRITICAL', label: 'Converging', color: '#C41E3A' },
  ];

  return levels[maxIdx] || levels[0];
}

// Expose on window for debugging & screen access
if (typeof window !== 'undefined') {
  window.updateAllAgencyStatuses = updateAllAgencyStatuses;
  window.getAgencyIntelSummary = getAgencyIntelSummary;
  window.hasClassifiedActivity = hasClassifiedActivity;
  window.getOverallThreatLevel = getOverallThreatLevel;
}
