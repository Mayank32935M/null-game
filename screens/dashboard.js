// ============================================================================
// NULL — Dashboard Screen (v2)
// GDD Section 5.2 — Screen 1: The Dashboard
// Master Prompt Section 11 & Section 4
//
// Shows the state of the world, recent events, crime index, important
// social indicators, and investigation pressure. Allows advancing time nonlethally.
// ============================================================================

import { getGameState, getRNG, saveGame } from '../engine/gameState.js';
import { resolveAction, ACTION_TYPES } from '../engine/actionEngine.js';
import { getAgencyIntelSummary, STATUS_LABELS } from '../engine/agencyEngine.js';

// Teleprinter timing constants
const WORD_INTERVAL_MS = 45;
const ITEM_STAGGER_MS  = 140;

function getSuspicionIntensity(percent) {
  if (percent >= 75) return 'critical';
  if (percent >= 50) return 'high';
  if (percent >= 25) return 'medium';
  return 'low';
}

function animateBarFill(el, targetWidth) {
  if (!el) return;
  requestAnimationFrame(() => {
    requestAnimationFrame(() => {
      el.style.width = `${Math.min(100, Math.max(0, targetWidth))}%`;
    });
  });
}

// ---------------------------------------------------------------------------
// Render: Stat cards
// ---------------------------------------------------------------------------

function renderStatCards(state) {
  const gs = state || getGameState();
  if (!gs) return;

  // 1. Crime Index
  const crimeValue = document.getElementById('crime-rate-value');
  const crimeTrend = document.getElementById('crime-rate-trend');

  const crime = typeof gs.crimeIndex === 'number'
    ? gs.crimeIndex
    : (typeof gs.crimeRate === 'number' ? gs.crimeRate : 100);

  const initialCrime = 100;
  const delta = crime - initialCrime;

  if (crimeValue) crimeValue.textContent = `${crime.toFixed(1)}%`;

  if (crimeTrend) {
    if (delta < 0) {
      crimeTrend.textContent = `↓ ${Math.abs(delta).toFixed(1)}% (Goal: < 25%)`;
      crimeTrend.className = 'stat-card__trend stat-card__trend--down';
    } else if (delta > 0) {
      crimeTrend.textContent = `↑ ${delta.toFixed(1)}% (Goal: < 25%)`;
      crimeTrend.className = 'stat-card__trend stat-card__trend--up';
    } else {
      crimeTrend.textContent = 'Baseline (Goal: < 25%)';
      crimeTrend.className = 'stat-card__trend stat-card__trend--neutral';
    }
  }

  // 2. Exposure / Threat Index
  const egoLabel = document.querySelector('#stat-ego .stat-card__label');
  const egoValue = document.getElementById('ego-index-value');
  const egoBar   = document.getElementById('ego-bar-fill');

  const exposure = Math.round(gs.indicators?.playerExposure ?? gs.exposureRisk ?? gs.egoIndex ?? 0);
  if (egoLabel) egoLabel.textContent = 'Attribution Risk';
  if (egoValue) egoValue.textContent = `${exposure}%`;
  animateBarFill(egoBar, exposure);

  // 3. Lifespan
  const lifespanValue = document.getElementById('lifespan-value');
  const lifespanTrend = document.getElementById('lifespan-trend');

  const days = gs.lifespanDays || 0;
  if (lifespanValue) lifespanValue.textContent = days.toLocaleString() + ' days';

  const years = (days / 365.25).toFixed(1);
  if (lifespanTrend) {
    lifespanTrend.textContent = `≈ ${years} yrs natural lifespan`;
    lifespanTrend.className = 'stat-card__trend stat-card__trend--neutral';
  }
}

// ---------------------------------------------------------------------------
// Render: Agency suspicion bars
// ---------------------------------------------------------------------------

function renderAgencies(state) {
  const container = document.getElementById('agency-list');
  if (!container) return;
  container.innerHTML = '';

  const gs = state || getGameState();
  if (!gs) return;

  const intelSummaries = getAgencyIntelSummary(gs);

  intelSummaries.forEach((agency) => {
    const suspicion = agency.suspicion;
    const status    = agency.status;
    const intensity = getSuspicionIntensity(suspicion);
    const barId     = `agency-bar-${agency.agency.toLowerCase()}`;

    const row = document.createElement('div');
    row.classList.add('agency-row');
    row.id = `agency-${agency.agency.toLowerCase()}`;

    row.innerHTML = `
      <span class="agency-row__name">${agency.agency}</span>
      <div class="agency-row__bar-container">
        <div class="agency-row__bar" role="progressbar"
             aria-valuenow="${suspicion}" aria-valuemin="0" aria-valuemax="100"
             aria-label="${agency.agency} suspicion">
          <div class="agency-row__bar-fill agency-row__bar-fill--${intensity}"
               id="${barId}"
               style="width: 0%"></div>
        </div>
        <span class="agency-row__percent">${suspicion}%</span>
      </div>
      <span class="agency-row__status agency-row__status--${status}"
            aria-label="${agency.agency} status: ${agency.statusLabel || status}">
        ${agency.statusLabel || status}
      </span>
    `;

    container.appendChild(row);

    const barFill = row.querySelector(`#${barId}`);
    animateBarFill(barFill, suspicion);
  });
}

