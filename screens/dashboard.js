// ============================================================================
// NULL — Dashboard Screen
// GDD Section 5.2 — Screen 1: The Dashboard
// GDD Section 5.3 — Micro-interactions
// Hardcoded dummy data — no live game state wired yet
// ============================================================================

// ---------------------------------------------------------------------------
// Dummy Data (India region — Aryan Mathur)
// ---------------------------------------------------------------------------

const DUMMY_STATE = {
  region: 'india',
  playerName: 'Aryan Mathur',
  runNumber: 1,
  crimeRate: 87.3,
  crimeDelta: -12.7,
  egoIndex: 42,
  lifespanDays: 9847,
  agencySuspicion: {
    CBI: 78,
    RAW: 31,
    IB: 9,
  },
  agencyStatus: {
    CBI: 'ACTIVE',
    RAW: 'MONITORING',
    IB: 'UNAWARE',
  },
  newsFeed: [
    {
      headline:
        'Third cardiac death this week raises questions among Delhi police — "statistical anomaly" or something else?',
      source: 'The Indian Express',
      timestamp: '2 min ago',
    },
    {
      headline:
        'CBI forms special task force following series of unexplained deaths among high-profile corruption suspects.',
      source: 'NDTV',
      timestamp: '18 min ago',
    },
    {
      headline:
        'Public fear rises as pattern emerges — social media users coin term "divine justice" for sudden criminal deaths.',
      source: 'The Wire',
      timestamp: '1 hr ago',
    },
  ],
};

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const STATUS_LABELS = {
  UNAWARE:    'Unaware',
  MONITORING: 'Monitoring',
  ACTIVE:     'Active',
  HUNTING:    'Hunting',
  CLOSING_IN: 'Closing In',
};

// Teleprinter: ms between each word appearing
const WORD_INTERVAL_MS = 55;
// Teleprinter: ms between each news item starting (stagger)
const ITEM_STAGGER_MS  = 180;

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/**
 * Returns an intensity class suffix based on agency suspicion percent.
 * Used to pick the correct bar-fill color variant.
 */
function getSuspicionIntensity(percent) {
  if (percent >= 75) return 'critical';
  if (percent >= 50) return 'high';
  if (percent >= 25) return 'medium';
  return 'low';
}

/**
 * Wraps each word in a headline string in a <span class="news-word"> element
 * so the CSS animation can target them individually.
 * Returns a DocumentFragment of spans with spaces between.
 */
function buildTeleprinterSpans(text) {
  const words = text.split(' ');
  const frag = document.createDocumentFragment();

  words.forEach((word, i) => {
    const span = document.createElement('span');
    span.classList.add('news-word');
    // Animation delay grows per word — teleprinter drip effect
    span.style.animationDelay = `${i * WORD_INTERVAL_MS}ms`;
    span.textContent = word;
    frag.appendChild(span);

    // Space between words (not wrapped — always visible)
    if (i < words.length - 1) {
      frag.appendChild(document.createTextNode(' '));
    }
  });

  return frag;
}

/**
 * Performs two nested rAF calls to ensure the browser has painted the
 * element at width:0 before we apply the target width for the transition.
 */
function animateBarFill(el, targetWidth) {
  requestAnimationFrame(() => {
    requestAnimationFrame(() => {
      el.style.width = `${targetWidth}%`;
    });
  });
}

// ---------------------------------------------------------------------------
// Render: Stat cards
// ---------------------------------------------------------------------------

