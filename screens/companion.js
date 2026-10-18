// ============================================================================
// NULL — Companion & Dossier Screen (The Watcher)
// Master Prompt Section 9 & 11
//
// The Watcher communes with the bearer, offers the Sight Bargain,
// and presents character dossiers for investigation.
// ============================================================================

import { getGameState, getRNG, saveGame } from '../engine/gameState.js';
import { isSightBargainAvailable, acceptSightBargain, startChallengeTimer } from '../engine/supernaturalEngine.js';
import { resolveAction, ACTION_TYPES } from '../engine/actionEngine.js';
import { escapeHTML } from '../engine/narrativeEngine.js';
import { showNotebook } from './notebook.js';

function el(id) {
  return document.getElementById(id);
}

function buildCompanionHTML() {
  const gameState = getGameState();
  const lifespan = gameState?.lifespanDays || 9847;
  const bargainCost = Math.floor(lifespan * 0.5);
  const bargainTaken = gameState?.sightBargainAccepted || false;

  return `
  <main id="companion-screen" class="companion-screen hidden screen" aria-label="The Watcher and Dossiers">
    <header class="companion__topbar">
      <button id="companion-back-btn" class="companion__back-btn" aria-label="Return to dashboard">
        ← Dashboard
      </button>
      <h1 class="companion__title">THE WATCHER & DOSSIERS</h1>
      <span class="companion__lifespan">⏳ ${lifespan}d remaining</span>
    </header>

    <div class="companion__content">
      <!-- ── The Watcher Commune Box ── -->
      <section class="watcher-card" aria-label="The Watcher">
        <div class="watcher-card__avatar">◈</div>
        <div class="watcher-card__info">
          <div class="watcher-card__name">The Watcher</div>
          <div class="watcher-card__subtitle">Spectral Entity Bound to the Ledger</div>
          <p class="watcher-card__dialogue" id="watcher-dialogue">
            ${getWatcherDialogue(gameState)}
          </p>

          <div class="watcher-bargain-box ${bargainTaken ? 'watcher-bargain-box--taken' : ''}">
            <div class="watcher-bargain-box__title">THE SIGHT BARGAIN</div>
            <p class="watcher-bargain-box__desc">
              ${bargainTaken
                ? '✅ <strong>The Bargain is Sealed.</strong> You possess the supernatural sight. All true names and lifespans are revealed upon observation.'
                : `Sacrifice half your remaining lifespan (<strong>−${bargainCost} days</strong>). In return, you will see the true legal names and lifespans of all targets, eliminating verification ambiguity.`
              }
            </p>
            ${!bargainTaken ? `
              <button id="btn-accept-bargain" class="btn-bargain" type="button">
                SEAL THE BARGAIN (−${bargainCost} DAYS)
              </button>
            ` : ''}
          </div>
        </div>
      </section>

      <!-- ── Character Dossiers ── -->
      <section class="dossier-section" aria-label="Target Dossiers">
        <div class="dossier-section__header">
          <h2 class="section-label">Investigative Dossiers</h2>
          <span class="dossier-count" id="dossier-count">0 tracked</span>
        </div>
        <div class="dossier-grid" id="dossier-grid">
          <!-- Populated by JS -->
        </div>
      </section>
    </div>
  </main>
  `;
}

function getWatcherDialogue(gameState) {
  if (!gameState) return 'The ledger lies open. What you write cannot be unwritten.';
  if (gameState.crimeIndex < 30) {
    return 'The city holds its breath. Crime crumbles, but the agencies draw their nets ever tighter.';
  }
  if (gameState.totalLedgerEntries > 5) {
    return `You have claimed ${gameState.totalLedgerEntries} souls. Every heart that stops sends tremors through the factions.`;
  }
  if (gameState.sightBargainAccepted) {
    return 'Your mortal vision is burned away. You see the cold truth of their names and hours.';
  }
  return 'I am neither your conscience nor your judge. The ledger is merely a tool; the judgment is yours.';
}

