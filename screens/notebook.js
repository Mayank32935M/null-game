// ============================================================================
// NULL — The Ledger (Notebook Screen)
// GDD Section 5.2 — Screen 2: The Null Book / Ledger
// Master Prompt Section 9: Supernatural Artefact & Lifespan System
//
// Validates target details, causes of death, time and final actions.
// Submits actions authoritatively to actionEngine (deterministic simulation),
// triggers narrative generation via narrativeEngine, and plays the ink animation.
// ============================================================================

import { resolveAction, ACTION_TYPES } from '../engine/actionEngine.js';
import { getGameState, getRNG, saveGame, getRunHistory, clamp } from '../engine/gameState.js';
import { updateAllAgencyStatuses } from '../engine/agencyEngine.js';
import { geminiProvider } from '../engine/geminiEngine.js';
import { requestNarrative, buildNarrativeContext, escapeHTML } from '../engine/narrativeEngine.js';
import { LEDGER_RULES, CHARACTERS } from '../data/universe.js';
import { EVENT_TYPES } from '../engine/eventEngine.js';

// ---------------------------------------------------------------------------
// Constants & Configuration
// ---------------------------------------------------------------------------

/** Kill methods — matches universe.js causes */
const KILL_METHODS = [
  {
    key: 'cardiac',
    name: 'Cardiac Arrest',
    icon: '♡',
    desc: 'Silent. Untraceable. The heart simply stops.',
    risk: 'low',
    riskLabel: 'Low Risk',
  },
  {
    key: 'accident',
    name: 'Accident',
    icon: '⚡',
    desc: 'Staged misfortune. Plausible if not overused.',
    risk: 'med',
    riskLabel: 'Med Risk',
  },
  {
    key: 'publicCollapse',
    name: 'Public Collapse',
    icon: '◉',
    desc: 'Visible. Unmistakable. The city will remember.',
    risk: 'high',
    riskLabel: 'High Risk',
  },
  {
    key: 'orchestrated',
    name: 'Orchestrated',
    icon: '◈',
    desc: 'Others carry it out. Threads remain.',
    risk: 'med',
    riskLabel: 'Med Risk',
  },
];

/** Target types — maps type key → display metadata */
const TARGET_TYPES = [
  {
    key: 'petty_criminal',
    label: 'Street Offender',
    chipClass: 'identity-chip--petty',
    crimePreview: '−0.5 to −1.5',
    desc: 'Low-level offender. Marginal reduction.',
  },
  {
    key: 'corrupt_official',
    label: 'Corrupt Official',
    chipClass: 'identity-chip--official',
    crimePreview: '−2.0 to −5.0',
    desc: 'Position abused. Systemic rot excised.',
  },
  {
    key: 'syndicate_leader',
    label: 'Syndicate Leader',
    chipClass: 'identity-chip--systemic',
    crimePreview: '−4.0 to −9.0',
    desc: 'Network-level threat. High risk of power vacuum.',
  },
];

/** 2-second hold duration in milliseconds */
const HOLD_DURATION_MS = 2000;

/** Max characters for final actions field */
const FINAL_ACTIONS_MAX = 120;

// ---------------------------------------------------------------------------
// State
// ---------------------------------------------------------------------------

let _holdInterval = null;
let _holdStart = null;
let _holdActive = false;

/** Current form values */
const form = {
  name: '',
  targetId: null,
  targetType: null,
  method: null,
  time: '',
  finalActions: '',
};

// ---------------------------------------------------------------------------
// HTML Template
// ---------------------------------------------------------------------------

