// ============================================================================
// NULL — Gemini World Brain Engine
// GDD Section 6.4 — Gemini 1.5 Flash integration
//
// Responsibility: Called after every kill. Returns structured JSON describing
// how the world reacts — crime rate delta, agency suspicion shifts, news
// headline, Void line. Never returns prose. Never touches game state directly.
// ============================================================================

// ---------------------------------------------------------------------------
// Configuration
// ---------------------------------------------------------------------------

// GDD 6.1: All API calls are client-side for v1 (no backend).
// Key is injected at runtime via window.__NULL_CONFIG or falls back to the
// build-time constant below. For production, supply via a thin config script
// in index.html — never commit the raw key to source control.
const GEMINI_API_KEY =
  (typeof window !== 'undefined' && window.__NULL_CONFIG?.GEMINI_API_KEY) ||
  '';

// Gemini 2.5 Flash — fast, capable model confirmed available on this API key.
// Spiritually equivalent to the GDD's "Gemini 1.5 Flash" intent: free-tier, fast,
// handles structured world simulation JSON reliably.
const GEMINI_MODEL = 'gemini-2.5-flash';

const GEMINI_ENDPOINT = `https://generativelanguage.googleapis.com/v1beta/models/${GEMINI_MODEL}:generateContent?key=${GEMINI_API_KEY}`;

// Generation config — moderate temperature for varied headlines/void lines
// Note: responseMimeType is not supported in the v1beta REST generationConfig;
// JSON format is enforced entirely via the prompt.
// thinkingConfig: gemini-2.5-flash has thinking mode ON by default, which
// consumes the bulk of maxOutputTokens before producing any response — disable it
// for this structured JSON task where thinking overhead is wasted budget.
const GENERATION_CONFIG = {
  temperature: 0.7,
  topP: 0.9,
  topK: 40,
  maxOutputTokens: 3000,     // Generous headroom; actual JSON response is ~300 tokens
  thinkingConfig: {
    thinkingBudget: 0,       // Disable thinking — we want direct JSON, not reasoning
  },
};

// ---------------------------------------------------------------------------
// Response schema — what fields we require from every world reaction
// ---------------------------------------------------------------------------

const WORLD_REACTION_SCHEMA = {
  crimeRateDelta: { type: 'number', min: -30, max: 0 },
  agencySuspicionDelta: { type: 'object' },  // validated separately
  publicFearDelta: { type: 'number', min: -10, max: 30 },
  egoDelta: { type: 'number', min: -5, max: 15 },
  exposureRiskDelta: { type: 'number', min: -5, max: 20 },
  newsHeadline: { type: 'string', minLen: 10, maxLen: 200 },
  newsDetail: { type: 'string', minLen: 10, maxLen: 500 },
  agencyPublicMove: { type: 'nullable-string' },  // null or string
  voidLine: { type: 'string', minLen: 5, maxLen: 200 },
};

// Per-agency suspicion delta bounds
const AGENCY_DELTA_BOUNDS = { min: -15, max: 40 };

// ---------------------------------------------------------------------------
// Prompt builders — GDD Section 6.4
// ---------------------------------------------------------------------------

/**
 * Builds the world reaction prompt exactly per GDD Section 6.4.
 * Called with the full game state and the kill action that just occurred.
 *
 * @param {object} gameState — The current master game state object
 * @param {object} kill      — { targetName, targetType, method, finalActions? }
 * @returns {string} The prompt string to send to Gemini
 */