export function renderDossiers() {
  const container = el('dossier-grid');
  const countEl = el('dossier-count');
  if (!container) return;

  const gameState = getGameState();
  const characters = gameState?.characters || {};
  const charEntries = Object.entries(characters);

  if (countEl) countEl.textContent = `${charEntries.length} tracked`;
  container.innerHTML = '';

  charEntries.forEach(([id, char]) => {
    const isAlive = char.isAlive !== false;
    const card = document.createElement('div');
    card.classList.add('dossier-card');
    if (!isAlive) card.classList.add('dossier-card--dead');

    const statusBadge = isAlive
      ? '<span class="dossier-status dossier-status--alive">ALIVE</span>'
      : '<span class="dossier-status dossier-status--dead">DECEASED</span>';

    card.innerHTML = `
      <div class="dossier-card__header">
        <div class="dossier-card__name-block">
          <div class="dossier-card__name ${!isAlive ? 'strike' : ''}">${escapeHTML(char.name)}</div>
          <div class="dossier-card__role">${escapeHTML(char.role)} · <span class="dossier-faction">${char.factionId || 'Independent'}</span></div>
        </div>
        ${statusBadge}
      </div>
      <p class="dossier-card__desc">${escapeHTML(char.description || '')}</p>
      <div class="dossier-card__actions">
        ${isAlive ? `
          <button class="btn-dossier-action btn-dossier-investigate" data-id="${id}" type="button">
            🔍 Investigate Target
          </button>
          <button class="btn-dossier-action btn-dossier-target" data-id="${id}" type="button">
            🖋️ Open In Ledger
          </button>
        ` : `
          <span class="dossier-deceased-note">Neutralized in Turn ${char.deathTurn || gameState?.turn || '—'}</span>
        `}
      </div>
    `;

    container.appendChild(card);
  });

  // Bind investigate buttons
  container.querySelectorAll('.btn-dossier-investigate').forEach(btn => {
    btn.addEventListener('click', (e) => {
      e.stopPropagation();
      handleInvestigateCharacter(btn.dataset.id);
    });
  });

  // Bind open in ledger buttons
  container.querySelectorAll('.btn-dossier-target').forEach(btn => {
    btn.addEventListener('click', (e) => {
      e.stopPropagation();
      const charId = btn.dataset.id;
      showNotebook();
      const select = el('target-dossier-select');
      if (select) {
        select.value = charId;
        select.dispatchEvent(new Event('change'));
      }
    });
  });
}

function handleInvestigateCharacter(characterId) {
  const gameState = getGameState();
  if (!gameState) return;

  const rng = getRNG();
  const result = resolveAction(ACTION_TYPES.INVESTIGATE, { characterId }, gameState, rng);

  if (result.success) {
    saveGame();
    window.gameState = gameState;
    window.dispatchEvent(new CustomEvent('null:kill-complete'));

    const char = gameState.characters[characterId];
    alert(`Investigation complete on ${char.name}.\n${result.data?.discoveredInfo ? 'Discovered role & criminal associations.' : 'Target kept a low profile.'}\nWorld advanced to Turn ${gameState.turn}.`);
    renderCompanion();
  }
}

function handleAcceptBargain() {
  const gameState = getGameState();
  if (!gameState || !isSightBargainAvailable(gameState)) return;

  const confirmed = confirm(
    `Accept the Sight Bargain?\n\nThis will permanently sacrifice HALF your remaining lifespan (${Math.floor(gameState.lifespanDays * 0.5)} days).\n\nYou will gain supernatural perception of true names and lifespans.\n\nThis action is irreversible.`
  );

  if (confirmed) {
    const outcome = acceptSightBargain(gameState);
    if (!outcome.error) {
      if (gameState.challengeMode) {
        startChallengeTimer(gameState);
      }
      saveGame();
      window.gameState = gameState;
      window.dispatchEvent(new CustomEvent('null:kill-complete'));
      alert(`The deal is struck. ${outcome.lifespanCost} days of your lifespan have been surrendered to the Watcher.`);
      renderCompanion();
    }
  }
}

export function renderCompanion() {
  const gameState = getGameState();
  const dialogueEl = el('watcher-dialogue');
  if (dialogueEl) dialogueEl.textContent = getWatcherDialogue(gameState);
  renderDossiers();
}

export function showCompanion() {
  const screens = ['dashboard-screen', 'notebook-screen', 'intel-screen', 'void-screen'];
  screens.forEach(s => el(s)?.classList.add('hidden'));

  const compScreen = el('companion-screen');
  if (compScreen) {
    compScreen.classList.remove('hidden');
    renderCompanion();
  }
}

export function hideCompanion() {
  el('companion-screen')?.classList.add('hidden');
  el('dashboard-screen')?.classList.remove('hidden');
}

export function initCompanion() {
  if (!el('companion-screen')) {
    const container = document.createElement('div');
    container.innerHTML = buildCompanionHTML();
    document.body.appendChild(container.querySelector('#companion-screen'));
  }

  el('companion-back-btn')?.addEventListener('click', hideCompanion);
  el('nav-companion')?.addEventListener('click', showCompanion);

  document.addEventListener('click', (e) => {
    if (e.target && e.target.id === 'btn-accept-bargain') {
      handleAcceptBargain();
    }
  });

  renderDossiers();
}

if (typeof document !== 'undefined') {
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', initCompanion);
  } else {
    initCompanion();
  }
}
