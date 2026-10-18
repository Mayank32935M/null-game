// ============================================================================
// NULL — Universe Data
// Original intellectual property — all characters, factions, agencies,
// supernatural rules, and lore are original creations.
//
// THE LEDGER: A supernatural artefact that manifests as an ancient bound
// journal. When the bearer writes a person's true legal name while holding
// a clear mental image of their face, and specifies a cause of death,
// that person dies under the stated conditions within 40 seconds (if no
// time is specified) or at the specified time (up to 23 days).
//
// THE WATCHER: A spectral entity bound to the Ledger. Not a guide, not a
// friend — an observer. It follows the bearer, occasionally comments,
// and offers the Sight Bargain.
// ============================================================================

// ---------------------------------------------------------------------------
// Supernatural Rules — The Ledger
// ---------------------------------------------------------------------------

export const LEDGER_RULES = {
  name: 'The Ledger',
  entityName: 'The Watcher',

  // Core requirements for a valid entry
  requirements: {
    trueLegalName: true,       // Must know the target's real legal name
    mentalImage: true,         // Must have seen the target's face
    causeOfDeath: true,        // Must specify a cause of death
  },

  // Timing rules
  timing: {
    defaultDeathSeconds: 40,       // If no time specified, death in 40 seconds
    maxFutureHours: 552,           // 23 days maximum delay
    minFutureSeconds: 40,          // Cannot specify less than 40 seconds
  },

  // Cause of death categories and their risk profiles
  causes: {
    cardiac: {
      key: 'cardiac',
      name: 'Cardiac Arrest',
      icon: '♡',
      description: 'The heart stops without warning. Clean. Nearly untraceable.',
      riskLevel: 'low',
      riskLabel: 'Low Risk',
      suspicionMultiplier: 0.6,
      publicFearMultiplier: 0.3,
    },
    accident: {
      key: 'accident',
      name: 'Accident',
      icon: '⚡',
      description: 'An unfortunate incident. Plausible if not overused.',
      riskLevel: 'medium',
      riskLabel: 'Medium Risk',
      suspicionMultiplier: 1.0,
      publicFearMultiplier: 0.6,
    },
    publicCollapse: {
      key: 'publicCollapse',
      name: 'Public Collapse',
      icon: '◉',
      description: 'Visible to witnesses. Unmistakable. The city will remember.',
      riskLevel: 'high',
      riskLabel: 'High Risk',
      suspicionMultiplier: 1.8,
      publicFearMultiplier: 1.5,
    },
    orchestrated: {
      key: 'orchestrated',
      name: 'Orchestrated',
      icon: '◈',
      description: 'Others carry it out, believing it their own decision. Threads remain.',
      riskLevel: 'medium',
      riskLabel: 'Medium Risk',
      suspicionMultiplier: 0.8,
      publicFearMultiplier: 0.8,
    },
  },

  // Failure conditions — when a Ledger entry does NOT work
  failureConditions: [
    'Name is not the target\'s true legal name',
    'Bearer has never seen the target\'s face',
    'Cause of death is physically impossible for the target',
    'Target is already dead',
    'Bearer specifies a time in the past',
  ],

  // Lifespan cost per entry (in days, subtracted from bearer's natural lifespan)
  lifespanCostPerEntry: {
    min: 3,    // minimum days lost per Ledger use
    max: 14,   // maximum days lost per Ledger use
    // Actual cost is determined by seeded RNG within these bounds
  },
};

// ---------------------------------------------------------------------------
// The Sight Bargain — lifespan-sacrifice ability
// ---------------------------------------------------------------------------

export const SIGHT_BARGAIN = {
  name: 'The Sight Bargain',
  description:
    'The Watcher offers to grant the bearer the ability to see any person\'s ' +
    'true legal name and remaining lifespan by looking at their face. ' +
    'The cost is exactly half of the bearer\'s remaining natural lifespan. ' +
    'This deal is permanent and irreversible.',

  // Cost: exactly 50% of remaining lifespan, applied immediately
  lifespanCostFraction: 0.5,

  // What the bearer gains
  grants: {
    seeNames: true,      // See true legal name above anyone's head
    seeLifespan: true,   // See remaining lifespan above anyone's head
  },

  // Gameplay effect: removes identity verification requirement
  // Target names are auto-confirmed, reducing investigation needed
  removesNameVerification: true,

  // Timer: once the bargain is struck, a 3-hour active playtime timer begins
  // This represents the narrative cost — the Watcher's attention intensifies
  challengeTimerSeconds: 3 * 60 * 60, // 10800 seconds = 3 hours
};

