// ============================================================================
// NULL — Intel Board Screen
// GDD Section 5.2 — Screen 3: Agency Intel Board
// GDD Section 2.4 — Agency Intel System
//
// Responsibility:
//   Renders the three-column Intel Board showing each agency's status,
//   suspicion meter, jurisdiction details, latest public move, and the
//   classified activity indicator. Wired to live gameState data.
//   Updates automatically after every kill via the null:kill-complete event.
// ============================================================================

import {
  updateAllAgencyStatuses,
  getAgencyIntelSummary,
  getOverallThreatLevel,
  hasClassifiedActivity,
  getClassifiedTimeline,
  AGENCY_PROFILES,
} from '../engine/agencyEngine.js';

import {
  getGameState,
} from '../engine/gameState.js';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function el(id) {
  return document.getElementById(id);
}

/**
 * Returns a suspicion bar intensity class based on percent.
 */
function getIntensity(percent) {
  if (percent >= 75) return 'critical';
  if (percent >= 50) return 'high';
  if (percent >= 25) return 'medium';
  return 'low';
}

/**
 * Maps an agency profile color key to one of the CSS data-color values.
 */
function getColorKey(hexColor) {
  if (!hexColor) return 'blue';
  if (hexColor.includes('c460') || hexColor.includes('orange')) return 'orange';
  if (hexColor.includes('7a5a') || hexColor.includes('purple')) return 'purple';
  return 'blue';
}

/**
 * Returns a CSS danger class for the card based on status.
 */
function getCardDangerClass(status) {
  if (status === 'CLOSING_IN') return 'agency-card--closing-in';
  if (status === 'HUNTING') return 'agency-card--hunting';
  return '';
}

/**
 * Performs rAF-rAF to animate bar fill after DOM paint.
 */
function animateBarFill(barEl, targetWidth) {
  requestAnimationFrame(() => {
    requestAnimationFrame(() => {
      if (barEl) barEl.style.width = `${targetWidth}%`;
    });
  });
}

// ---------------------------------------------------------------------------
// HTML Template
// ---------------------------------------------------------------------------

function buildIntelHTML() {
  return `
  <main id="intel-screen" class="intel-screen hidden screen" aria-label="Agency Intel Board">

    <!-- Top Bar -->
    <header class="intel__topbar">
      <button id="intel-back-btn" class="intel__back-btn" aria-label="Return to dashboard">
        ← Dashboard
      </button>
      <h1 class="intel__title" aria-label="Agency Intel">INTEL</h1>
      <div id="intel-threat-badge" class="intel__threat-badge intel__threat-badge--NONE"
           aria-live="polite" aria-label="Overall threat level">
        <span class="intel__threat-dot" aria-hidden="true"></span>
        <span id="intel-threat-label">No Threat</span>
      </div>
    </header>

    <!-- Status Row — classified indicator -->
    <div class="intel__status-row">
      <div id="classified-indicator"
           class="classified-indicator classified-indicator--inactive"
           aria-live="polite" aria-label="Classified activity status">
        <span class="classified-dot" aria-hidden="true"></span>
        <span id="classified-label">No Classified Activity</span>
      </div>
    </div>

    <!-- Three-column agency grid -->
    <div class="intel__columns" id="intel-columns" aria-label="Agency intelligence cards">
      <!-- Populated by JS -->
    </div>

    <!-- Classified Timeline -->
    <section class="intel__timeline" aria-label="Activity timeline">
      <div class="intel__timeline-header">
        <h2 class="section-label">Activity Log</h2>
      </div>
      <div class="intel__timeline-list" id="intel-timeline-list">
        <!-- Populated by JS -->
      </div>
    </section>

  </main>
  `;
}

// ---------------------------------------------------------------------------
// Render: Agency Cards
// ---------------------------------------------------------------------------