function worldReactionPrompt(gameState, kill) {
  // Slim the game state for the prompt — exclude large arrays to stay within
  // token budget, but keep all the fields Gemini needs for calibration.
  const stateSlim = {
    version: gameState.version,
    region: gameState.region,
    playerName: gameState.playerName,
    currentAct: gameState.currentAct,
    currentBeat: gameState.currentBeat,
    runNumber: gameState.runNumber,
    crimeRate: gameState.crimeRate,
    publicFearIndex: gameState.publicFearIndex,
    egoIndex: gameState.egoIndex,
    exposureRisk: gameState.exposureRisk,
    lifespanDays: gameState.lifespanDays,
    agencySuspicion: gameState.agencySuspicion,
    agencyStatus: gameState.agencyStatus,
    agencyDarkMode: gameState.agencyDarkMode,
    eyesDealActive: gameState.eyesDealActive,
    totalKills: gameState.totalKills,
    killMethods: gameState.killMethods,
    companionAlliance: gameState.companionAlliance,
    phantomBroadcastTriggered: gameState.phantomBroadcastTriggered,
    // Last 3 news items for tonal consistency (no more — token budget)
    recentNews: (gameState.newsFeed || []).slice(0, 3).map(n => n.headline),
  };

  // Build agency suspicion delta template — keys match the actual agencies
  const agencyDeltaTemplate = Object.keys(gameState.agencySuspicion)
    .map(a => `"${a}": <number>`)
    .join(', ');

  return `You are the world simulation engine for a psychological thriller game called NULL.
A player has just made a kill. Update the world state and generate a news reaction.

CURRENT GAME STATE:
${JSON.stringify(stateSlim, null, 2)}

KILL ACTION:
Target: ${kill.targetName}
Target Type: ${kill.targetType}
Method: ${kill.method}
Final Actions Written: ${kill.finalActions || 'none'}
Region: ${gameState.region}

SIMULATION RULES:
- crimeRateDelta must be negative (crime goes down after a kill). Scale with target type: petty criminal = -0.3 to -1.5, corrupt official = -1.5 to -4, systemic criminal = -3 to -8.
- Agency suspicion rises more if method is "publicDeath" or "accident" vs "heartAttack".
- publicFearDelta rises with "publicDeath", falls slightly with "heartAttack" over time.
- egoDelta rises with every kill; more for "publicDeath" or when target is high-profile.
- exposureRiskDelta is higher if method is traceable (accident, publicDeath) or if agency status is already ACTIVE+.
- newsHeadline must read like a real Indian/US/Japanese news outlet depending on region — specific, credible, never mention "notebook" or supernatural causes.
- newsDetail is 1-2 sentences expanding the headline.
- agencyPublicMove: null if agencies stay silent, otherwise a 1-sentence description of their public action.
- voidLine: one dry, observational sentence from the Shinigami. Never advice. Never judgment. Max 15 words.

Return ONLY valid JSON, nothing else, no preamble, no markdown:
{
  "crimeRateDelta": <number>,
  "agencySuspicionDelta": { ${agencyDeltaTemplate} },
  "publicFearDelta": <number>,
  "egoDelta": <number>,
  "exposureRiskDelta": <number>,
  "newsHeadline": "<single realistic news headline>",
  "newsDetail": "<1-2 sentence article body>",
  "agencyPublicMove": <null or "string">,
  "voidLine": "<one Void observation>"
}`;
}

/**
 * Builds the stricter retry prompt — appended when the first call returns
 * unparseable JSON. Forces Gemini to strip any markdown wrapping.
 *
 * @param {string} originalPrompt
 * @returns {string}
 */
function buildRetryPrompt(originalPrompt) {
  return `${originalPrompt}

CRITICAL: Your previous response could not be parsed as JSON.
Return ONLY raw JSON. No markdown. No explanation. No backticks.
Start your response with { and end with }. Nothing else.`;
}

// ---------------------------------------------------------------------------
// JSON extraction — handles cases where Gemini wraps in markdown fences
// despite instructions
// ---------------------------------------------------------------------------

/**
 * Attempts to extract a JSON object from a string that may contain markdown
 * code fences or leading/trailing prose.
 *
 * @param {string} raw
 * @returns {string} Cleaned JSON string ready for JSON.parse
 */
function extractJSON(raw) {
  if (!raw || typeof raw !== 'string') return '';

  // Strip markdown code fences: ```json ... ``` or ``` ... ```
  let cleaned = raw.replace(/```(?:json)?\s*/gi, '').replace(/```\s*/g, '');

  // Find the outermost { ... } block
  const start = cleaned.indexOf('{');
  const end = cleaned.lastIndexOf('}');

  if (start === -1 || end === -1 || end < start) return cleaned.trim();
  return cleaned.slice(start, end + 1).trim();
}