// ---------------------------------------------------------------------------
// Crime Categories — used in the global crime index
// ---------------------------------------------------------------------------

export const CRIME_CATEGORIES = {
  violent: {
    key: 'violent',
    name: 'Violent Crime',
    weight: 0.30,    // 30% of global index
    baseline: 100,
    min: 0,
    max: 200,
  },
  organised: {
    key: 'organised',
    name: 'Organised Crime',
    weight: 0.25,    // 25% of global index
    baseline: 100,
    min: 0,
    max: 200,
  },
  corruption: {
    key: 'corruption',
    name: 'Corruption',
    weight: 0.20,    // 20% of global index
    baseline: 100,
    min: 0,
    max: 200,
  },
  exploitation: {
    key: 'exploitation',
    name: 'Exploitation & Financial Crime',
    weight: 0.15,    // 15% of global index
    baseline: 100,
    min: 0,
    max: 200,
  },
  institutionalCapacity: {
    key: 'institutionalCapacity',
    name: 'Institutional Capacity',
    weight: 0.10,    // 10% — this is inverted: higher capacity = lower crime
    baseline: 100,
    min: 0,
    max: 200,
    inverted: true,  // Higher value = LOWER crime contribution
  },
};

// ---------------------------------------------------------------------------
// World Indicators — tracked separately from crime index
// ---------------------------------------------------------------------------

export const INDICATORS = {
  publicTrust: {
    key: 'publicTrust',
    name: 'Public Trust',
    description: 'How much the general public trusts government and institutions.',
    min: 0, max: 100, baseline: 55,
  },
  publicFear: {
    key: 'publicFear',
    name: 'Public Fear',
    description: 'How frightened the public is of the unexplained deaths.',
    min: 0, max: 100, baseline: 5,
  },
  institutionalStability: {
    key: 'institutionalStability',
    name: 'Institutional Stability',
    description: 'How stable government institutions are. Low stability = chaos.',
    min: 0, max: 100, baseline: 65,
  },
  organisedCrimeInfluence: {
    key: 'organisedCrimeInfluence',
    name: 'Organised Crime Influence',
    description: 'Overall power of criminal networks in society.',
    min: 0, max: 100, baseline: 40,
  },
  playerExposure: {
    key: 'playerExposure',
    name: 'Attribution Risk',
    description: 'How close the world is to identifying the Ledger bearer.',
    min: 0, max: 100, baseline: 0,
  },
};

// ---------------------------------------------------------------------------
// Factions — criminal organisations and power structures
// ---------------------------------------------------------------------------

export const FACTIONS = {
  crescentSyndicate: {
    id: 'crescentSyndicate',
    name: 'The Crescent Syndicate',
    type: 'organised_crime',
    description: 'A sprawling organised crime network dealing in narcotics, extortion, and political manipulation. Led by Victor Crane.',
    influence: 35,         // 0-100 scale
    stability: 70,
    crimeContribution: {   // How much this faction contributes to each crime category
      violent: 15,
      organised: 30,
      corruption: 10,
      exploitation: 15,
    },
    leaderId: 'victorCrane',
    memberIds: ['victorCrane', 'nadiaMehra', 'tomaszKovic'],
    rivalFactionIds: ['ironCircle'],
    agencyAwareness: 60,   // How aware agencies are of this faction
  },
  ironCircle: {
    id: 'ironCircle',
    name: 'The Iron Circle',
    type: 'corruption_network',
    description: 'A network of corrupt officials, judges, and corporate executives who protect each other and control policy for profit.',
    influence: 45,
    stability: 80,
    crimeContribution: {
      violent: 5,
      organised: 10,
      corruption: 35,
      exploitation: 25,
    },
    leaderId: 'senatorHalden',
    memberIds: ['senatorHalden', 'judgeOkafor', 'priyaMishra'],
    rivalFactionIds: ['crescentSyndicate'],
    agencyAwareness: 30,   // Well-hidden
  },
  ashNetwork: {
    id: 'ashNetwork',
    name: 'Ash Network',
    type: 'trafficking',
    description: 'A decentralised trafficking operation running human exploitation and illicit financial schemes across borders.',
    influence: 25,
    stability: 50,
    crimeContribution: {
      violent: 10,
      organised: 15,
      corruption: 5,
      exploitation: 30,
    },
    leaderId: 'elenaVoss',
    memberIds: ['elenaVoss', 'kaiNakamura'],
    rivalFactionIds: [],
    agencyAwareness: 45,
  },
};