// ---------------------------------------------------------------------------
// Render: News feed
// ---------------------------------------------------------------------------

function renderNewsFeed(state) {
  const container = document.getElementById('news-list');
  if (!container) return;
  container.innerHTML = '';

  const gs = state || getGameState();
  if (!gs) return;

  const feed = gs.newsFeed && gs.newsFeed.length > 0 ? gs.newsFeed : [
    {
      headline: 'Intelligence wire active. Monitoring global indicators and unexplained casualties.',
      source: 'Global Wire',
      timestamp: 'Turn 0',
    }
  ];

  feed.slice(0, 10).forEach((item, itemIndex) => {
    const newsEl = document.createElement('div');
    newsEl.classList.add('news-item');

    const marker = document.createElement('span');
    marker.classList.add('news-item__marker');
    marker.setAttribute('aria-hidden', 'true');
    marker.textContent = '▸';

    const content = document.createElement('div');
    content.classList.add('news-item__content');

    const headline = document.createElement('p');
    headline.classList.add('news-item__headline');
    headline.textContent = item.headline || '';

    const meta = document.createElement('span');
    meta.classList.add('news-item__meta');
    meta.textContent = `${item.source || 'News'} · ${item.timestamp || 'just now'}`;

    content.appendChild(headline);
    content.appendChild(meta);
    newsEl.appendChild(marker);
    newsEl.appendChild(content);
    container.appendChild(newsEl);
  });
}

export function prependNewsItem(item) {
  const container = document.getElementById('news-list');
  if (!container || !item) return;

  const newsEl = document.createElement('div');
  newsEl.classList.add('news-item');

  const marker = document.createElement('span');
  marker.classList.add('news-item__marker');
  marker.setAttribute('aria-hidden', 'true');
  marker.textContent = '▸';

  const content = document.createElement('div');
  content.classList.add('news-item__content');

  const headline = document.createElement('p');
  headline.classList.add('news-item__headline');
  headline.textContent = item.headline || '';

  const meta = document.createElement('span');
  meta.classList.add('news-item__meta');
  meta.textContent = `${item.source || 'Breaking'} · just now`;

  content.appendChild(headline);
  content.appendChild(meta);
  newsEl.appendChild(marker);
  newsEl.appendChild(content);

  container.insertBefore(newsEl, container.firstChild);
  const items = container.querySelectorAll('.news-item');
  if (items.length > 10) {
    container.removeChild(items[items.length - 1]);
  }
}

// ---------------------------------------------------------------------------
// Nonlethal Advance Action (Wait / Observe)
// ---------------------------------------------------------------------------

function handleWaitTurn() {
  const gs = getGameState();
  if (!gs) return;

  const rng = getRNG();
  const result = resolveAction(ACTION_TYPES.WAIT, {}, gs, rng);

  if (result.success) {
    saveGame();
    window.gameState = gs;
    initDashboard();
    window.dispatchEvent(new CustomEvent('null:kill-complete'));
  }
}

// ---------------------------------------------------------------------------
// Initialize
// ---------------------------------------------------------------------------

function initDashboard() {
  const state = getGameState();
  if (!state) return;

  // Update run tag in header
  const runTag = document.querySelector('.dashboard__run-tag');
  if (runTag) {
    runTag.textContent = `TURN ${state.turn || 0} · RUN ${(state.runNumber || 1).toString().padStart(2, '0')}`;
  }

  // Ensure "Observe / Wait" button exists in navigation or header
  const topBar = document.querySelector('.dashboard__topbar');
  if (topBar && !document.getElementById('wait-turn-btn')) {
    const waitBtn = document.createElement('button');
    waitBtn.id = 'wait-turn-btn';
    waitBtn.className = 'dashboard__wait-btn';
    waitBtn.setAttribute('title', 'Advance world by one turn without writing in the ledger');
    waitBtn.innerHTML = '<span>⏳</span> ADVANCE TURN';
    waitBtn.addEventListener('click', handleWaitTurn);
    topBar.insertBefore(waitBtn, topBar.querySelector('#void-btn'));
  }

  renderStatCards(state);
  renderAgencies(state);
  renderNewsFeed(state);
}

if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', initDashboard);
} else {
  initDashboard();
}

export { renderStatCards, renderAgencies, renderNewsFeed, initDashboard };

window.renderStatCards  = renderStatCards;
window.renderAgencies   = renderAgencies;
window.renderNewsFeed   = renderNewsFeed;
window.prependNewsItem  = prependNewsItem;
window.initDashboard    = initDashboard;

window.addEventListener('null:kill-complete', () => {
  initDashboard();
});