function renderStatCards(state) {
  // — Crime Rate —
  const crimeValue = document.getElementById('crime-rate-value');
  const crimeTrend = document.getElementById('crime-rate-trend');

  crimeValue.textContent = `${state.crimeRate}%`;

  if (state.crimeDelta < 0) {
    crimeTrend.textContent = `↓ ${Math.abs(state.crimeDelta).toFixed(1)}% from start`;
    crimeTrend.classList.add('stat-card__trend--down');
  } else if (state.crimeDelta > 0) {
    crimeTrend.textContent = `↑ ${state.crimeDelta.toFixed(1)}% from start`;
    crimeTrend.classList.add('stat-card__trend--up');
  } else {
    crimeTrend.textContent = 'No change';
    crimeTrend.classList.add('stat-card__trend--neutral');
  }

  // — Ego Index —
  const egoValue = document.getElementById('ego-index-value');
  const egoBar   = document.getElementById('ego-bar-fill');

  egoValue.textContent = `${state.egoIndex}%`;
  animateBarFill(egoBar, state.egoIndex);

  // — Lifespan —
  const lifespanValue = document.getElementById('lifespan-value');
  const lifespanTrend = document.getElementById('lifespan-trend');

  lifespanValue.textContent = state.lifespanDays.toLocaleString('en-IN') + ' days';

  const years = (state.lifespanDays / 365.25).toFixed(1);
  lifespanTrend.textContent = `≈ ${years} yrs remaining`;
  lifespanTrend.classList.add('stat-card__trend--neutral');
}

// ---------------------------------------------------------------------------
// Render: Agency suspicion bars
// GDD 5.3: Suspicion meters never jump instantly — animate upward over 3s
// ---------------------------------------------------------------------------

function renderAgencies(state) {
  const container = document.getElementById('agency-list');
  container.innerHTML = '';

  const agencies = Object.keys(state.agencySuspicion);

  agencies.forEach((agencyName) => {
    const suspicion = state.agencySuspicion[agencyName];
    const status    = state.agencyStatus[agencyName];
    const intensity = getSuspicionIntensity(suspicion);
    const barId     = `agency-bar-${agencyName.toLowerCase()}`;

    const row = document.createElement('div');
    row.classList.add('agency-row');
    row.id = `agency-${agencyName.toLowerCase()}`;

    row.innerHTML = `
      <span class="agency-row__name">${agencyName}</span>
      <div class="agency-row__bar-container">
        <div class="agency-row__bar" role="progressbar"
             aria-valuenow="${suspicion}" aria-valuemin="0" aria-valuemax="100"
             aria-label="${agencyName} suspicion">
          <div class="agency-row__bar-fill agency-row__bar-fill--${intensity}"
               id="${barId}"
               style="width: 0%"></div>
        </div>
        <span class="agency-row__percent">${suspicion}%</span>
      </div>
      <span class="agency-row__status agency-row__status--${status}"
            aria-label="${agencyName} status: ${STATUS_LABELS[status] || status}">
        ${STATUS_LABELS[status] || status}
      </span>
    `;

    container.appendChild(row);

    // GDD 5.3: bars animate upward over 3 seconds — CSS handles the 3s transition,
    // we just need to set the target width in the next paint cycle.
    const barFill = row.querySelector(`#${barId}`);
    animateBarFill(barFill, suspicion);
  });
}

// ---------------------------------------------------------------------------
// Render: News feed
// GDD 5.3: Feed items fade in one word at a time — teleprinter effect
// ---------------------------------------------------------------------------