// ---------------------------------------------------------------------------
// Core API call
// ---------------------------------------------------------------------------

/**
 * Sends a prompt to Gemini 1.5 Flash and returns the raw text response.
 * Does NOT parse — parsing is the caller's responsibility.
 *
 * @param {string} prompt
 * @returns {Promise<string>} Raw text from the model
 * @throws {Error} If the network request fails or the response is malformed
 */
async function callGeminiRaw(prompt) {
  const body = {
    contents: [
      {
        parts: [{ text: prompt }],
      },
    ],
    generationConfig: GENERATION_CONFIG,
  };

  const response = await fetch(GEMINI_ENDPOINT, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });

  if (!response.ok) {
    const errText = await response.text().catch(() => '(no body)');
    throw new Error(`[GeminiEngine] HTTP ${response.status}: ${errText}`);
  }

  const data = await response.json();

  // Navigate the Gemini response structure
  const candidate = data?.candidates?.[0];
  if (!candidate) {
    throw new Error('[GeminiEngine] No candidates in response');
  }

  // Check for safety blocks or finish reasons that indicate no content
  const finishReason = candidate.finishReason;
  if (finishReason && finishReason !== 'STOP' && finishReason !== 'MAX_TOKENS') {
    throw new Error(`[GeminiEngine] Candidate blocked: finishReason=${finishReason}`);
  }

  const text = candidate?.content?.parts?.[0]?.text;
  if (!text) {
    throw new Error('[GeminiEngine] Empty text in candidate content');
  }

  return text;
}

// ---------------------------------------------------------------------------
// callGemini — main export, with retry
// GDD 6.4: "Retry once with stricter prompt" on JSON parse failure
// ---------------------------------------------------------------------------

/**
 * Calls Gemini with the given prompt and returns parsed JSON.
 * If the first response fails to parse, retries once with the stricter prompt.
 *
 * @param {string} prompt — A fully-built prompt string
 * @returns {Promise<object>} Parsed JSON object from Gemini
 * @throws {Error} If both attempts fail to produce valid JSON
 */
async function callGemini(prompt) {
  // ── Attempt 1 ──────────────────────────────────────────────────────────────
  let rawText;
  try {
    rawText = await callGeminiRaw(prompt);
  } catch (err) {
    throw new Error(`[GeminiEngine] Network/API error on first attempt: ${err.message}`);
  }

  try {
    const jsonStr = extractJSON(rawText);
    const parsed = JSON.parse(jsonStr);
    return parsed;
  } catch (_parseErr) {
    console.warn('[GeminiEngine] First parse failed — retrying with stricter prompt.');
    console.warn('[GeminiEngine] Raw text was:', rawText?.slice(0, 300));
  }

  // ── Attempt 2 (retry) ──────────────────────────────────────────────────────
  // GDD 6.4: "Retry once with stricter prompt"
  const retryPrompt = buildRetryPrompt(prompt);

  let retryText;
  try {
    retryText = await callGeminiRaw(retryPrompt);
  } catch (err) {
    throw new Error(`[GeminiEngine] Network/API error on retry: ${err.message}`);
  }

  try {
    const jsonStr = extractJSON(retryText);
    const parsed = JSON.parse(jsonStr);
    return parsed;
  } catch (finalErr) {
    console.error('[GeminiEngine] Both attempts failed to parse JSON.');
    console.error('[GeminiEngine] Retry raw text:', retryText?.slice(0, 300));
    throw new Error(
      `[GeminiEngine] Could not parse Gemini response after retry: ${finalErr.message}`
    );
  }
}

// ---------------------------------------------------------------------------
// validateWorldReaction
// Checks all required fields exist and values are in valid ranges
// MUST pass before any field is allowed to touch game state
// ---------------------------------------------------------------------------

