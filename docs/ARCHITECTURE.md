# NULL GAME — Architecture Guide

## System Overview
NULL is an intelligence-thriller psychological game built around a deterministic world simulation with safe, decoupled AI narrative orchestration. All game rules and state mutations are strictly owned by local deterministic engines; AI models act purely as narrative presentation providers and cannot modify or override simulation state.

```
[ User Interface (Screens) ]
       │
       ▼
[ Action Engine (Validation & Resolution) ]
       │
       ├─────────────────────────┬─────────────────────────┐
       ▼                         ▼                         ▼
[ Supernatural Engine ]    [ World Simulation ]      [ Event Engine ]
(Rules & Lifespan)         (Crime, Agencies, Vacuum) (Immutable History)
       │                         │                         │
       └─────────────────────────┼─────────────────────────┘
                                 ▼
                        [ Game State Engine ]
                         (Single Source of Truth)
                                 │
                                 ▼
                     [ Narrative Engine (Safe AI) ]
                                 │
                     ┌───────────┴───────────┐
                     ▼                       ▼
            [ Gemini Provider ]     [ Deterministic Fallback ]
```

---

## Module Responsibilities

### 1. `engine/gameState.js`
- **Role:** Authoritative state repository and lifecycle manager.
- **Save Version:** `2.0` (with migration path for v1 saves).
- **Core State:**
  - `crimeIndex`, `crimeCategories`: Quantitative foundation of global crime.
  - `indicators`: `publicFear`, `publicTrust`, `institutionalStability`, `playerExposure`.
  - `characters`, `factions`, `agencies`: Stateful entities.
  - `lifespanDays`: Player's remaining natural lifespan.
  - `eventLog`: Append-only immutable log of game events.
  - `seed`, `rngCallCount`: Deterministic random state tracked across reloads.
- **Rule:** Screens read from `gameState`, but never mutate it directly.

### 2. `engine/actionEngine.js`
- **Role:** Single point of entry for all state changes.
- **Supported Actions:** `LEDGER_ENTRY`, `WAIT`, `INVESTIGATE`, `PUBLIC_STATEMENT`, `SUPPORT_INVESTIGATION`.
- **Workflow:**
  1. Validates input parameters against supernatural and world rules.
  2. Executes supernatural consequences (lifespan deduction).
  3. Executes character death or nonlethal intervention.
  4. Generates agency evidence and tracks power vacuum surges.
  5. Advances world simulation by one turn.
  6. Checks victory and defeat conditions.
  7. Returns immutable `ActionResult` containing all created events.

### 3. `engine/worldSimulation.js`
- **Role:** Pure deterministic progression of the world.
- **Formula:**
  $$\text{Crime Index} = \sum (\text{Category Value} \times \text{Weight})$$
  *(where `institutionalCapacity` is inverted: higher capacity reduces crime contribution).*
- **Mechanics:**
  - Natural entropy: crime drifts upward without player intervention.
  - Power vacuums: killing a faction leader causes immediate chaos and violent surges during succession struggles.
  - Victory evaluation: Crime index $< 25.0\%$ maintained for 3 consecutive turns.
  - Defeat evaluation: Lifespan reaches 0 days or player exposure reaches $95\%$.

### 4. `engine/supernaturalEngine.js`
- **Role:** Manages the Ledger rules, Sight Bargain, and lifespan budget.
- **Rules:**
  - Writing requires True Legal Name, mental image, and valid cause of death (`cardiac`, `accident`, `publicCollapse`, `orchestrated`).
  - Cost: 3 to 14 days of lifespan per entry.
  - The Sight Bargain: permanently sacrifices $50\%$ of remaining lifespan to see all names and lifespans.
  - Challenge Mode: enforces an active 3-hour playtime budget with paused state tracking.

### 5. `engine/eventEngine.js`
- **Role:** Authoritative historical record of what occurred in the simulation.
- **Visibility Levels:** `PUBLIC`, `LEAKED`, `RESTRICTED`, `PRIVATE`, `UNKNOWN`.
- **Deduplication:** Prevents identical events from firing multiple times in the same turn.

### 6. `engine/narrativeEngine.js`
- **Role:** Orchestrates narrative generation from confirmed events.
- **Boundaries:** Builds restricted public context; AI cannot see private supernatural secrets.
- **Security:** Strict HTML escaping (`escapeHTML`) prevents DOM injection / XSS from untrusted AI outputs.
- **Fallback:** Seamlessly generates high-quality deterministic news bulletins if no API key is provided or if network calls fail.

### 7. Providers (`geminiEngine.js`, `openaiEngine.js`)
- **Role:** Stateless text generation providers.
- **Interface:** `generateNarrative(narrativeType, context)` and `checkStatus()`.
- **Zero Secrets:** Neither file contains hardcoded API keys; keys must be supplied at runtime via `window.__NULL_CONFIG` or secure backend proxy.

---

## Screen Architecture
- **Dashboard (`screens/dashboard.js`):** World status, Crime Index, Attribution Risk, Lifespan, Agency Suspicion bars, live news feed, and nonlethal turn advancement (`ADVANCE TURN`).
- **Ledger (`screens/notebook.js`):** Target dossier dropdown, manual legal name entry, target profile chips, cause selector, 2-second hold button, and ink-blot animation.
- **Agency Intel (`screens/intel.js`):** Threat levels, remits, specialties, suspicion meters, threshold tracking, and classified activity indicators.
- **The Watcher & Dossiers (`screens/companion.js`):** Spectral commune, Sight Bargain acceptance, and investigative dossier cards with `Investigate Target` and `Open In Ledger` triggers.
- **The Void (`screens/void.js`):** Existential archive, ending classification, compound memory stats across runs, immutable event log, and simulation reset.
