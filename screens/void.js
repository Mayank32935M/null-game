// ============================================================================
// NULL — The Void Screen
// Master Prompt Section 11 & 12
//
// Existential archive: event history, compound run memory, victory & defeat
// condition evaluation, and clean game reset.
// ============================================================================

import { getGameState, resetGame, saveGame } from '../engine/gameState.js';
import { checkVictoryCondition, checkDefeatConditions, determineEnding } from '../engine/worldSimulation.js';
import { analyzePlayerHistory } from '../engine/compoundMemory.js';
import { escapeHTML } from '../engine/narrativeEngine.js';

function el(id) {
  return document.getElementById(id);
}

function buildVoidHTML() {
  return `
  <main id="void-screen" class="void-screen hidden screen" aria-label="The Void">
    <header class="void__topbar">
      <button id="void-back-btn" class="void__back-btn" aria-label="Return to dashboard">
        ← Dashboard
      </button>
      <h1 class="void__title">THE VOID</h1>
      <span class="void__meta-tag">EXISTENTIAL ARCHIVE</span>
    </header>

    <div class="void__content">
      <!-- ── World Ending Status ── -->
      <section class="void-card ending-status-card" id="ending-status-card">
        <!-- Rendered by JS -->
      </section>

      <!-- ── Compound Memory & Run Analysis ── -->
      <section class="void-card memory-card" id="memory-card">
        <!-- Rendered by JS -->
      </section>

      <!-- ── Event Log ── -->
      <section class="void-card event-archive-card">
        <div class="void-card__header">
          <h2 class="section-label">Immutable Event Ledger</h2>
          <span class="void-event-count" id="void-event-count">0 events</span>
        </div>
        <div class="void-event-list" id="void-event-list">
          <!-- Populated by JS -->
        </div>
      </section>

      <!-- ── Game Lifecycle Controls ── -->
      <section class="void-card reset-card">
        <h2 class="section-label" style="color:var(--color-accent-primary)">Simulation Control</h2>
        <p style="font-size:0.85em; opacity:0.8; margin-bottom:12px;">
          Wipe the active world simulation and begin a fresh run. Run profile will be committed to compound memory.
        </p>
        <button id="btn-reset-game" class="btn-reset" type="button">
          RESET SIMULATION (NEW RUN)
        </button>
      </section>
    </div>
  </main>
  `;
}

export function renderVoid() {
  const gameState = getGameState();
  if (!gameState) return;

  // 1. Ending evaluation
  const endingEl = el('ending-status-card');
  if (endingEl) {
    const victory = checkVictoryCondition(gameState);
    const defeat = checkDefeatConditions(gameState);
    const ending = determineEnding(gameState);

    let statusHeader = 'Simulation Ongoing';
    let statusClass = 'status--ongoing';

    if (victory.met) {
      statusHeader = '🏆 VICTORY ACHIEVED';
      statusClass = 'status--victory';
    } else if (defeat) {
      statusHeader = '💀 BEARER DEFEATED';
      statusClass = 'status--defeat';
    }

    endingEl.innerHTML = `
      <div class="ending-badge ${statusClass}">${statusHeader}</div>
      <h2 class="ending-name">${ending.name}</h2>
      <p class="ending-desc">${ending.description}</p>
      <div class="ending-metrics">
        <div class="ending-metric">
          <span class="label">Current Crime:</span>
          <span class="value">${gameState.crimeIndex}%</span>
        </div>
        <div class="ending-metric">
          <span class="label">Consecutive Turns Below 25:</span>
          <span class="value">${victory.turnsBelow} / ${victory.required}</span>
        </div>
        <div class="ending-metric">
          <span class="label">Lifespan Remaining:</span>
          <span class="value">${gameState.lifespanDays}d</span>
        </div>
        <div class="ending-metric">
          <span class="label">Attribution Exposure:</span>
          <span class="value">${Math.round(gameState.indicators?.playerExposure || 0)}%</span>
        </div>
      </div>
    `;
  }

  // 2. Memory card
  const memEl = el('memory-card');
  if (memEl) {
    const analysis = analyzePlayerHistory();
    memEl.innerHTML = `
      <h2 class="section-label">Compound Memory Profile (Run ${gameState.runNumber || 1})</h2>
      <div class="memory-stats">
        <div>Completed Historical Runs: <strong>${analysis.runCount}</strong></div>
        <div>Dominant Elimination Method: <strong>${analysis.dominantMethod || 'None yet'}</strong></div>
        <div>Lifespan Deal Rate: <strong>${Math.round(analysis.bargainRate * 100)}%</strong></div>
      </div>
      <ul class="memory-tendencies">
        ${analysis.tendencies.map(t => `<li>${escapeHTML(t)}</li>`).join('')}
      </ul>
    `;
  }

  // 3. Event archive
  const eventList = el('void-event-list');
  const eventCount = el('void-event-count');
  if (eventList) {
    const events = (gameState.eventLog || []).slice().reverse();
    if (eventCount) eventCount.textContent = `${events.length} events logged`;

    if (events.length === 0) {
      eventList.innerHTML = '<div style="opacity:0.4; font-size:0.85em;">No events recorded.</div>';
    } else {
      eventList.innerHTML = events.slice(0, 30).map(e => `
        <div class="void-event-item">
          <span class="void-event-turn">T${e.turn}</span>
          <span class="void-event-type">[${e.type}]</span>
          <span class="void-event-desc">${escapeHTML(e.description)}</span>
        </div>
      `).join('');
    }
  }
}

export function showVoid() {
  const screens = ['dashboard-screen', 'notebook-screen', 'intel-screen', 'companion-screen'];
  screens.forEach(s => el(s)?.classList.add('hidden'));

  const voidScreen = el('void-screen');
  if (voidScreen) {
    voidScreen.classList.remove('hidden');
    renderVoid();
  }
}

export function hideVoid() {
  el('void-screen')?.classList.add('hidden');
  el('dashboard-screen')?.classList.remove('hidden');
}

export function initVoid() {
  if (!el('void-screen')) {
    const container = document.createElement('div');
    container.innerHTML = buildVoidHTML();
    document.body.appendChild(container.querySelector('#void-screen'));
  }

  el('void-back-btn')?.addEventListener('click', hideVoid);
  el('nav-void')?.addEventListener('click', showVoid);
  el('void-btn')?.addEventListener('click', showVoid);

  el('btn-reset-game')?.addEventListener('click', () => {
    if (confirm('Are you sure you want to reset and begin a fresh run? Current state will be cleared.')) {
      resetGame({ forceNew: true });
      window.location.reload();
    }
  });

  renderVoid();
}

if (typeof document !== 'undefined') {
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', initVoid);
  } else {
    initVoid();
  }
}