/**
 * Validates a parsed world reaction object from Gemini.
 * Returns { valid: true } on success, or { valid: false, errors: string[] } on failure.
 *
 * @param {object} reaction      — The parsed JSON from callGemini
 * @param {object} gameState     — Current game state (needed to validate agency keys)
 * @returns {{ valid: boolean, errors: string[] }}
 */
function validateWorldReaction(reaction, gameState) {
  const errors = [];

  if (!reaction || typeof reaction !== 'object' || Array.isArray(reaction)) {
    return { valid: false, errors: ['Reaction is not a plain object'] };
  }

  // ── crimeRateDelta ─────────────────────────────────────────────────────────
  if (typeof reaction.crimeRateDelta !== 'number' || isNaN(reaction.crimeRateDelta)) {
    errors.push('crimeRateDelta must be a number');
  } else {
    const schema = WORLD_REACTION_SCHEMA.crimeRateDelta;
    if (reaction.crimeRateDelta > 0) {
      errors.push(`crimeRateDelta must be ≤ 0 (crime should decrease after a kill), got ${reaction.crimeRateDelta}`);
    }
    if (reaction.crimeRateDelta < schema.min) {
      errors.push(`crimeRateDelta ${reaction.crimeRateDelta} is below floor ${schema.min} — clamping`);
      reaction.crimeRateDelta = schema.min; // Soft clamp — log warning but continue
    }
  }

  // ── agencySuspicionDelta ───────────────────────────────────────────────────
  if (!reaction.agencySuspicionDelta || typeof reaction.agencySuspicionDelta !== 'object') {
    errors.push('agencySuspicionDelta must be an object');
  } else {
    const expectedAgencies = Object.keys(gameState?.agencySuspicion || {});
    for (const agency of expectedAgencies) {
      const delta = reaction.agencySuspicionDelta[agency];
      if (delta === undefined || delta === null) {
        // Tolerate missing keys — default to 0 rather than failing
        reaction.agencySuspicionDelta[agency] = 0;
        console.warn(`[GeminiEngine] agencySuspicionDelta missing key "${agency}" — defaulted to 0`);
      } else if (typeof delta !== 'number' || isNaN(delta)) {
        errors.push(`agencySuspicionDelta.${agency} must be a number`);
      } else {
        // Soft-clamp to bounds — log but continue
        if (delta < AGENCY_DELTA_BOUNDS.min || delta > AGENCY_DELTA_BOUNDS.max) {
          console.warn(
            `[GeminiEngine] agencySuspicionDelta.${agency}=${delta} out of bounds [${AGENCY_DELTA_BOUNDS.min}, ${AGENCY_DELTA_BOUNDS.max}] — clamping`
          );
          reaction.agencySuspicionDelta[agency] = Math.max(
            AGENCY_DELTA_BOUNDS.min,
            Math.min(AGENCY_DELTA_BOUNDS.max, delta)
          );
        }
      }
    }
  }

  // ── publicFearDelta ────────────────────────────────────────────────────────
  if (typeof reaction.publicFearDelta !== 'number' || isNaN(reaction.publicFearDelta)) {
    errors.push('publicFearDelta must be a number');
  } else {
    const { min, max } = WORLD_REACTION_SCHEMA.publicFearDelta;
    if (reaction.publicFearDelta < min || reaction.publicFearDelta > max) {
      console.warn(`[GeminiEngine] publicFearDelta ${reaction.publicFearDelta} out of [${min},${max}] — clamping`);
      reaction.publicFearDelta = Math.max(min, Math.min(max, reaction.publicFearDelta));
    }
  }

  // ── egoDelta ───────────────────────────────────────────────────────────────
  if (typeof reaction.egoDelta !== 'number' || isNaN(reaction.egoDelta)) {
    errors.push('egoDelta must be a number');
  } else {
    const { min, max } = WORLD_REACTION_SCHEMA.egoDelta;
    if (reaction.egoDelta < min || reaction.egoDelta > max) {
      console.warn(`[GeminiEngine] egoDelta ${reaction.egoDelta} out of [${min},${max}] — clamping`);
      reaction.egoDelta = Math.max(min, Math.min(max, reaction.egoDelta));
    }
  }

  // ── exposureRiskDelta ──────────────────────────────────────────────────────
  if (typeof reaction.exposureRiskDelta !== 'number' || isNaN(reaction.exposureRiskDelta)) {
    errors.push('exposureRiskDelta must be a number');
  } else {
    const { min, max } = WORLD_REACTION_SCHEMA.exposureRiskDelta;
    if (reaction.exposureRiskDelta < min || reaction.exposureRiskDelta > max) {
      console.warn(`[GeminiEngine] exposureRiskDelta ${reaction.exposureRiskDelta} out of [${min},${max}] — clamping`);
      reaction.exposureRiskDelta = Math.max(min, Math.min(max, reaction.exposureRiskDelta));
    }
  }

  // ── newsHeadline ───────────────────────────────────────────────────────────
  if (typeof reaction.newsHeadline !== 'string') {
    errors.push('newsHeadline must be a string');
  } else {
    const { minLen, maxLen } = WORLD_REACTION_SCHEMA.newsHeadline;
    if (reaction.newsHeadline.trim().length < minLen) {
      errors.push(`newsHeadline too short (min ${minLen} chars)`);
    }
    if (reaction.newsHeadline.length > maxLen) {
      // Truncate silently — better than failing
      reaction.newsHeadline = reaction.newsHeadline.slice(0, maxLen).trimEnd() + '…';
    }
  }

  // ── newsDetail ─────────────────────────────────────────────────────────────
  if (typeof reaction.newsDetail !== 'string') {
    errors.push('newsDetail must be a string');
  } else {
    const { minLen, maxLen } = WORLD_REACTION_SCHEMA.newsDetail;
    if (reaction.newsDetail.trim().length < minLen) {
      errors.push(`newsDetail too short (min ${minLen} chars)`);
    }
    if (reaction.newsDetail.length > maxLen) {
      reaction.newsDetail = reaction.newsDetail.slice(0, maxLen).trimEnd() + '…';
    }
  }

  // ── agencyPublicMove ───────────────────────────────────────────────────────
  // Must be null, undefined, or a non-empty string
  const apm = reaction.agencyPublicMove;
  if (apm !== null && apm !== undefined && typeof apm !== 'string') {
    errors.push('agencyPublicMove must be null or a string');
  } else if (typeof apm === 'string' && apm.trim().length === 0) {
    // Empty string → normalise to null
    reaction.agencyPublicMove = null;
  }

  // ── voidLine ───────────────────────────────────────────────────────────────
  if (typeof reaction.voidLine !== 'string') {
    errors.push('voidLine must be a string');
  } else {
    const { minLen, maxLen } = WORLD_REACTION_SCHEMA.voidLine;
    if (reaction.voidLine.trim().length < minLen) {
      errors.push(`voidLine too short (min ${minLen} chars)`);
    }
    if (reaction.voidLine.length > maxLen) {
      reaction.voidLine = reaction.voidLine.slice(0, maxLen).trimEnd();
    }
  }

  return {
    valid: errors.length === 0,
    errors,
  };
}

