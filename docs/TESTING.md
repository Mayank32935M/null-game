# NULL GAME — Verification & Quality Assurance Report

## Test Execution Summary
The automated test suite in `tests/simulation.test.js` exercises all critical subsystems of the game:

```
========================================
--- SUITE 1: RNG & DETERMINISM ---
========================================
  ✓ mulberry32 seeded PRNG produces identical sequences for identical seeds
  ✓ mulberry32 produces values strictly in [0, 1)

========================================
--- SUITE 2: GAME STATE & PERSISTENCE ---
========================================
  ✓ New-game initialization creates valid state with baseline values
  ✓ State save and load round-trip preserves state fields and version
  ✓ State reset completely cleans up and generates fresh state

========================================
--- SUITE 3: SUPERNATURAL ARTEFACT RULES ---
========================================
  ✓ validateLedgerEntry rejects empty names and invalid causes
  ✓ validateLedgerEntry rejects already dead targets
  ✓ processLedgerEntry deducts lifespan within documented bounds (3 to 14 days)
  ✓ acceptSightBargain cuts lifespan by exactly 50% and grants sight

========================================
--- SUITE 4: DETERMINISTIC WORLD SIMULATION ---
========================================
  ✓ computeCrimeIndex stays strictly in [0, 100]
  ✓ Eliminating faction leader Victor Crane triggers power vacuum and chaos surge
  ✓ Natural crime drift increases crime over time without intervention
  ✓ Nonlethal actions (supportInvestigation) increase institutional capacity
  ✓ Victory condition requires crimeIndex < 25 for 3 consecutive turns
  ✓ Defeat conditions trigger when lifespan <= 0 or exposure >= 95

========================================
--- SUITE 5: ACTIONS & AGENCIES ---
========================================
  ✓ resolveAction coordinates ledger kill, advances world, and escalates agency
  ✓ Agency summary and threat levels compute properly

========================================
--- SUITE 6: NARRATIVE ENGINE & FALLBACKS ---
========================================
  ✓ generateFallbackNarrative generates news without AI and contains no forbidden terms
  ✓ escapeHTML prevents script injection
  ✓ requestNarrative cleanly falls back when provider has no API key

========================================
TOTAL TESTS: 20
PASSED: 20
FAILED: 0
========================================
```

---

## Browser Verification
A full automated session was conducted in Antigravity Browser against `http://localhost:8080/index.html`:
- **Console Errors:** None. Zero errors, zero warnings.
- **Turn Progression:** Clicking `ADVANCE TURN` advances state cleanly.
- **The Ledger:** Target selection populates legal names, causes display risk tiers, and writing initiates the 2-second hold confirmation.
- **Agency Intel Board:** Real-time suspicion meters, stages, and activity logs render for The Directorate, Meridian, and Panoptic.
- **The Watcher & Dossiers:** All 10 tracked character dossiers render with interactive `Investigate` and `Open in Ledger` buttons; Sight Bargain displays exact lifespan sacrifice.
- **The Void:** Event ledger, run profiles, ending evaluations, and simulation reset tested.