// ---------------------------------------------------------------------------
// Characters — people the player can investigate and interact with
// ---------------------------------------------------------------------------

export const CHARACTERS = {
  // --- Faction leaders ---
  victorCrane: {
    id: 'victorCrane',
    name: 'Victor Crane',
    role: 'Crime Lord',
    factionId: 'crescentSyndicate',
    targetType: 'syndicate_leader',
    description: 'The calculating head of the Crescent Syndicate. Controls narcotics distribution across three regions.',
    isPublicFigure: false,
    isAlive: true,
    crimeImpact: {  // What happens to crime categories if this character dies
      violent: 0,   // Violence surges via power vacuum gang war rather than dropping immediately
      organised: -15,
      corruption: -4,
      exploitation: -5,
    },
    deathConsequences: {
      powerVacuum: true,
      factionStability: -40,
      retaliationChance: 0.6,
      publicFearDelta: 8,
      publicTrustDelta: 3,
    },
    knownBy: ['crescentSyndicate'],
    publiclyKnown: false,
    evidence: [],
  },
  senatorHalden: {
    id: 'senatorHalden',
    name: 'Marcus Halden',
    role: 'Senator',
    factionId: 'ironCircle',
    targetType: 'corrupt_official',
    description: 'Senior senator secretly coordinating the Iron Circle. Publicly respected, privately corrupt.',
    isPublicFigure: true,
    isAlive: true,
    crimeImpact: {
      violent: -2,
      organised: -5,
      corruption: -15,
      exploitation: -8,
    },
    deathConsequences: {
      powerVacuum: true,
      factionStability: -30,
      retaliationChance: 0.3,
      publicFearDelta: 12,
      publicTrustDelta: -5,    // Public figure dying raises questions
      institutionalStabilityDelta: -10,
    },
    knownBy: ['ironCircle'],
    publiclyKnown: true,
    evidence: [],
  },
  elenaVoss: {
    id: 'elenaVoss',
    name: 'Elena Voss',
    role: 'Network Coordinator',
    factionId: 'ashNetwork',
    targetType: 'syndicate_leader',
    description: 'Runs the Ash Network\'s operations from multiple fronts. Expert at disappearing.',
    isPublicFigure: false,
    isAlive: true,
    crimeImpact: {
      violent: -5,
      organised: -8,
      corruption: -2,
      exploitation: -15,
    },
    deathConsequences: {
      powerVacuum: true,
      factionStability: -50, // Decentralised network is fragile at the top
      retaliationChance: 0.2,
      publicFearDelta: 3,
      publicTrustDelta: 2,
    },
    knownBy: ['ashNetwork'],
    publiclyKnown: false,
    evidence: [],
  },
  // --- Faction members ---
  nadiaMehra: {
    id: 'nadiaMehra',
    name: 'Nadia Mehra',
    role: 'Enforcer',
    factionId: 'crescentSyndicate',
    targetType: 'enforcer',
    description: 'The Crescent Syndicate\'s primary enforcer. Handles debt collection and territorial disputes with calculated violence.',
    isPublicFigure: false,
    isAlive: true,
    crimeImpact: { violent: -6, organised: -4, corruption: 0, exploitation: -2 },
    deathConsequences: {
      powerVacuum: false,
      factionStability: -10,
      retaliationChance: 0.4,
      publicFearDelta: 4,
      publicTrustDelta: 1,
    },
    knownBy: ['crescentSyndicate'],
    publiclyKnown: false,
    evidence: [],
  },
  tomaszKovic: {
    id: 'tomaszKovic',
    name: 'Tomasz Kovic',
    role: 'Money Launderer',
    factionId: 'crescentSyndicate',
    targetType: 'financier',
    description: 'Financial architect for the Crescent Syndicate. Launders money through a network of shell companies.',
    isPublicFigure: false,
    isAlive: true,
    crimeImpact: { violent: 0, organised: -6, corruption: -4, exploitation: -8 },
    deathConsequences: {
      powerVacuum: false,
      factionStability: -15,
      retaliationChance: 0.2,
      publicFearDelta: 2,
      publicTrustDelta: 1,
    },
    knownBy: ['crescentSyndicate'],
    publiclyKnown: false,
    evidence: [],
  },
  judgeOkafor: {
    id: 'judgeOkafor',
    name: 'Justice Adele Okafor',
    role: 'Corrupt Judge',
    factionId: 'ironCircle',
    targetType: 'corrupt_official',
    description: 'A high court judge who routinely dismisses cases against Iron Circle members in exchange for substantial payments.',
    isPublicFigure: true,
    isAlive: true,
    crimeImpact: { violent: -1, organised: -3, corruption: -10, exploitation: -5 },
    deathConsequences: {
      powerVacuum: false,
      factionStability: -15,
      retaliationChance: 0.15,
      publicFearDelta: 10,
      publicTrustDelta: -8,   // Judge dying is very disturbing to public
      institutionalStabilityDelta: -12,
    },
    knownBy: ['ironCircle'],
    publiclyKnown: true,
    evidence: [],
  },
  priyaMishra: {
    id: 'priyaMishra',
    name: 'Priya Mishra',
    role: 'Corporate Lobbyist',
    factionId: 'ironCircle',
    targetType: 'corrupt_official',
    description: 'Facilitates bribery between corporations and officials. The Iron Circle\'s interface with the private sector.',
    isPublicFigure: true,
    isAlive: true,
    crimeImpact: { violent: 0, organised: -2, corruption: -8, exploitation: -6 },
    deathConsequences: {
      powerVacuum: false,
      factionStability: -10,
      retaliationChance: 0.1,
      publicFearDelta: 6,
      publicTrustDelta: -3,
    },
    knownBy: ['ironCircle'],
    publiclyKnown: true,
    evidence: [],
  },
  kaiNakamura: {
    id: 'kaiNakamura',
    name: 'Kai Nakamura',
    role: 'Logistics Coordinator',
    factionId: 'ashNetwork',
    targetType: 'trafficker',
    description: 'Coordinates the Ash Network\'s cross-border operations. Has contacts in multiple countries.',
    isPublicFigure: false,
    isAlive: true,
    crimeImpact: { violent: -3, organised: -5, corruption: -1, exploitation: -10 },
    deathConsequences: {
      powerVacuum: false,
      factionStability: -20,
      retaliationChance: 0.3,
      publicFearDelta: 2,
      publicTrustDelta: 1,
    },
    knownBy: ['ashNetwork'],
    publiclyKnown: false,
    evidence: [],
  },
  // --- Independent criminals ---
  rodrigoSilva: {
    id: 'rodrigoSilva',
    name: 'Rodrigo Silva',
    role: 'Serial Offender',
    factionId: null,
    targetType: 'petty_criminal',
    description: 'A repeat violent offender with multiple assault convictions. Currently out on parole.',
    isPublicFigure: false,
    isAlive: true,
    crimeImpact: { violent: -2, organised: 0, corruption: 0, exploitation: 0 },
    deathConsequences: {
      powerVacuum: false,
      factionStability: 0,
      retaliationChance: 0.05,
      publicFearDelta: 2,
      publicTrustDelta: 1,
    },
    knownBy: [],
    publiclyKnown: false,
    evidence: [],
  },
  denisMartov: {
    id: 'denisMartov',
    name: 'Denis Martov',
    role: 'Drug Dealer',
    factionId: null,
    targetType: 'petty_criminal',
    description: 'Street-level dealer operating in the Southgate district. Small-time but persistent.',
    isPublicFigure: false,
    isAlive: true,
    crimeImpact: { violent: -1, organised: -1, corruption: 0, exploitation: -1 },
    deathConsequences: {
      powerVacuum: false,
      factionStability: 0,
      retaliationChance: 0.02,
      publicFearDelta: 1,
      publicTrustDelta: 0,
    },
    knownBy: [],
    publiclyKnown: false,
    evidence: [],
  },
};