function buildNotebookHTML() {
  const gameState = getGameState();
  const characters = gameState?.characters || CHARACTERS;
  const aliveCharacters = Object.entries(characters).filter(([_, c]) => c.isAlive !== false);

  return `
  <main id="notebook-screen" class="notebook-screen hidden screen" aria-label="The Null Book">

    <!-- Top Bar -->
    <header class="notebook__topbar">
      <button id="notebook-back-btn" class="notebook__back-btn" aria-label="Return to dashboard">
        ← Dashboard
      </button>
      <h1 class="notebook__title" aria-label="Null Book">THE LEDGER</h1>
      <div class="notebook__meta-info">
        <span class="notebook__lifespan" id="notebook-lifespan" title="Remaining natural lifespan">
          ⏳ ${gameState?.lifespanDays || 9847}d
        </span>
        <span class="notebook__kill-count" id="notebook-kill-count" aria-live="polite">
          ${gameState?.totalLedgerEntries || 0} entries
        </span>
      </div>
    </header>

    <!-- The Book Panel -->
    <div class="null-book" role="form" aria-label="Ledger entry form">
      <div class="null-book__form">

        <!-- ── Target Quick Pick ── -->
        <section class="target-select-section">
          <label class="book__section-label" for="target-dossier-select">
            Known World Targets <span style="opacity:0.4; font-weight:400">(select or write manually below)</span>
          </label>
          <select id="target-dossier-select" class="field-select">
            <option value="">— Select a dossier target (optional) —</option>
            ${aliveCharacters.map(([id, c]) => `
              <option value="${id}">${escapeHTML(c.name)} (${escapeHTML(c.role)})</option>
            `).join('')}
          </select>
        </section>

        <!-- ── Name Input ── -->
        <section class="name-input-block" aria-labelledby="name-section-label">
          <label class="book__section-label" id="name-section-label" for="target-name-input">
            True Legal Name
          </label>
          <div class="name-input-wrapper" id="name-input-wrapper">
            <input
              type="text"
              id="target-name-input"
              class="name-input"
              placeholder="Write a name…"
              maxlength="80"
              autocomplete="off"
              autocorrect="off"
              spellcheck="false"
              aria-required="true"
              aria-describedby="name-field-error"
            >
            <div class="name-input-underline" aria-hidden="true"></div>
            <div class="name-input-inkdrop" aria-hidden="true"></div>
          </div>
          <span id="name-field-error" class="field-error-msg" role="alert" aria-live="polite">
            A legal name must be written in the Ledger.
          </span>
        </section>

        <!-- ── Target Profile / Identity Confirm ── -->
        <section class="identity-panel" aria-labelledby="identity-section-label">
          <div class="book__section-label" id="identity-section-label">Target Profile</div>
          <div class="identity-chips" role="group" aria-label="Target type selection" id="identity-chips">
            ${TARGET_TYPES.map(t => `
              <button
                class="identity-chip ${t.chipClass}"
                data-type="${t.key}"
                type="button"
                aria-pressed="false"
                title="${t.desc}"
                id="chip-${t.key}"
              >
                ${t.label}
              </button>
            `).join('')}
          </div>
          <div class="identity-preview" id="identity-preview" aria-live="polite">
            <strong id="identity-preview-range">—</strong>
            <span id="identity-preview-text">crime index impact expected</span>
          </div>
          <span id="type-field-error" class="field-error-msg" role="alert" aria-live="polite">
            Select or verify a target profile.
          </span>
        </section>

        <!-- ── Cause of Death ── -->
        <section class="cause-selector" aria-labelledby="cause-section-label">
          <div class="book__section-label" id="cause-section-label">Cause of Death</div>
          <div class="cause-options" role="group" aria-label="Kill method selection" id="cause-options">
            ${KILL_METHODS.map(m => `
              <button
                class="cause-option"
                data-method="${m.key}"
                type="button"
                aria-pressed="false"
                id="method-${m.key}"
              >
                <span class="cause-option__risk cause-option__risk--${m.risk}" aria-label="Risk level: ${m.riskLabel}">
                  ${m.riskLabel}
                </span>
                <span class="cause-option__icon" aria-hidden="true">${m.icon}</span>
                <span class="cause-option__name">${m.name}</span>
                <span class="cause-option__desc">${m.desc}</span>
              </button>
            `).join('')}
          </div>
          <span id="method-field-error" class="field-error-msg" role="alert" aria-live="polite">
            Cause of death must be specified.
          </span>
        </section>

        <!-- ── Time & Final Actions ── -->
        <section aria-labelledby="details-section-label">
          <div class="book__section-label" id="details-section-label">Details</div>
          <div class="details-row">
            <!-- Time of death -->
            <div class="field-block" id="field-time">
              <label class="field-label" for="time-of-death-input">Time of Death</label>
              <input
                type="text"
                id="time-of-death-input"
                class="field-input"
                placeholder="40s default, or e.g. 23:41"
                maxlength="15"
                autocomplete="off"
                aria-label="Time of death (optional)"
              >
            </div>
            <!-- Final actions -->
            <div class="field-block" id="field-final-actions">
              <label class="field-label" for="final-actions-input">
                Final Actions <span style="opacity:0.4; font-weight:400">(optional)</span>
              </label>
              <textarea
                id="final-actions-input"
                class="field-textarea"
                placeholder="Specific instructions before expiry (e.g., 'releases ledger files to press')…"
                maxlength="${FINAL_ACTIONS_MAX}"
                aria-label="Final actions before death (optional)"
              ></textarea>
              <span class="field-char-count" id="final-actions-count" aria-live="polite">
                0 / ${FINAL_ACTIONS_MAX}
              </span>
            </div>
          </div>
        </section>

        <!-- ── Lifespan Cost Warning ── -->
        <div class="ledger-cost-notice" id="ledger-cost-notice">
          ⚠️ <strong>Cost:</strong> Each entry permanently costs 3–14 days of lifespan. Consequences cascade across the world.
        </div>

        <!-- ── Write Name Button ── -->
        <section class="write-name-section" aria-labelledby="write-section-label">
          <span id="write-section-label" class="write-name-hint" aria-live="polite">
            Hold for 2 seconds to seal the entry in ink
          </span>
          <button
            id="write-name-btn"
            class="write-name-btn disabled"
            type="button"
            aria-label="Hold for 2 seconds to write name and confirm entry"
            disabled
          >
            <div class="write-name-btn__fill" id="write-btn-fill" aria-hidden="true"></div>
            <span class="write-name-btn__label" id="write-btn-label">WRITE NAME</span>
          </button>
          <div class="hold-timer-display" id="hold-timer-display" aria-live="polite"></div>
        </section>

      </div><!-- /.null-book__form -->
    </div><!-- /.null-book -->

  </main><!-- /#notebook-screen -->

  <!-- ── Ink Spread Overlay ── -->
  <div id="ink-overlay" class="ink-overlay" aria-hidden="true" role="presentation">
    <div class="ink-blot" aria-hidden="true"></div>
    <div class="ink-name-flash" id="ink-name-flash" aria-hidden="true"></div>
    <p class="ink-void-line" id="ink-void-line"></p>
  </div>

  <!-- ── Processing Toast ── -->
  <div id="notebook-processing" class="notebook-processing" role="status" aria-live="assertive">
    <div class="processing-dot"></div>
    <div class="processing-dot"></div>
    <div class="processing-dot"></div>
    <span>Simulating world advancement…</span>
  </div>

  <!-- ── Error Toast ── -->
  <div id="notebook-error-toast" class="notebook-error-toast" role="alert" aria-live="assertive"></div>
  `;
}

