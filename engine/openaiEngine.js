// ============================================================================
// NULL — OpenAI Provider Engine
// AI provider alternative implementing the narrative provider interface.
//
// SECURITY: No API keys are hardcoded. Keys must be supplied at runtime via:
//   window.__NULL_CONFIG.OPENAI_API_KEY
// ============================================================================

function getApiKey() {
  if (typeof window !== 'undefined' && window.__NULL_CONFIG?.OPENAI_API_KEY) {
    return window.__NULL_CONFIG.OPENAI_API_KEY;
  }
  return null;
}

export function checkProviderStatus() {
  const key = getApiKey();
  if (!key) {
    return {
      available: false,
      reason: 'No OpenAI API key configured. Set window.__NULL_CONFIG.OPENAI_API_KEY.',
    };
  }
  return { available: true, reason: 'OpenAI provider configured.' };
}

export async function generateNarrative(narrativeType, context) {
  const key = getApiKey();
  if (!key) {
    throw new Error('[OpenAIEngine] No API key configured.');
  }

  const prompt = `You are a journalist for a psychological intelligence thriller.
WORLD STATE: Crime Index ${context.crimeIndex}, Turn ${context.turn}.
EVENT: ${context.event?.description || 'A sudden fatality occurred.'}
Write a news reaction in JSON:
{
  "headline": "<realistic news headline>",
  "detail": "<1-2 sentence detail>",
  "source": "<fictional publication>",
  "watcherLine": "<short dry observation max 15 words>",
  "agencyPublicMove": null
}`;

  const response = await fetch('https://api.openai.com/v1/chat/completions', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${key}`,
    },
    body: JSON.stringify({
      model: 'gpt-4o-mini',
      messages: [{ role: 'user', content: prompt }],
      response_format: { type: 'json_object' },
      temperature: 0.7,
    }),
  });

  if (!response.ok) {
    throw new Error(`[OpenAIEngine] HTTP ${response.status}`);
  }

  const data = await response.json();
  const text = data.choices?.[0]?.message?.content;
  return JSON.parse(text);
}

export const openaiProvider = {
  generateNarrative,
  checkStatus: checkProviderStatus,
};
