// ============================================================================
// NULL — Compound Memory Engine
// Master Prompt Section 12 & GDD Section 6.5
//
// Extracts behavioral patterns across runs to allow subtle agency adaptation
// and narrative continuity without breaking deterministic simulation rules.
// ============================================================================

import { getRunHistory } from './gameState.js';

/**
 * Analyzes run history and returns structured player behavioral profiles.
 * @returns {object} Analysis of player tendencies
 */
export function analyzePlayerHistory() {
  const history = getRunHistory();
  if (!history || history.length === 0) {
    return {
      runCount: 0,
      dominantMethod: null,
      bargainRate: 0,
      averageLifespanConsumed: 0,
      tendencies: ['First run — baseline behavioral analysis.'],
    };
  }

  const methodCounts = {
    cardiac: 0,
    accident: 0,
    publicCollapse: 0,
    orchestrated: 0,
  };

  let totalBargains = 0;

  for (const run of history) {
    if (run.sightBargainTaken) totalBargains++;
    if (run.entriesByCause) {
      for (const [cause, count] of Object.entries(run.entriesByCause)) {
        if (cause in methodCounts) {
          methodCounts[cause] += count;
        }
      }
    }
  }

  // Find dominant method
  let dominantMethod = 'cardiac';
  let maxCount = -1;
  for (const [m, count] of Object.entries(methodCounts)) {
    if (count > maxCount) {
      maxCount = count;
      dominantMethod = m;
    }
  }

  const bargainRate = totalBargains / history.length;
  const tendencies = [];

  if (maxCount > 0) {
    tendencies.push(`Player prefers ${dominantMethod} method.`);
  }
  if (bargainRate > 0.5) {
    tendencies.push('High willingness to sacrifice lifespan for supernatural perception.');
  } else {
    tendencies.push('Cautious bearer — avoids supernatural lifespan bargains.');
  }

  return {
    runCount: history.length,
    dominantMethod,
    methodCounts,
    bargainRate,
    tendencies,
  };
}

/**
 * Returns agency doctrine adjustments based on compound memory.
 * Agencies do NOT become omniscient; their forensic focus shifts slightly.
 *
 * @param {object} analysis — From analyzePlayerHistory()
 * @returns {object} Adjustments to agency detection sensitivities
 */
export function getAgencyMemoryAdaptations(analysis) {
  if (!analysis || analysis.runCount === 0) {
    return { sensitivityMultiplier: 1.0, focus: 'General pattern monitoring' };
  }

  const adaptations = {
    sensitivityMultiplier: Math.min(1.4, 1.0 + (analysis.runCount * 0.05)),
    focus: analysis.dominantMethod
      ? `Elevated scrutiny of ${analysis.dominantMethod} fatalities`
      : 'Standard cross-jurisdiction analysis',
  };

  return adaptations;
}