// ---------------------------------------------------------------------------
// DOM Helpers & Validation
// ---------------------------------------------------------------------------

function el(id) {
  return document.getElementById(id);
}

function isFormValid() {
  return (
    form.name.trim().length > 0 &&
    form.targetType !== null &&
    form.method !== null
  );
}

function validateAndHighlight() {
  let valid = true;

  const nameBlock = el('target-name-input')?.closest('.name-input-block');
  if (!form.name.trim()) {
    nameBlock?.classList.add('field-block--error');
    if (el('name-field-error')) el('name-field-error').style.opacity = '1';
    valid = false;
  } else {
    nameBlock?.classList.remove('field-block--error');
    if (el('name-field-error')) el('name-field-error').style.opacity = '0';
  }

  if (!form.targetType) {
    if (el('type-field-error')) el('type-field-error').style.opacity = '1';
    valid = false;
  } else {
    if (el('type-field-error')) el('type-field-error').style.opacity = '0';
  }

  if (!form.method) {
    if (el('method-field-error')) el('method-field-error').style.opacity = '1';
    valid = false;
  } else {
    if (el('method-field-error')) el('method-field-error').style.opacity = '0';
  }

  return valid;
}

function updateWriteButton() {
  const btn = el('write-name-btn');
  if (!btn) return;

  if (isFormValid()) {
    btn.disabled = false;
    btn.classList.remove('disabled');
  } else {
    btn.disabled = true;
    btn.classList.add('disabled');
  }
}

// ---------------------------------------------------------------------------
// Binding Functions
// ---------------------------------------------------------------------------

