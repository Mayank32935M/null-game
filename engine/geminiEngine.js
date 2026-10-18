// ============================================================================
// NULL — Gemini Provider Engine (v2)
// AI provider integration for narrative generation.
//
// SECURITY: This module does NOT contain any API keys.
// The key must be provided at runtime via:
//   1. window.__NULL_CONFIG.GEMINI_API_KEY (injected by a config script)
//   2. A server-side proxy (recommended for production)
//
// This module is a PROVIDER — it generates text from prompts.
// It does NOT touch game state. The narrativeEngine coordinates
// requests and validates responses before they reach the UI.
// ============================================================================

// ---------------------------------------------------------------------------
// Configuration
// ---------------------------------------------------------------------------

/**
 * Gets the API key from runtime configuration.
 * NEVER returns a hardcoded key. Returns null if no key is configured.
 * @returns {string|null}
 */
function getApiKey() {
  if (typeof window !== 'undefined' && window.__NULL_CONFIG?.GEMINI_API_KEY) {
    return window.__NULL_CONFIG.GEMINI_API_KEY;
  }
  return null;
}

const GEMINI_MODEL = 'gemini-2.5-flash';

function getEndpoint() {
  const key = getApiKey();
  if (!key) return null;
  return `https://generativelanguage.googleapis.com/v1beta/models/${GEMINI_MODEL}:generateContent?key=${key}`;
}

const GENERATION_CONFIG = {
  temperature: 0.7,
  topP: 0.9,
  topK: 40,
  maxOutputTokens: 2000,
  thinkingConfig: { thinkingBudget: 0 },
};

// ---------------------------------------------------------------------------
// Provider Status
// ---------------------------------------------------------------------------

/**
 * Checks whether the AI provider is configured and available.
 * @returns {{ available: boolean, reason: string }}
 */
export function checkProviderStatus() {
  const key = getApiKey();
  if (!key) {
    return {
      available: false,
      reason: 'No API key configured. Set window.__NULL_CONFIG.GEMINI_API_KEY or use a server proxy.',
    };
  }
  return { available: true, reason: 'Provider configured.' };
}

// ---------------------------------------------------------------------------
// JSON Extraction
// ---------------------------------------------------------------------------

/**
 * Extracts JSON from a response that may contain markdown fences.
 * @param {string} raw
 * @returns {string}
 */
function extractJSON(raw) {
  if (!raw || typeof raw !== 'string') return '';
  let cleaned = raw.replace(/```(?:json)?\s*/gi, '').replace(/```\s*/g, '');
  const start = cleaned.indexOf('{');
  const end = cleaned.lastIndexOf('}');
  if (start === -1 || end === -1 || end < start) return cleaned.trim();
  return cleaned.slice(start, end + 1).trim();
}

// ---------------------------------------------------------------------------
// Core API Call
// ---------------------------------------------------------------------------

/**
 * Sends a prompt to the Gemini API and returns raw text.
 * @param {string} prompt
 * @returns {Promise<string>}
 */
async function callGeminiRaw(prompt) {
  const endpoint = getEndpoint();
  if (!endpoint) {
    throw new Error('[GeminiEngine] No API key configured.');
  }

  const body = {
    contents: [{ parts: [{ text: prompt }] }],
    generationConfig: GENERATION_CONFIG,
  };

  const response = await fetch(endpoint, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });

  if (!response.ok) {
    const errText = await response.text().catch(() => '(no body)');
    throw new Error(`[GeminiEngine] HTTP ${response.status}: ${errText.slice(0, 200)}`);
  }

  const data = await response.json();
  const candidate = data?.candidates?.[0];
  if (!candidate) throw new Error('[GeminiEngine] No candidates in response');

  const finishReason = candidate.finishReason;
  if (finishReason && finishReason !== 'STOP' && finishReason !== 'MAX_TOKENS') {
    throw new Error(`[GeminiEngine] Blocked: finishReason=${finishReason}`);
  }

  const text = candidate?.content?.parts?.[0]?.text;
  if (!text) throw new Error('[GeminiEngine] Empty response text');

  return text;
}

