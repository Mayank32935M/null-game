// ============================================================================
// NULL — Narrative Engine
// Coordinates AI narrative generation with proper contracts, fallbacks,
// and validation. This module NEVER mutates authoritative game state.
// It only generates text from confirmed events and state.
//
// The narrative engine:
// 1. Builds bounded context for AI requests
// 2. Calls the AI provider (geminiEngine)
// 3. Validates responses
// 4. Falls back to templates when AI is unavailable
// 5. Caches generated narratives
// 6. Escapes output before DOM insertion
// ============================================================================

import { FALLBACK_TEMPLATES, MEDIA_SOURCES, AGENCY_STAGE_INFO } from '../data/universe.js';
import { getPublicEvents } from './eventEngine.js';
import { randomPick } from './rng.js';

// ---------------------------------------------------------------------------
// Narrative Cache — prevents redundant AI calls
// ---------------------------------------------------------------------------

const _narrativeCache = new Map();
const MAX_CACHE_SIZE = 50;

/**
 * Gets a cached narrative, or null if not cached.
 * @param {string} key
 * @returns {object|null}
 */
function getCached(key) {
  return _narrativeCache.get(key) || null;
}

/**
 * Caches a narrative result.
 * @param {string} key
 * @param {object} value
 */
function setCache(key, value) {
  if (_narrativeCache.size >= MAX_CACHE_SIZE) {
    // Remove oldest entry
    const firstKey = _narrativeCache.keys().next().value;
    _narrativeCache.delete(firstKey);
  }
  _narrativeCache.set(key, value);
}

/**
 * Clears the narrative cache. Called on new game.
 */
export function clearNarrativeCache() {
  _narrativeCache.clear();
}

// ---------------------------------------------------------------------------
// Context Builder — creates bounded context for AI requests
// ---------------------------------------------------------------------------

/**
 * Builds a bounded narrative context from game state.
 * Only includes information the AI should know about.
 * NEVER includes player's private supernatural information.
 *
 * @param {object} state — Game state
 * @param {object} event — The event to narrate
 * @returns {object} Bounded context for the AI
 */
export function buildNarrativeContext(state, event) {
  // Only public events are visible to the narrative
  const publicEvents = getPublicEvents(state.eventLog).slice(-10);

  return {
    // World state (public knowledge)
    crimeIndex: state.crimeIndex,
    publicFear: state.indicators.publicFear,
    publicTrust: state.indicators.publicTrust,
    turn: state.turn,

    // The event being narrated
    event: {
      type: event.type,
      description: event.description,
      data: event.data,
    },

    // Recent public events for context
    recentPublicEvents: publicEvents.map(e => ({
      type: e.type,
      description: e.description,
      turn: e.turn,
    })),

    // Agency public states (only what the public knows)
    agencyStates: Object.entries(state.agencies).map(([id, agency]) => ({
      name: agency.name,
      currentStage: agency.currentStage,
      stageLabel: AGENCY_STAGE_INFO[agency.currentStage]?.label || 'Unknown',
    })),

    // Constraints for the AI
    constraints: {
      allowedClaims: ['news_reporting', 'public_reaction', 'agency_statement'],
      forbiddenClaims: ['supernatural', 'ledger', 'bearer_identity', 'private_evidence'],
      tone: 'serious_journalism',
      maxLength: 500,
    },
  };
}

// ---------------------------------------------------------------------------
// AI Request — calls the provider with proper contract
// ---------------------------------------------------------------------------

/**
 * Requests a narrative from the AI provider.
 * Falls back to templates if AI is unavailable.
 *
 * @param {string} narrativeType — 'newsArticle', 'breakingNews', 'agencyStatement', 'watcherLine'
 * @param {object} context — From buildNarrativeContext
 * @param {object} options — { provider, timeout, rng }
 * @returns {Promise<object>} { headline, detail, source, watcherLine, fromAI }
 */
export async function requestNarrative(narrativeType, context, options = {}) {
  const { provider, timeout = 15000, rng } = options;
  const cacheKey = `${narrativeType}_${context.event?.data?.deduplicationKey || context.turn}`;

  // Check cache
  const cached = getCached(cacheKey);
  if (cached) return cached;

  // Try AI if provider is available
  if (provider && typeof provider.generateNarrative === 'function') {
    try {
      const aiResult = await Promise.race([
        provider.generateNarrative(narrativeType, context),
        new Promise((_, reject) =>
          setTimeout(() => reject(new Error('Narrative request timed out')), timeout)
        ),
      ]);

      // Validate AI response
      const validated = validateNarrativeResponse(aiResult);
      if (validated.valid) {
        const result = { ...validated.data, fromAI: true };
        setCache(cacheKey, result);
        return result;
      } else {
        console.warn('[NarrativeEngine] AI response failed validation:', validated.errors);
      }
    } catch (err) {
      console.warn('[NarrativeEngine] AI request failed, using fallback:', err.message);
    }
  }

  // Fallback to templates
  const fallback = generateFallbackNarrative(narrativeType, context, rng);
  setCache(cacheKey, fallback);
  return fallback;
}