function bindTargetDossierSelect() {
  const select = el('target-dossier-select');
  if (!select) return;

  select.addEventListener('change', () => {
    const charId = select.value;
    const gameState = getGameState();
    const characters = gameState?.characters || CHARACTERS;

    if (charId && characters[charId]) {
      const char = characters[charId];
      form.name = char.name;
      form.targetId = charId;
      form.targetType = char.targetType || 'syndicate_leader';

      // Update name input field
      const nameInput = el('target-name-input');
      if (nameInput) {
        nameInput.value = char.name;
        el('name-input-wrapper')?.classList.add('has-value');
      }

      // Highlight corresponding type chip
      document.querySelectorAll('.identity-chip').forEach(c => {
        const matches = c.dataset.type === form.targetType;
        c.classList.toggle('identity-chip--selected', matches);
        c.setAttribute('aria-pressed', matches ? 'true' : 'false');
      });

      // Update preview
      const preview = el('identity-preview');
      const previewRange = el('identity-preview-range');
      const previewText = el('identity-preview-text');
      if (preview && previewRange && previewText) {
        previewRange.textContent = `${char.name} (${char.role})`;
        previewText.textContent = char.crimeImpact
          ? `Faction: ${char.factionId || 'Independent'}`
          : 'crime index impact expected';
        preview.classList.add('visible');
      }
    } else {
      form.targetId = null;
    }
    updateWriteButton();
  });
}

function bindNameInput() {
  const input = el('target-name-input');
  const wrapper = el('name-input-wrapper');
  if (!input) return;

  input.addEventListener('input', () => {
    form.name = input.value;
    wrapper?.classList.toggle('has-value', form.name.trim().length > 0);

    // Auto-match known character by name if exact or close match
    const gameState = getGameState();
    const characters = gameState?.characters || CHARACTERS;
    const match = Object.entries(characters).find(
      ([_, c]) => c.name.toLowerCase() === form.name.trim().toLowerCase()
    );

    if (match) {
      form.targetId = match[0];
      if (!form.targetType) {
        form.targetType = match[1].targetType;
        document.querySelectorAll('.identity-chip').forEach(c => {
          c.classList.toggle('identity-chip--selected', c.dataset.type === form.targetType);
        });
      }
    } else {
      form.targetId = null;
    }

    updateWriteButton();
  });
}

function bindIdentityChips() {
  const chips = document.querySelectorAll('.identity-chip');
  const preview = el('identity-preview');
  const previewRange = el('identity-preview-range');
  const previewText = el('identity-preview-text');

  chips.forEach(chip => {
    chip.addEventListener('click', () => {
      const typeKey = chip.dataset.type;
      form.targetType = typeKey;

      chips.forEach(c => c.setAttribute('aria-pressed', 'false'));
      chip.setAttribute('aria-pressed', 'true');

      chips.forEach(c => c.classList.remove('identity-chip--selected'));
      chip.classList.add('identity-chip--selected');

      const typeMeta = TARGET_TYPES.find(t => t.key === typeKey);
      if (typeMeta && previewRange && previewText) {
        previewRange.textContent = typeMeta.crimePreview;
        previewText.textContent = 'crime index reduction expected';
        preview?.classList.add('visible');
      }

      updateWriteButton();
    });
  });
}

function bindCauseOptions() {
  const options = document.querySelectorAll('.cause-option');

  options.forEach(opt => {
    opt.addEventListener('click', () => {
      const method = opt.dataset.method;
      form.method = method;

      options.forEach(o => {
        o.classList.remove('cause-option--selected');
        o.setAttribute('aria-pressed', 'false');
      });
      opt.classList.add('cause-option--selected');
      opt.setAttribute('aria-pressed', 'true');

      updateWriteButton();
    });
  });
}

function bindTimeInput() {
  const input = el('time-of-death-input');
  input?.addEventListener('input', () => {
    form.time = input.value;
  });
}

function bindFinalActionsInput() {
  const textarea = el('final-actions-input');
  const counter = el('final-actions-count');
  if (!textarea || !counter) return;

  textarea.addEventListener('input', () => {
    form.finalActions = textarea.value;
    const len = textarea.value.length;
    counter.textContent = `${len} / ${FINAL_ACTIONS_MAX}`;
    counter.classList.toggle('near-limit', len >= FINAL_ACTIONS_MAX * 0.85);
  });
}

// ---------------------------------------------------------------------------
// Hold button mechanic — 2-second press to confirm
// ---------------------------------------------------------------------------

