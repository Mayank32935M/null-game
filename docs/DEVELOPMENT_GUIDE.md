# NULL GAME — Developer Guide

## Getting Started

### 1. Prerequisites
- [Node.js](https://nodejs.org/) (v18 or higher recommended).
- A modern web browser supporting ES6 Modules.

### 2. Running Locally
Because NULL uses standard ES6 modules, it requires a local web server (loading directly via `file://` protocol is blocked by browser CORS security policies).

Start a local server using Python or Node:
```bash
# Using Python
python -m http.server 8080

# Or using Node http-server / npx
npx http-server -p 8080
```
Then navigate to:
```
http://localhost:8080/index.html
```

### 3. Configuring AI Narrative Generation (Optional)
The game runs 100% offline using deterministic fallback narrative templates. To enable live dynamic narrative generation with Google Gemini or OpenAI:
1. Open the browser developer console on `http://localhost:8080/index.html`.
2. Configure your API key in memory:
```javascript
window.__NULL_CONFIG = {
  GEMINI_API_KEY: 'your-gemini-api-key-here'
};
```
*Note: Never commit API keys to version control.*

### 4. Running the Test Suite
The repository includes an automated test suite verifying state initialization, determinism, simulation formulas, power vacuums, agency escalation, and narrative fallbacks.
```bash
node tests/simulation.test.js
```

---

## Extending the Game

### Adding a New Character
Open `data/universe.js` and add an entry to the `CHARACTERS` object:
```javascript
newTargetId: {
  id: 'newTargetId',
  name: 'Marcus Bell',
  role: 'Port Authority Executive',
  factionId: 'ironCircle',
  targetType: 'corrupt_official',
  description: 'Controls customs inspections along the southern maritime docks.',
  isPublicFigure: true,
  isAlive: true,
  crimeImpact: {
    violent: 0,
    organised: -4,
    corruption: -8,
    exploitation: -6,
  },
  deathConsequences: {
    powerVacuum: false,
    retaliationChance: 0.1,
    publicFearDelta: 2,
    publicTrustDelta: 4,
    institutionalStabilityDelta: -3,
  },
  knownBy: ['ironCircle'],
  publiclyKnown: true,
  evidence: [],
}
```

### Adding a New Faction
In `data/universe.js`, add an entry to `FACTIONS`:
```javascript
newFaction: {
  id: 'newFaction',
  name: 'The Harbor Cartel',
  type: 'organised_crime',
  description: 'Maritime smuggling network controlling container docks.',
  influence: 30,
  stability: 65,
  crimeContribution: { violent: 8, organised: 25, corruption: 12, exploitation: 18 },
  leaderId: 'marcusBell',
  memberIds: ['marcusBell'],
  rivalFactionIds: ['crescentSyndicate'],
  agencyAwareness: 50,
}
```

### Adding a New Cause of Death
In `data/universe.js`, add an entry to `LEDGER_RULES.causes`:
```javascript
toxicology: {
  key: 'toxicology',
  name: 'Undetectable Toxin',
  icon: '🧪',
  description: 'A biological agent simulating rapid organ failure.',
  riskLevel: 'low',
  riskLabel: 'Low Risk',
  suspicionMultiplier: 0.7,
  publicFearMultiplier: 0.4,
}
```
Then add corresponding display metadata in `screens/notebook.js` `KILL_METHODS`.