function renderAgencyCards(state) {
  const container = el('intel-columns');
  if (!container) return;

  const intelData = getAgencyIntelSummary(state);
  if (!intelData || intelData.length === 0) {
    container.innerHTML = '<div class="intel__empty">No agency data available.</div>';
    return;
  }

  container.innerHTML = '';

  intelData.forEach(agency => {
    const intensity = getIntensity(agency.suspicion);
    const colorKey = getColorKey(agency.color);
    const dangerClass = getCardDangerClass(agency.status);
    const barId = `intel-bar-${agency.agency.toLowerCase()}`;

    const card = document.createElement('div');
    card.classList.add('agency-card');
    if (dangerClass) card.classList.add(dangerClass);
    card.setAttribute('data-color', colorKey);
    card.id = `intel-card-${agency.agency.toLowerCase()}`;

    // Build latest move HTML
    let moveHTML;
    if (agency.latestPublicMove) {
      moveHTML = `<div class="agency-card__move">"${agency.latestPublicMove}"</div>`;
    } else if (agency.isClassifiedActive) {
      moveHTML = `<div class="agency-card__move agency-card__move--classified">
        ⬤ Classified operation in progress
      </div>`;
    } else {
      moveHTML = `<div class="agency-card__move" style="opacity:0.4">No activity on record.</div>`;
    }

    // Build threshold HTML
    let thresholdHTML = '';
    if (agency.nextThreshold !== null) {
      thresholdHTML = `
        <div class="agency-card__threshold">
          <span class="agency-card__threshold-next">Next: ${agency.nextStatus}</span>
          <span class="agency-card__threshold-distance">${agency.distanceToNext} pts away</span>
        </div>
      `;
    } else {
      thresholdHTML = `
        <div class="agency-card__threshold">
          <span class="agency-card__threshold-next" style="color:var(--color-accent-primary)">Maximum alert</span>
        </div>
      `;
    }

    card.innerHTML = `
      <!-- Header -->
      <div class="agency-card__header">
        <span class="agency-card__icon" aria-hidden="true">${agency.icon}</span>
        <div class="agency-card__name-block">
          <div class="agency-card__name">${agency.agency}</div>
          <div class="agency-card__fullname">${agency.fullName}</div>
        </div>
        <span class="agency-card__status agency-card__status--${agency.status}"
              aria-label="${agency.agency} status: ${agency.statusLabel}">
          ${agency.statusLabel}
        </span>
      </div>

      <!-- Suspicion Meter -->
      <div class="agency-card__meter">
        <div class="agency-card__meter-header">
          <span class="agency-card__meter-label">Suspicion</span>
          <span class="agency-card__meter-value">${agency.suspicion}%</span>
        </div>
        <div class="agency-card__bar" role="progressbar"
             aria-valuenow="${agency.suspicion}" aria-valuemin="0" aria-valuemax="100"
             aria-label="${agency.agency} suspicion level">
          <div class="agency-card__bar-fill agency-card__bar-fill--${intensity}"
               id="${barId}"
               style="width: 0%"></div>
        </div>
        ${thresholdHTML}
      </div>

      <!-- Details -->
      <div class="agency-card__details">
        <div class="agency-card__detail-row">
          <span class="agency-card__detail-label">Remit</span>
          <span class="agency-card__detail-value">${agency.jurisdiction}</span>
        </div>
        <div class="agency-card__detail-row">
          <span class="agency-card__detail-label">Focus</span>
          <span class="agency-card__detail-value">${agency.specialty}</span>
        </div>
      </div>

      <!-- Status Description -->
      <div class="agency-card__status-desc">${agency.statusDesc}</div>

      <!-- Latest Move -->
      ${moveHTML}
    `;

    container.appendChild(card);

    // Animate bar fill
    const barFill = card.querySelector(`#${barId}`);
    animateBarFill(barFill, agency.suspicion);
  });
}

// ---------------------------------------------------------------------------
// Render: Threat Level Badge
// ---------------------------------------------------------------------------

function renderThreatBadge(state) {
  const badge = el('intel-threat-badge');
  const label = el('intel-threat-label');
  if (!badge || !label) return;

  const threat = getOverallThreatLevel(state);

  // Reset classes
  badge.className = `intel__threat-badge intel__threat-badge--${threat.level}`;
  label.textContent = threat.label;
}

// ---------------------------------------------------------------------------
// Render: Classified Activity Indicator
// ---------------------------------------------------------------------------

function renderClassifiedIndicator(state) {
  const indicator = el('classified-indicator');
  const labelEl = el('classified-label');
  if (!indicator || !labelEl) return;

  const isActive = hasClassifiedActivity(state);

  indicator.className = `classified-indicator classified-indicator--${isActive ? 'active' : 'inactive'}`;
  labelEl.textContent = isActive
    ? 'Classified Activity Detected'
    : 'No Classified Activity';
}

// ---------------------------------------------------------------------------
// Render: Activity Timeline
// ---------------------------------------------------------------------------

