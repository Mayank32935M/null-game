# NULL GAME — AI Narrative Integration & Safety

## Design Philosophy
In NULL, the AI does **not** decide game rules, calculate crime rate changes, kill characters, or adjust player lifespan. All consequential simulation updates are strictly computed by deterministic game engines (`worldSimulation.js` and `actionEngine.js`).

The AI acts strictly as an **epistemic and journalistic presentation layer**:
- Generates realistic news articles from confirmed public events.
- Writes cryptic, observational commentary for The Watcher.
- Formulates public agency press releases and statements.

---

## The Narrative Request Contract

Every narrative request is bounded by strict constraints:
```typescript
interface NarrativeContext {
  crimeIndex: number;
  publicFear: number;
  publicTrust: number;
  turn: number;
  event: {
    type: string;
    description: string;
    data: any;
  };
  recentPublicEvents: { type: string; description: string; turn: number }[];
  agencyStates: { name: string; currentStage: string; stageLabel: string }[];
  constraints: {
    allowedClaims: string[];
    forbiddenClaims: string[];
    tone: string;
    maxLength: number;
  };
}
```

### Constraints Enforced:
1. **Forbidden Terms:** AI responses are strictly validated. References to supernatural entities, "Ledger", "bearer", "watcher", or "spells" in public news articles are rejected to maintain world immersion.
2. **DOM Safety:** All AI-produced text is passed through `escapeHTML()` before insertion into the DOM to prevent XSS.
3. **Graceful Fallback:** If the user has not configured an API key, or if a network request fails/times out, `generateFallbackNarrative()` generates a contextually accurate news story using deterministic templates. The game loop never stalls.

---

## Provider Architecture
Providers implement a stateless interface:
```javascript
export const geminiProvider = {
  generateNarrative: async (narrativeType, context) => { ... },
  checkStatus: () => ({ available: boolean, reason: string })
};
```

### Security & Credentials
- **No Hardcoded Keys:** Neither `geminiEngine.js` nor `openaiEngine.js` contains hardcoded API keys.
- **Runtime Injection:** Keys are read at runtime via:
  `window.__NULL_CONFIG.GEMINI_API_KEY` or `window.__NULL_CONFIG.OPENAI_API_KEY`.
- **Production Recommendation:** Use a secure backend proxy to keep credentials off the client machine.