// ---------------------------------------------------------------------------
// Investigative Agencies
// ---------------------------------------------------------------------------

export const AGENCIES = {
  directorate: {
    id: 'directorate',
    name: 'The Directorate',
    fullName: 'National Directorate of Criminal Intelligence',
    icon: '⬡',
    color: '#4a7aac',
    jurisdiction: 'Federal criminal investigation. Pattern analysis and forensic linkage.',
    specialty: 'Death pattern correlation and statistical anomaly detection',
    resources: 70,
    // Investigation stages (evidence-driven, not one-way escalation)
    stages: ['DORMANT', 'AWARE', 'INVESTIGATING', 'PURSUING', 'CONVERGING'],
  },
  meridian: {
    id: 'meridian',
    name: 'Meridian',
    fullName: 'Meridian Security Bureau',
    icon: '◬',
    color: '#c46030',
    jurisdiction: 'External intelligence and covert operations. Shadow surveillance.',
    specialty: 'Covert surveillance networks and signal intelligence',
    resources: 85,
    stages: ['DORMANT', 'AWARE', 'INVESTIGATING', 'PURSUING', 'CONVERGING'],
  },
  panoptic: {
    id: 'panoptic',
    name: 'Panoptic',
    fullName: 'Panoptic Analysis Group',
    icon: '◎',
    color: '#7a5aac',
    jurisdiction: 'Domestic intelligence and mass communication monitoring.',
    specialty: 'Social media analysis and public communication intercept',
    resources: 60,
    stages: ['DORMANT', 'AWARE', 'INVESTIGATING', 'PURSUING', 'CONVERGING'],
  },
};