// ---------------------------------------------------------------------------
// applyWorldReaction
// Convenience: validate then apply deltas to game state.
// Returns the updated game state (mutated in-place).
// Called by notebook.js after callGemini() succeeds.
// ---------------------------------------------------------------------------

/**
 * Applies a validated world reaction to the game state.
 * Does NOT save — caller must call saveGame() after.
 *
 * @param {object} gameState — The live game state (mutated in-place)
 * @param {object} reaction  — A validated world reaction from validateWorldReaction
 * @param {object} kill      — The kill action (for kill log)
 * @param {Function} clamp   — The clamp() helper from gameState.js
 * @returns {object} The mutated game state
 */
function applyWorldReaction(gameState, reaction, kill, clamp) {
  // World variables — all clamped to 0–100
  gameState.crimeRate = clamp(gameState.crimeRate + reaction.crimeRateDelta, 0, 100);
  // FIX 3: crimeDelta = distance from starting value of 100 (always ≤ 0 since crime falls)
  gameState.crimeDelta = gameState.crimeRate - 100;
  gameState.publicFearIndex = clamp(gameState.publicFearIndex + reaction.publicFearDelta, 0, 100);
  gameState.egoIndex = clamp(gameState.egoIndex + reaction.egoDelta, 0, 100);
  gameState.exposureRisk = clamp(gameState.exposureRisk + reaction.exposureRiskDelta, 0, 100);

  // Agency suspicion deltas
  for (const [agency, delta] of Object.entries(reaction.agencySuspicionDelta)) {
    if (agency in gameState.agencySuspicion) {
      gameState.agencySuspicion[agency] = clamp(
        gameState.agencySuspicion[agency] + delta,
        0, 100
      );
    }
  }

  // Kill log
  gameState.totalKills += 1;
  const method = kill.method || 'heartAttack';
  if (method in gameState.killMethods) {
    gameState.killMethods[method] += 1;
  }

  const logEntry = {
    id: gameState.totalKills,
    targetName: kill.targetName,
    targetType: kill.targetType,
    method,
    finalActions: kill.finalActions || null,
    timestamp: Date.now(),
    crimeRateBefore: gameState.crimeRate - reaction.crimeRateDelta, // already applied, so back-compute
    newsHeadline: reaction.newsHeadline,
  };
  gameState.killLog.push(logEntry);

  // News feed — prepend (newest first), cap at 20 items
  const newsItem = {
    headline: reaction.newsHeadline,
    detail: reaction.newsDetail,
    source: _getNewsSource(gameState.region),
    timestamp: 'just now',
    voidLine: reaction.voidLine,
    agencyPublicMove: reaction.agencyPublicMove,
  };
  gameState.newsFeed.unshift(newsItem);
  if (gameState.newsFeed.length > 20) {
    gameState.newsFeed = gameState.newsFeed.slice(0, 20);
  }

  return gameState;
}