function renderTimeline(state) {
  const list = el('intel-timeline-list');
  if (!list) return;

  const timeline = getClassifiedTimeline(state);

  if (!timeline || timeline.length === 0) {
    list.innerHTML = '<div class="intel__empty">No activity logged yet. Write a name in the Null Book.</div>';
    return;
  }

  list.innerHTML = '';

  // Show latest 10 entries
  const entries = timeline.slice(0, 10);

  entries.forEach(entry => {
    const row = document.createElement('div');
    row.classList.add('timeline-entry');

    const dotClass = entry.isClassified ? 'timeline-entry__dot--classified' : 'timeline-entry__dot--public';
    const labelClass = entry.isClassified ? 'timeline-entry__label--classified' : 'timeline-entry__label--public';
    const labelText = entry.isClassified ? 'Classified' : 'Public';
    const moveText = entry.isClassified
      ? 'Covert agency operation — no public statement.'
      : entry.publicMove;

    row.innerHTML = `
      <span class="timeline-entry__dot ${dotClass}" aria-hidden="true"></span>
      <div class="timeline-entry__content">
        <span class="timeline-entry__label ${labelClass}">${labelText}</span>
        ${moveText || entry.headline}
      </div>
    `;

    list.appendChild(row);
  });
}

// ---------------------------------------------------------------------------
// Render all
// ---------------------------------------------------------------------------

function renderIntelBoard() {
  // First, update all agency statuses based on current suspicion values
  const gs = getGameState() || window.gameState;
  if (gs) {
    updateAllAgencyStatuses(gs);
  }

  renderThreatBadge(gs);
  renderClassifiedIndicator(gs);
  renderAgencyCards(gs);
  renderTimeline(gs);
}

// ---------------------------------------------------------------------------
// Navigation
// ---------------------------------------------------------------------------

function showIntel() {
  const intelScreen = el('intel-screen');
  const dashboardScreen = el('dashboard-screen');
  const notebookScreen = el('notebook-screen');

  // Hide other screens
  if (dashboardScreen) dashboardScreen.classList.add('hidden');
  if (notebookScreen) notebookScreen.classList.add('hidden');

  // Show intel
  if (intelScreen) {
    intelScreen.classList.remove('hidden');
    // Re-trigger entry animation
    intelScreen.style.animation = 'none';
    void intelScreen.offsetWidth;
    intelScreen.style.animation = '';
  }

  // Render with fresh data
  renderIntelBoard();
}

function hideIntel() {
  const intelScreen = el('intel-screen');
  const dashboardScreen = el('dashboard-screen');

  if (intelScreen) intelScreen.classList.add('hidden');
  if (dashboardScreen) dashboardScreen.classList.remove('hidden');
}

// ---------------------------------------------------------------------------
// Event bindings
// ---------------------------------------------------------------------------

function bindBackButton() {
  const backBtn = el('intel-back-btn');
  backBtn?.addEventListener('click', hideIntel);
}

// ---------------------------------------------------------------------------
// Initialization
// ---------------------------------------------------------------------------

function injectIntelHTML() {
  if (el('intel-screen')) return;

  const container = document.createElement('div');
  container.innerHTML = buildIntelHTML();
  const screenEl = container.querySelector('#intel-screen');
  if (screenEl) {
    document.body.appendChild(screenEl);
  }
}

function initIntel() {
  injectIntelHTML();
  bindBackButton();

  // Wire dashboard "Intel" nav button
  const navIntelBtn = el('nav-intel');
  navIntelBtn?.addEventListener('click', showIntel);

  // Re-render when kill completes (agencies may have escalated)
  window.addEventListener('null:kill-complete', () => {
    // If intel screen is currently visible, re-render it
    const intelScreen = el('intel-screen');
    if (intelScreen && !intelScreen.classList.contains('hidden')) {
      renderIntelBoard();
    }
  });
}

// ---------------------------------------------------------------------------
// Auto-initialize on DOM ready
// ---------------------------------------------------------------------------

if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', initIntel);
} else {
  initIntel();
}

// ---------------------------------------------------------------------------
// Exports
// ---------------------------------------------------------------------------

export { initIntel, showIntel, hideIntel, renderIntelBoard };

// Expose on window for cross-module access
window.showIntel = showIntel;
window.renderIntelBoard = renderIntelBoard;