// ---------------------------------------------------------------------------
// Agency investigation stage descriptions
// ---------------------------------------------------------------------------

export const AGENCY_STAGE_INFO = {
  DORMANT: {
    label: 'Dormant',
    description: 'No active investigation. Death patterns not yet flagged.',
    intensityRange: [0, 15],
  },
  AWARE: {
    label: 'Aware',
    description: 'Statistical anomaly flagged. Passive data collection initiated.',
    intensityRange: [15, 40],
  },
  INVESTIGATING: {
    label: 'Investigating',
    description: 'Active investigation. Resources allocated. Evidence being gathered.',
    intensityRange: [40, 65],
  },
  PURSUING: {
    label: 'Pursuing',
    description: 'Suspect profile constructed. Field operations deployed.',
    intensityRange: [65, 85],
  },
  CONVERGING: {
    label: 'Converging',
    description: 'Near-certain identification. Imminent confrontation likely.',
    intensityRange: [85, 100],
  },
};

// ---------------------------------------------------------------------------
// Media Sources — for AI-generated and fallback news
// ---------------------------------------------------------------------------

export const MEDIA_SOURCES = [
  { name: 'The Meridian Post', type: 'broadsheet', bias: 'centrist' },
  { name: 'Capital Wire', type: 'wire_service', bias: 'neutral' },
  { name: 'The Evening Standard', type: 'tabloid', bias: 'sensationalist' },
  { name: 'Republic News Network', type: 'broadcast', bias: 'establishment' },
  { name: 'The Independent Lens', type: 'investigative', bias: 'progressive' },
  { name: 'Signal Report', type: 'digital', bias: 'analytical' },
];

// ---------------------------------------------------------------------------
// Endings
// ---------------------------------------------------------------------------

export const ENDINGS = {
  quietReformer: {
    id: 'quietReformer',
    name: 'The Quiet Reformer',
    description: 'Crime fell below 25 through measured action. Institutions strengthened. Fear remained low. The bearer chose restraint.',
    conditions: {
      crimeBelow25: true,
      publicFearBelow: 30,
      publicTrustAbove: 50,
      playerExposureBelow: 40,
    },
  },
  fearfulOrder: {
    id: 'fearfulOrder',
    name: 'Fearful Order',
    description: 'Crime fell below 25, but the world lives in terror. Order through fear, not trust.',
    conditions: {
      crimeBelow25: true,
      publicFearAbove: 60,
    },
  },
  unstableVictory: {
    id: 'unstableVictory',
    name: 'Unstable Victory',
    description: 'Crime fell below 25, but institutions are shattered. The peace is fragile.',
    conditions: {
      crimeBelow25: true,
      institutionalStabilityBelow: 30,
    },
  },
  exposed: {
    id: 'exposed',
    name: 'Exposed',
    description: 'The agencies identified the bearer. The Ledger\'s secret is revealed to the world.',
    conditions: {
      playerExposureAbove: 95,
    },
  },
  consumed: {
    id: 'consumed',
    name: 'Consumed',
    description: 'The bearer\'s lifespan reached zero. The Ledger claims its final price.',
    conditions: {
      lifespanZero: true,
    },
  },
  stalemate: {
    id: 'stalemate',
    name: 'Stalemate',
    description: 'Crime never fell below 25. The Ledger changed the world, but not enough.',
    conditions: {
      crimeAbove25: true,
    },
  },
};