/**
 * Returns a plausible news source name for the current region.
 * @param {string} region
 * @returns {string}
 */
function _getNewsSource(region) {
  const sources = {
    india: ['The Hindu', 'NDTV', 'The Indian Express', 'Hindustan Times', 'The Wire'],
    usa: ['The New York Times', 'Washington Post', 'CNN', 'NBC News', 'The Atlantic'],
    japan: ['NHK World', 'The Japan Times', 'Mainichi Shimbun', 'Asahi Shimbun'],
  };
  const pool = sources[region] || sources.india;
  return pool[Math.floor(Math.random() * pool.length)];
}

// ---------------------------------------------------------------------------
// compoundMemoryAdaptation — GDD Section 6.5
// Appended to world reaction prompts on subsequent runs
// ---------------------------------------------------------------------------

/**
 * Builds the compound memory context string from run history.
 * Appended to worldReactionPrompt on Run 2+.
 * Returns null on Run 1 or if history is empty.
 *
 * @param {Array} runHistory — Array of run profile objects from getRunHistory()
 * @returns {string|null}
 */
function compoundMemoryAdaptation(runHistory) {
  if (!runHistory || runHistory.length === 0) return null;

  // Dominant kill method
  const methodTotals = {};
  for (const run of runHistory) {
    if (run.killMethods) {
      for (const [method, count] of Object.entries(run.killMethods)) {
        methodTotals[method] = (methodTotals[method] || 0) + count;
      }
    }
  }
  const dominantMethod = Object.entries(methodTotals)
    .sort((a, b) => b[1] - a[1])[0]?.[0] || 'heartAttack';

  // Eyes deal frequency
  const eyesDealRate = runHistory.filter(r => r.eyesDealTaken).length / runHistory.length;

  // Yuki/companion pattern
  const allAccepted = runHistory.every(r => r.companionChoice === 'accepted');
  const allRejected = runHistory.every(r => r.companionChoice === 'rejected');
  const allianceNote = allAccepted
    ? 'always accepts companion alliance'
    : allRejected
      ? 'always rejects companion'
      : 'variable companion alliance choice';

  // Hesitation types
  const hesitationTypes = runHistory
    .flatMap(r => Object.keys(r.hesitationMap?.targetTypes || {}))
    .filter((v, i, a) => a.indexOf(v) === i)
    .slice(0, 3);

  const lines = [
    `COMPOUND MEMORY ACTIVE — Run ${runHistory.length + 1}`,
    `Agency behavioral adaptation based on cross-run pattern analysis:`,
    `- Player historically uses ${dominantMethod} most frequently`,
    `- Player ${eyesDealRate > 0.6 ? 'frequently' : 'rarely'} takes the Eyes Deal`,
    hesitationTypes.length > 0
      ? `- Player shows hesitation toward: ${hesitationTypes.join(', ')}`
      : null,
    `- Companion alliance pattern: ${allianceNote}`,
    `Adjust agency behavior accordingly. Agencies have general intuition about this type of player.`,
    `Do NOT make agencies omniscient. Make them strategically adapted. Subtle, not supernatural.`,
  ].filter(Boolean);

  return lines.join('\n');
}