/**
 * Calls Gemini with retry and returns parsed JSON.
 * @param {string} prompt
 * @returns {Promise<object>}
 */
async function callGemini(prompt) {
  let rawText;
  try {
    rawText = await callGeminiRaw(prompt);
  } catch (err) {
    throw new Error(`[GeminiEngine] API error: ${err.message}`);
  }

  try {
    return JSON.parse(extractJSON(rawText));
  } catch (_) {
    // Retry with stricter prompt
    console.warn('[GeminiEngine] First parse failed, retrying...');
  }

  const retryPrompt = `${prompt}\n\nCRITICAL: Return ONLY raw JSON. No markdown. No explanation. Start with { and end with }.`;
  let retryText;
  try {
    retryText = await callGeminiRaw(retryPrompt);
  } catch (err) {
    throw new Error(`[GeminiEngine] Retry failed: ${err.message}`);
  }

  try {
    return JSON.parse(extractJSON(retryText));
  } catch (finalErr) {
    throw new Error(`[GeminiEngine] Could not parse response: ${finalErr.message}`);
  }
}

// ---------------------------------------------------------------------------
// Narrative Generation — implements the provider interface
// ---------------------------------------------------------------------------

/**
 * Generates a narrative from a bounded context.
 * This is the main provider interface called by narrativeEngine.
 *
 * @param {string} narrativeType — 'newsArticle', 'watcherLine', etc.
 * @param {object} context — Bounded context from narrativeEngine
 * @returns {Promise<object>} { headline, detail, source, watcherLine, agencyPublicMove }
 */
async function generateNarrative(narrativeType, context) {
  const prompt = buildNarrativePrompt(narrativeType, context);
  const result = await callGemini(prompt);
  return result;
}

/**
 * Builds a narrative prompt from bounded context.
 * The prompt constrains what the AI can claim.
 *
 * @param {string} narrativeType
 * @param {object} context
 * @returns {string}
 */
function buildNarrativePrompt(narrativeType, context) {
  return `You are a news writer for a fictional thriller game. Generate a news reaction to a recent event.

WORLD STATE:
- Crime Index: ${context.crimeIndex}
- Public Fear: ${context.publicFear}
- Public Trust: ${context.publicTrust}
- Turn: ${context.turn}

EVENT TO NARRATE:
${context.event.description}

RECENT PUBLIC EVENTS:
${context.recentPublicEvents.map(e => `- ${e.description}`).join('\n')}

AGENCY STATES:
${context.agencyStates.map(a => `- ${a.name}: ${a.stageLabel}`).join('\n')}

CONSTRAINTS:
- Write as a realistic news outlet. Professional tone.
- NEVER mention anything supernatural, magical, or otherworldly.
- NEVER reference a "ledger", "bearer", "watcher", or any supernatural entity.
- Headlines must read like real news.
- Detail is 1-2 sentences expanding the headline.
- watcherLine is a short, dry, observational line (max 15 words) from an unseen narrator. Cryptic, never advice.
- agencyPublicMove: null if agencies stay silent, otherwise a brief public statement.

Return ONLY valid JSON:
{
  "headline": "<news headline>",
  "detail": "<1-2 sentence detail>",
  "source": "<fictional news outlet name>",
  "watcherLine": "<observer's dry comment>",
  "agencyPublicMove": <null or "string">
}`;
}

// ---------------------------------------------------------------------------
// Provider Object — clean interface for narrativeEngine
// ---------------------------------------------------------------------------

export const geminiProvider = {
  generateNarrative,
  checkStatus: checkProviderStatus,
};

// ---------------------------------------------------------------------------
// Exports
// ---------------------------------------------------------------------------

export {
  callGemini,
  callGeminiRaw,
  extractJSON,
  generateNarrative,
  checkProviderStatus as isProviderAvailable,
};

if (typeof window !== 'undefined') {
  window.checkProviderStatus = checkProviderStatus;
}