function renderNewsFeed(state) {
  const container = document.getElementById('news-list');
  container.innerHTML = '';

  state.newsFeed.forEach((item, itemIndex) => {
    const newsEl = document.createElement('div');
    newsEl.classList.add('news-item');

    // Build structure
    const marker = document.createElement('span');
    marker.classList.add('news-item__marker');
    marker.setAttribute('aria-hidden', 'true');
    marker.textContent = '▸';

    const content = document.createElement('div');
    content.classList.add('news-item__content');

    const headline = document.createElement('p');
    headline.classList.add('news-item__headline');

    const meta = document.createElement('span');
    meta.classList.add('news-item__meta');
    meta.textContent = `${item.source} · ${item.timestamp}`;

    content.appendChild(headline);
    content.appendChild(meta);
    newsEl.appendChild(marker);
    newsEl.appendChild(content);
    container.appendChild(newsEl);

    // GDD 5.3 teleprinter: stagger each item's word stream start
    const itemDelay = itemIndex * ITEM_STAGGER_MS * 6;

    // Count total words across previous items so delays are continuous
    const prevWordCount = state.newsFeed
      .slice(0, itemIndex)
      .reduce((acc, i) => acc + i.headline.split(' ').length, 0);

    // Build teleprinter spans with running delay offset
    const words = item.headline.split(' ');
    const baseDelay = itemDelay + (prevWordCount * WORD_INTERVAL_MS * 0.3);

    const frag = document.createDocumentFragment();
    words.forEach((word, wi) => {
      const span = document.createElement('span');
      span.classList.add('news-word');
      span.style.animationDelay = `${baseDelay + wi * WORD_INTERVAL_MS}ms`;
      span.textContent = word;
      frag.appendChild(span);
      if (wi < words.length - 1) {
        frag.appendChild(document.createTextNode(' '));
      }
    });

    headline.appendChild(frag);
  });
}

// ---------------------------------------------------------------------------
// Prepend a new news item (called post-kill in future milestones)
// GDD 5.3: New items push from top
// ---------------------------------------------------------------------------

export function prependNewsItem(item) {
  const container = document.getElementById('news-list');
  if (!container) return;

  const newsEl = document.createElement('div');
  newsEl.classList.add('news-item', 'news-item--new');

  const marker = document.createElement('span');
  marker.classList.add('news-item__marker');
  marker.setAttribute('aria-hidden', 'true');
  marker.textContent = '▸';

  const content = document.createElement('div');
  content.classList.add('news-item__content');

  const headline = document.createElement('p');
  headline.classList.add('news-item__headline');

  const words = item.headline.split(' ');
  const frag = document.createDocumentFragment();
  words.forEach((word, i) => {
    const span = document.createElement('span');
    span.classList.add('news-word');
    span.style.animationDelay = `${i * WORD_INTERVAL_MS}ms`;
    span.textContent = word;
    frag.appendChild(span);
    if (i < words.length - 1) frag.appendChild(document.createTextNode(' '));
  });
  headline.appendChild(frag);

  const meta = document.createElement('span');
  meta.classList.add('news-item__meta');
  meta.textContent = `${item.source || 'Breaking'} · just now`;

  content.appendChild(headline);
  content.appendChild(meta);
  newsEl.appendChild(marker);
  newsEl.appendChild(content);

  // Push from top, trim to 5 items max
  container.insertBefore(newsEl, container.firstChild);
  const items = container.querySelectorAll('.news-item');
  if (items.length > 5) {
    container.removeChild(items[items.length - 1]);
  }
}

// ---------------------------------------------------------------------------
// Initialize
// ---------------------------------------------------------------------------

function initDashboard() {
  const state = window.gameState || DUMMY_STATE;
  renderStatCards(state);
  renderAgencies(state);
  renderNewsFeed(state);
}

if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', initDashboard);
} else {
  initDashboard();
}

// ---------------------------------------------------------------------------
// Exports
// ---------------------------------------------------------------------------

// FIX 5: prependNewsItem already has inline `export` — keep only that, no duplicate here
export { renderStatCards, renderAgencies, renderNewsFeed, initDashboard };

// Expose on window for cross-module access from notebook.js (kill updates)
window.renderStatCards  = renderStatCards;
window.renderAgencies   = renderAgencies;
window.renderNewsFeed   = renderNewsFeed;
window.prependNewsItem  = prependNewsItem;

// FIX 1: Listen for kill-complete — re-render all three panels with live state
window.addEventListener('null:kill-complete', () => {
  const state = window.gameState || DUMMY_STATE;
  renderStatCards(state);
  renderAgencies(state);
  renderNewsFeed(state);
});