/**
 * Builds the full world reaction prompt, injecting compound memory if active.
 *
 * @param {object} gameState
 * @param {object} kill
 * @param {Array|null} runHistory — Pass null on Run 1
 * @returns {string}
 */
function buildWorldReactionPrompt(gameState, kill, runHistory = null) {
  let prompt = worldReactionPrompt(gameState, kill);

  if (gameState.compoundMemoryEnabled && runHistory && runHistory.length > 0) {
    const adaptation = compoundMemoryAdaptation(runHistory);
    if (adaptation) {
      prompt += `\n\n${adaptation}`;
    }
  }

  return prompt;
}

// ---------------------------------------------------------------------------
// Exports — GDD 6.4 specified exports + helpers
// ---------------------------------------------------------------------------

export {
  // GDD-specified exports
  callGemini,
  worldReactionPrompt,
  validateWorldReaction,

  // Additional helpers
  buildWorldReactionPrompt,   // worldReactionPrompt + compound memory injection
  applyWorldReaction,         // validate + apply deltas to game state
  compoundMemoryAdaptation,   // standalone for compound memory engine
  extractJSON,                // exposed for testing
};
window.callGemini = callGemini;
window.worldReactionPrompt = worldReactionPrompt;
window.buildWorldReactionPrompt = buildWorldReactionPrompt;
window.applyWorldReaction = applyWorldReaction;
window.validateWorldReaction = validateWorldReaction;
// ---------------------------------------------------------------------------
// testKill — Milestone 3 console test function
// Run testKill() in browser console to verify the full engine works
// ---------------------------------------------------------------------------
async function testKill() {
  console.log('🧪 NULL — Milestone 3 Test Starting...')

  // Grab gameState from window (set by gameState.js)
  const state = window.gameState
  if (!state) {
    console.error('❌ gameState not found on window. Is gameState.js loaded before geminiEngine.js?')
    return
  }

  const testKillAction = {
    targetName: 'Rajiv Mehta',
    targetType: 'corrupt official',
    method: 'heartAttack',
    finalActions: null
  }

  console.log('📤 Sending kill to Gemini...')
  console.log('Game state region:', state.region)
  console.log('Crime rate before:', state.crimeRate)

  try {
    const reaction = await callGemini(buildWorldReactionPrompt(state, testKillAction, null))
    console.log('✅ Gemini responded successfully')
    console.log('📰 News headline:', reaction.newsHeadline)
    console.log('📊 Crime rate delta:', reaction.crimeRateDelta)
    console.log('🕵️ Agency suspicion delta:', reaction.agencySuspicionDelta)
    console.log('👁️ Void line:', reaction.voidLine)
    console.log('🌍 Full reaction object:', reaction)
    return reaction
  } catch (err) {
    console.error('❌ Gemini call failed:', err.message)
    console.error('Full error:', err)
  }
}

// Expose to console
window.testKill = testKill;