function bindWriteNameButton() {
  const btn = el('write-name-btn');
  const fill = el('write-btn-fill');
  const label = el('write-btn-label');
  const timerDisplay = el('hold-timer-display');
  if (!btn) return;

  function startHold(e) {
    e.preventDefault();
    if (btn.disabled || btn.classList.contains('disabled')) return;
    if (!validateAndHighlight()) return;

    _holdActive = true;
    _holdStart = Date.now();
    btn.classList.add('holding');
    timerDisplay?.classList.add('visible');

    _holdInterval = setInterval(() => {
      const elapsed = Date.now() - _holdStart;
      const progress = Math.min(elapsed / HOLD_DURATION_MS, 1);

      if (fill) fill.style.width = `${progress * 100}%`;

      const remaining = Math.max(0, HOLD_DURATION_MS - elapsed);
      if (timerDisplay) {
        timerDisplay.textContent = remaining > 50
          ? `Hold ${(remaining / 1000).toFixed(1)}s…`
          : '';
      }

      if (progress >= 1) {
        releaseHold(true);
      }
    }, 16);
  }

  function cancelHold() {
    if (!_holdActive) return;
    _holdActive = false;
    clearInterval(_holdInterval);
    _holdInterval = null;
    btn.classList.remove('holding');
    if (fill) fill.style.width = '0%';
    if (timerDisplay) {
      timerDisplay.textContent = '';
      timerDisplay.classList.remove('visible');
    }
  }

  function releaseHold(completed = false) {
    clearInterval(_holdInterval);
    _holdInterval = null;
    _holdActive = false;
    btn.classList.remove('holding');
    if (timerDisplay) {
      timerDisplay.textContent = '';
      timerDisplay.classList.remove('visible');
    }

    if (completed) {
      btn.disabled = true;
      btn.classList.add('loading');
      if (label) label.textContent = 'Sealing In Ink…';
      if (fill) fill.style.width = '100%';
      onKillConfirmed();
    } else {
      if (fill) {
        fill.style.transition = `width ${HOLD_DURATION_MS * 0.3}ms ease-out`;
        fill.style.width = '0%';
        setTimeout(() => { if (fill) fill.style.transition = 'none'; }, HOLD_DURATION_MS * 0.3);
      }
    }
  }

  btn.addEventListener('mousedown', startHold);
  btn.addEventListener('mouseup', () => cancelHold());
  btn.addEventListener('mouseleave', () => cancelHold());
  btn.addEventListener('touchstart', startHold, { passive: false });
  btn.addEventListener('touchend', () => cancelHold());
  btn.addEventListener('touchcancel', () => cancelHold());
}

// ---------------------------------------------------------------------------
// onKillConfirmed — Central Action Execution
// ---------------------------------------------------------------------------