// ---------------------------------------------------------------------------
// Response Validation
// ---------------------------------------------------------------------------

/**
 * Validates an AI-generated narrative response.
 * Ensures it doesn't contain forbidden claims or exceed length limits.
 *
 * @param {object} response
 * @returns {{ valid: boolean, errors: string[], data: object }}
 */
function validateNarrativeResponse(response) {
  const errors = [];

  if (!response || typeof response !== 'object') {
    return { valid: false, errors: ['Response is not an object'], data: null };
  }

  // Check required fields
  if (typeof response.headline !== 'string' || response.headline.trim().length < 5) {
    errors.push('Missing or too short headline');
  }
  if (typeof response.detail !== 'string' || response.detail.trim().length < 5) {
    errors.push('Missing or too short detail');
  }

  // Check for forbidden content (supernatural references that break immersion)
  const forbidden = ['ledger', 'supernatural', 'bearer', 'watcher', 'magic', 'spell'];
  const combined = `${response.headline || ''} ${response.detail || ''}`.toLowerCase();
  for (const word of forbidden) {
    if (combined.includes(word)) {
      errors.push(`Response contains forbidden term: ${word}`);
    }
  }

  // Truncate if too long
  if (response.headline && response.headline.length > 200) {
    response.headline = response.headline.slice(0, 197) + '…';
  }
  if (response.detail && response.detail.length > 500) {
    response.detail = response.detail.slice(0, 497) + '…';
  }

  return {
    valid: errors.length === 0,
    errors,
    data: response,
  };
}

// ---------------------------------------------------------------------------
// Fallback Narrative Generation
// ---------------------------------------------------------------------------

/**
 * Generates a narrative from templates when AI is unavailable.
 * Uses seeded RNG for reproducibility.
 *
 * @param {string} narrativeType
 * @param {object} context
 * @param {function} rng
 * @returns {object} { headline, detail, source, watcherLine, fromAI: false }
 */
export function generateFallbackNarrative(narrativeType, context, rng) {
  const cause = context.event?.data?.cause || 'cardiac';
  const targetName = context.event?.data?.targetName || 'Unknown Individual';

  // Pick headline template
  const headlineTemplates = FALLBACK_TEMPLATES.newsHeadline[cause] || FALLBACK_TEMPLATES.newsHeadline.cardiac;
  const headlineTemplate = randomPick(rng, headlineTemplates);
  const headline = headlineTemplate.replace('{targetName}', escapeHTML(targetName));

  // Pick detail
  const detailTemplates = FALLBACK_TEMPLATES.newsDetail.generic;
  const detail = randomPick(rng, detailTemplates);

  // Pick source
  const source = randomPick(rng, MEDIA_SOURCES);

  // Pick watcher line
  const watcherLine = randomPick(rng, FALLBACK_TEMPLATES.watcherLine);

  // Pick agency public move based on highest agency stage
  let agencyPublicMove = null;
  if (context.agencyStates && context.agencyStates.length > 0) {
    const highestStage = context.agencyStates.reduce((max, a) => {
      const stageOrder = ['DORMANT', 'AWARE', 'INVESTIGATING', 'PURSUING', 'CONVERGING'];
      return stageOrder.indexOf(a.currentStage) > stageOrder.indexOf(max.currentStage) ? a : max;
    });
    const moveTemplates = FALLBACK_TEMPLATES.agencyPublicMove[highestStage.currentStage];
    agencyPublicMove = moveTemplates ? randomPick(rng, moveTemplates) : null;
  }

  return {
    headline,
    detail,
    source: source.name,
    watcherLine,
    agencyPublicMove,
    fromAI: false,
  };
}

// ---------------------------------------------------------------------------
// HTML Escaping — CRITICAL for security
// All AI-generated text must be escaped before DOM insertion.
// ---------------------------------------------------------------------------

/**
 * Escapes HTML special characters to prevent XSS from AI output.
 * @param {string} str
 * @returns {string}
 */
export function escapeHTML(str) {
  if (typeof str !== 'string') return '';
  return str
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#x27;');
}

/**
 * Safely sets text content of a DOM element.
 * Uses textContent (not innerHTML) for AI-generated text.
 *
 * @param {HTMLElement} element
 * @param {string} text
 */
export function safeSetText(element, text) {
  if (element) {
    element.textContent = text || '';
  }
}
