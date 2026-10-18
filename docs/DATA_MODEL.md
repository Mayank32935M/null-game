# NULL GAME — Data Model Specification

## Save Schema Version: `2.0`

### Top-Level State Object
```typescript
interface GameState {
  // Metadata & Seeded PRNG
  saveVersion: '2.0';
  seed: number;
  rngCallCount: number;
  turn: number;
  createdAt: number;
  lastSavedAt: number | null;

  // Quantitative Crime Index
  crimeIndex: number; // 0.0 to 100.0 (baseline: 100.0)
  crimeCategories: {
    violent: number;              // 0 to 200 (baseline: 100)
    organised: number;            // 0 to 200 (baseline: 100)
    corruption: number;           // 0 to 200 (baseline: 100)
    exploitation: number;         // 0 to 200 (baseline: 100)
    institutionalCapacity: number;// 0 to 200 (baseline: 100, inverted)
  };
  crimeIndexHistory: number[];    // Tracks consecutive turns for victory check

  // Societal Indicators
  indicators: {
    publicFear: number;           // 0 to 100 (baseline: 5)
    publicTrust: number;          // 0 to 100 (baseline: 60)
    institutionalStability: number;// 0 to 100 (baseline: 65)
    organisedCrimeInfluence: number;// 0 to 100 (baseline: 40)
    playerExposure: number;       // 0 to 100 (baseline: 0)
  };

  // Stateful World Entities
  characters: Record<string, Character>;
  factions: Record<string, Faction>;
  activePowerVacuums: PowerVacuum[];
  agencies: Record<string, Agency>;

  // Supernatural State
  lifespanDays: number;           // Defaults to 9847 (~27 years)
  totalLedgerEntries: number;
  entriesByCause: Record<string, number>;
  sightBargainAccepted: boolean;
  canSeeNames: boolean;
  canSeeLifespans: boolean;

  // Challenge Mode State
  challengeMode: boolean;
  challengeTimer: {
    totalSeconds: number;         // 10800 (3 hours)
    elapsedSeconds: number;
    isRunning: boolean;
    lastResumedAt: number | null;
  } | null;

  // Event & News Feeds
  eventLog: GameEvent[];          // Immutable log of simulation events
  newsFeed: NewsItem[];           // Articles displayed on dashboard

  // Cross-run Compound Memory
  runNumber: number;
  compoundMemoryEnabled: boolean;

  // Backward compatibility mirrors
  agencySuspicion: Record<string, number>;
  agencyStatus: Record<string, string>;
}
```

---

### Entity Schemas

#### Character
```typescript
interface Character {
  id: string;
  name: string;
  role: string;
  factionId: string | null;
  targetType: 'syndicate_leader' | 'corrupt_official' | 'enforcer' | 'financier' | 'trafficker' | 'petty_criminal';
  description: string;
  isPublicFigure: boolean;
  isAlive: boolean;
  deathTurn?: number;
  crimeImpact: {
    violent: number;
    organised: number;
    corruption: number;
    exploitation: number;
  };
  deathConsequences: {
    powerVacuum: boolean;
    factionStability?: number;
    retaliationChance?: number;
    publicFearDelta?: number;
    publicTrustDelta?: number;
    institutionalStabilityDelta?: number;
  };
  evidence: string[];
}
```

#### Agency
```typescript
interface Agency {
  id: string;
  name: string;
  fullName: string;
  icon: string;
  color: string;
  jurisdiction: string;
  specialty: string;
  resources: number;
  stages: ('DORMANT' | 'AWARE' | 'INVESTIGATING' | 'PURSUING' | 'CONVERGING')[];
  currentStage: 'DORMANT' | 'AWARE' | 'INVESTIGATING' | 'PURSUING' | 'CONVERGING';
  investigationIntensity: number; // 0 to 100
  evidenceCount: number;
  hypotheses: string[];
  knownEvidence: string[];
}
```

#### GameEvent
```typescript
interface GameEvent {
  id: string;                    // e.g. "evt_42"
  type: string;                  // LEDGER_ENTRY, DEATH, POWER_VACUUM, etc.
  description: string;
  visibility: 'PUBLIC' | 'LEAKED' | 'RESTRICTED' | 'PRIVATE' | 'UNKNOWN';
  turn: number;
  timestamp: number;
  data: Record<string, any>;
  characterIds?: string[];
  factionIds?: string[];
  agencyIds?: string[];
  causedBy?: string | null;
}
```