// ---------------------------------------------------------------------------
// Simulation Parameters
// ---------------------------------------------------------------------------

export const SIM_PARAMS = {
  // Crime index
  crimeIndexBaseline: 100,
  crimeIndexVictoryThreshold: 25,
  victoryStabilityTurns: 3,    // Must remain below 25 for 3 consecutive turns

  // Natural drift rates per turn
  naturalCrimeDrift: 0.5,       // Crime drifts up slightly each turn (entropy)
  naturalFearDecay: -2,         // Fear decays slowly toward baseline
  naturalTrustRecovery: 1,      // Trust recovers slowly if nothing bad happens

  // Power vacuum effects
  powerVacuumCrimeSurge: { violent: 20, organised: 10, corruption: 3, exploitation: 5 },
  powerVacuumDuration: 3,       // Turns before vacuum stabilises

  // Agency investigation thresholds
  agencyEscalationThreshold: 20,  // Evidence points needed to escalate
  agencyDeescalationRate: 2,      // Points of investigation intensity lost per quiet turn

  // Lifespan
  defaultLifespanDays: 9847,      // ~27 years remaining

  // Turn budget
  maxTurns: 100,                  // Soft limit for game length

  // Timed challenge mode
  challengeTimerSeconds: 10800,   // 3 hours
};

// ---------------------------------------------------------------------------
// Narrative Fallback Templates
// These are used when AI is unavailable. They provide basic narrative
// without AI generation. Templates use {placeholder} substitution.
// ---------------------------------------------------------------------------

export const FALLBACK_TEMPLATES = {
  newsHeadline: {
    cardiac: [
      'Prominent figure {targetName} found dead of apparent cardiac arrest',
      '{targetName} dies suddenly; authorities note cardiac failure',
      'Unexplained cardiac death of {targetName} adds to growing pattern',
    ],
    accident: [
      '{targetName} killed in what police describe as a tragic accident',
      'Fatal accident claims life of {targetName}',
      'Authorities investigating death of {targetName} in apparent accident',
    ],
    publicCollapse: [
      'BREAKING: {targetName} collapses in public, pronounced dead at scene',
      'Witnesses shocked as {targetName} dies in full public view',
      '{targetName} dead after dramatic public collapse',
    ],
    orchestrated: [
      '{targetName} found dead in circumstances under investigation',
      'Death of {targetName} raises questions; police open inquiry',
      'Authorities probe suspicious death of {targetName}',
    ],
  },
  newsDetail: {
    generic: [
      'Authorities have confirmed the death but have not yet released details pending investigation.',
      'The incident occurred earlier today. Police are treating the death as unexplained pending autopsy results.',
      'Officials say they are not ruling out foul play at this stage. An investigation has been opened.',
    ],
  },
  watcherLine: [
    'Another name. The page doesn\'t judge.',
    'The ink dries faster than you\'d expect.',
    'Forty seconds is not a long time.',
    'You hesitated less this time.',
    'The Ledger remembers every name. Do you?',
    'Interesting choice. But then, they all are.',
    'The page turns. The world continues.',
    'Names have weight. This one had some.',
  ],
  agencyPublicMove: {
    DORMANT: null,
    AWARE: [
      'Statistical analysis unit flags anomalous death cluster for review.',
      'Internal memo circulated noting unusual mortality patterns.',
    ],
    INVESTIGATING: [
      'Agency spokesperson confirms active investigation into unexplained deaths.',
      'Task force established to investigate pattern of suspicious deaths.',
    ],
    PURSUING: [
      'Agencies release partial suspect profile based on death pattern analysis.',
      'Joint operation announced targeting suspected death conspiracy.',
    ],
    CONVERGING: [
      'BREAKING: Agencies close in on suspect in serial death investigation.',
      'Arrest warrant expected imminently in death pattern case.',
    ],
  },
};