async function onKillConfirmed() {
  const btn = el('write-name-btn');
  const processing = el('notebook-processing');

  const kill = {
    targetName: form.name.trim(),
    targetId: form.targetId || null,
    targetType: form.targetType || 'petty_criminal',
    cause: form.method || 'cardiac',
    finalActions: form.finalActions.trim() || null,
    timeOfDeath: form.time.trim() || null,
  };

  processing?.classList.add('visible');

  try {
    const gameState = getGameState();
    if (!gameState) {
      throw new Error('Game state not initialized.');
    }

    // 1. Authoritative resolution through actionEngine
    const rng = getRNG();
    const actionResult = resolveAction(ACTION_TYPES.LEDGER_ENTRY, kill, gameState, rng);

    if (!actionResult.success) {
      throw new Error(actionResult.errors?.join(' ') || 'The Ledger rejected the entry.');
    }

    // 2. Identify primary event for narrative generation
    const primaryEvent = actionResult.events.find(e => e.type === EVENT_TYPES.DEATH)
      || actionResult.events.find(e => e.type === EVENT_TYPES.LEDGER_ENTRY)
      || actionResult.events[0];

    // 3. Narrative generation (Gemini provider if configured, otherwise deterministic fallback)
    let narrative = null;
    if (primaryEvent) {
      try {
        const narrativeContext = buildNarrativeContext(gameState, primaryEvent);
        narrative = await requestNarrative('newsArticle', narrativeContext, {
          provider: geminiProvider,
          timeout: 8000,
          rng,
        });

        if (narrative) {
          const newsItem = {
            headline: narrative.headline,
            detail: narrative.detail,
            source: narrative.source || 'Breaking Intelligence',
            timestamp: 'just now',
            watcherLine: narrative.watcherLine,
            agencyPublicMove: narrative.agencyPublicMove,
            turn: gameState.turn,
          };
          if (!gameState.newsFeed) gameState.newsFeed = [];
          gameState.newsFeed.unshift(newsItem);
          if (gameState.newsFeed.length > 25) gameState.newsFeed.pop();
        }
      } catch (narErr) {
        console.warn('[Notebook] Narrative generation skipped/failed:', narErr.message);
      }
    }

    // 4. Update agency statuses
    updateAllAgencyStatuses(gameState);

    // 5. Persist authoritative game state
    saveGame();
    window.gameState = gameState;

    // 6. Notify the application
    window.dispatchEvent(new CustomEvent('null:kill-complete', {
      detail: { actionResult, narrative, timestamp: Date.now() }
    }));

    // 7. Play Ink Animation with the Watcher's observation line
    processing?.classList.remove('visible');
    const voidLine = narrative?.watcherLine || 'The name is written. A thread snaps in the dark.';
    await playInkAnimation(kill.targetName, voidLine);

  } catch (err) {
    console.error('[Notebook] Kill flow error:', err);
    processing?.classList.remove('visible');
    showError(err.message?.slice(0, 100) || 'Supernatural rule violation.');

    if (btn) {
      btn.disabled = false;
      btn.classList.remove('loading', 'disabled');
      const label = btn.querySelector('.write-name-btn__label');
      if (label) label.textContent = 'WRITE NAME';
      const fill = el('write-btn-fill');
      if (fill) fill.style.width = '0%';
    }
  }
}

// ---------------------------------------------------------------------------
// Ink spread animation & Navigation
// ---------------------------------------------------------------------------

function playInkAnimation(targetName, voidLine) {
  return new Promise((resolve) => {
    const overlay = el('ink-overlay');
    const nameFlash = el('ink-name-flash');
    const voidEl = el('ink-void-line');

    if (!overlay) {
      setTimeout(redirectToDashboard, 300);
      resolve();
      return;
    }

    if (nameFlash) nameFlash.textContent = targetName;
    if (voidEl) voidEl.textContent = voidLine;

    overlay.setAttribute('aria-hidden', 'false');
    overlay.classList.add('active');

    setTimeout(() => {
      resolve();
      redirectToDashboard();
    }, 2200);
  });
}

function redirectToDashboard() {
  const notebookScreen = el('notebook-screen');
  const dashboardScreen = el('dashboard-screen');
  const inkOverlay = el('ink-overlay');

  if (dashboardScreen && notebookScreen) {
    if (inkOverlay) {
      inkOverlay.style.opacity = '0';
      inkOverlay.style.transition = 'opacity 0.4s ease-out';
      setTimeout(() => {
        inkOverlay.classList.remove('active');
        inkOverlay.removeAttribute('style');
        inkOverlay.setAttribute('aria-hidden', 'true');
      }, 400);
    }

    setTimeout(() => {
      notebookScreen.classList.add('hidden');
      dashboardScreen.classList.remove('hidden');

      // Refresh dashboard
      if (typeof window.initDashboard === 'function') {
        window.initDashboard();
      }
    }, 400);
  } else {
    window.location.hash = '#dashboard';
    window.location.reload();
  }
}

function showNotebook() {
  const notebookScreen = el('notebook-screen');
  const dashboardScreen = el('dashboard-screen');
  const intelScreen = el('intel-screen');
  const companionScreen = el('companion-screen');
  const voidScreen = el('void-screen');

  [dashboardScreen, intelScreen, companionScreen, voidScreen].forEach(s => s?.classList.add('hidden'));

  if (notebookScreen) {
    notebookScreen.classList.remove('hidden');
    notebookScreen.style.animation = 'none';
    void notebookScreen.offsetWidth;
    notebookScreen.style.animation = '';
  }

  resetForm();
  updateKillCount();
  refreshTargetSelect();
}

function refreshTargetSelect() {
  const select = el('target-dossier-select');
  if (!select) return;
  const gameState = getGameState();
  const characters = gameState?.characters || CHARACTERS;
  const aliveCharacters = Object.entries(characters).filter(([_, c]) => c.isAlive !== false);

  select.innerHTML = `
    <option value="">— Select a dossier target (optional) —</option>
    ${aliveCharacters.map(([id, c]) => `
      <option value="${id}">${escapeHTML(c.name)} (${escapeHTML(c.role)})</option>
    `).join('')}
  `;
}

function resetForm() {
  form.name = '';
  form.targetId = null;
  form.targetType = null;
  form.method = null;
  form.time = '';
  form.finalActions = '';

  const nameInput = el('target-name-input');
  if (nameInput) nameInput.value = '';

  const wrapper = el('name-input-wrapper');
  wrapper?.classList.remove('has-value');

  const select = el('target-dossier-select');
  if (select) select.value = '';

  document.querySelectorAll('.identity-chip').forEach(c => {
    c.classList.remove('identity-chip--selected');
    c.setAttribute('aria-pressed', 'false');
  });

  el('identity-preview')?.classList.remove('visible');

  document.querySelectorAll('.cause-option').forEach(o => {
    o.classList.remove('cause-option--selected');
    o.setAttribute('aria-pressed', 'false');
  });

  const timeInput = el('time-of-death-input');
  if (timeInput) timeInput.value = '';

  const finalActionsTextarea = el('final-actions-input');
  if (finalActionsTextarea) finalActionsTextarea.value = '';

  const charCount = el('final-actions-count');
  if (charCount) charCount.textContent = `0 / ${FINAL_ACTIONS_MAX}`;

  const btn = el('write-name-btn');
  if (btn) {
    btn.disabled = true;
    btn.classList.add('disabled');
    btn.classList.remove('loading', 'holding');
    const label = btn.querySelector('.write-name-btn__label');
    if (label) label.textContent = 'WRITE NAME';
  }

  const fill = el('write-btn-fill');
  if (fill) {
    fill.style.transition = 'none';
    fill.style.width = '0%';
  }

  [el('name-field-error'), el('type-field-error'), el('method-field-error')].forEach(e => {
    if (e) e.style.opacity = '0';
  });

  updateKillCount();
}

function updateKillCount() {
  const gameState = getGameState();
  const countEl = el('notebook-kill-count');
  const lifespanEl = el('notebook-lifespan');

  if (countEl && gameState) {
    const n = gameState.totalLedgerEntries || gameState.totalKills || 0;
    countEl.textContent = `${n} ${n === 1 ? 'entry' : 'entries'}`;
  }
  if (lifespanEl && gameState) {
    lifespanEl.textContent = `⏳ ${gameState.lifespanDays || 0}d`;
  }
}

function showError(message) {
  const toast = el('notebook-error-toast');
  if (!toast) return;
  toast.textContent = message;
  toast.classList.add('visible');
  setTimeout(() => toast.classList.remove('visible'), 5000);
}

function bindBackButton() {
  const backBtn = el('notebook-back-btn');
  backBtn?.addEventListener('click', redirectToDashboard);
}

// ---------------------------------------------------------------------------
// Initialization
// ---------------------------------------------------------------------------

function injectNotebookHTML() {
  if (el('notebook-screen')) return;

  const container = document.createElement('div');
  container.innerHTML = buildNotebookHTML();
  document.body.appendChild(container.querySelector('#notebook-screen'));

  if (!el('ink-overlay')) {
    document.body.appendChild(container.querySelector('#ink-overlay'));
  }
  if (!el('notebook-processing')) {
    document.body.appendChild(container.querySelector('#notebook-processing'));
  }
  if (!el('notebook-error-toast')) {
    document.body.appendChild(container.querySelector('#notebook-error-toast'));
  }
}

function initNotebook() {
  injectNotebookHTML();

  bindTargetDossierSelect();
  bindNameInput();
  bindIdentityChips();
  bindCauseOptions();
  bindTimeInput();
  bindFinalActionsInput();
  bindWriteNameButton();
  bindBackButton();

  const navNotebookBtn = el('nav-notebook');
  navNotebookBtn?.addEventListener('click', showNotebook);

  window.addEventListener('null:kill-complete', () => {
    updateKillCount();
  });

  updateKillCount();
}

if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', initNotebook);
} else {
  initNotebook();
}

export { initNotebook, showNotebook, redirectToDashboard };
