// ============================================================================
// NULL — Null Book Screen
// GDD Section 5.2 — Screen 2: The Null Book
// GDD Section 2.3 — Kill System
//
// Responsibility:
//   Renders the Null Book UI — name input, identity panel, cause of death
//   selector, time & final actions fields, and the WRITE NAME hold button.
//   On hold-complete: calls geminiEngine.worldReactionPrompt / callGemini,
//   validates + applies the world reaction delta, saves to localStorage,
//   plays the ink-spread animation, then redirects to dashboard.
// ============================================================================

import { callGemini, buildWorldReactionPrompt, applyWorldReaction, validateWorldReaction } from '../engine/geminiEngine.js';
import { getGameState, saveGame, getRunHistory, clamp } from '../engine/gameState.js';
import { updateAllAgencyStatuses } from '../engine/agencyEngine.js';

// ---------------------------------------------------------------------------
// Constants — GDD 2.3
// ---------------------------------------------------------------------------

/** Kill methods — maps method key → display metadata */
const KILL_METHODS = [
  {
    key: 'heartAttack',
    name: 'Heart Attack',
    icon: '♡',
    desc: 'Silent. Untraceable. The heart simply stops.',
    risk: 'low',
    riskLabel: 'Low Risk',
  },
  {
    key: 'accident',
    name: 'Accident',
    icon: '⚡',
    desc: 'Staged misfortune. Plausible, if imperfect.',
    risk: 'med',
    riskLabel: 'Med Risk',
  },
  {
    key: 'publicDeath',
    name: 'Public Death',
    icon: '◉',
    desc: 'Visible. Unmistakable. The city will see.',
    risk: 'high',
    riskLabel: 'High Risk',
  },
  {
    key: 'manipulated',
    name: 'Manipulated',
    icon: '◈',
    desc: 'Let others do it. Threads remain.',
    risk: 'med',
    riskLabel: 'Med Risk',
  },
];

/** Target types — maps type key → display metadata */
const TARGET_TYPES = [
  {
    key: 'pettyCriminal',
    label: 'Petty Criminal',
    chipClass: 'identity-chip--petty',
    crimePreview: '−0.3 to −1.5',
    desc: 'Low-level offender. Marginal reduction.',
  },
  {
    key: 'corruptOfficial',
    label: 'Corrupt Official',
    chipClass: 'identity-chip--official',
    crimePreview: '−1.5 to −4',
    desc: 'Position abused. Systemic rot, excised.',
  },
  {
    key: 'systemicCriminal',
    label: 'Systemic Criminal',
    chipClass: 'identity-chip--systemic',
    crimePreview: '−3 to −8',
    desc: 'Network-level threat. Significant impact.',
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
  targetType: null,     // pettyCriminal | corruptOfficial | systemicCriminal
  method: null,         // heartAttack | accident | publicDeath | manipulated
  time: '',
  finalActions: '',
};

// ---------------------------------------------------------------------------
// HTML Template — injected into the page
// ---------------------------------------------------------------------------

function buildNotebookHTML() {
  return `
  <main id="notebook-screen" class="notebook-screen hidden screen" aria-label="The Null Book">

    <!-- Top Bar -->
    <header class="notebook__topbar">
      <button id="notebook-back-btn" class="notebook__back-btn" aria-label="Return to dashboard">
        ← Dashboard
      </button>
      <h1 class="notebook__title" aria-label="Null Book">NULL BOOK</h1>
      <span class="notebook__kill-count" id="notebook-kill-count" aria-live="polite">0 entries</span>
    </header>

    <!-- The Book Panel -->
    <div class="null-book" role="form" aria-label="Kill entry form">
      <div class="null-book__form">

        <!-- ── Name Input ── -->
        <section class="name-input-block" aria-labelledby="name-section-label">
          <label class="book__section-label" id="name-section-label" for="target-name-input">
            Name
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
            A name must be written.
          </span>
        </section>

        <!-- ── Identity Confirm ── -->
        <section class="identity-panel" aria-labelledby="identity-section-label">
          <div class="book__section-label" id="identity-section-label">Identity</div>
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
            crime rate reduction expected
          </div>
          <span id="type-field-error" class="field-error-msg" role="alert" aria-live="polite">
            Select a target type.
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
                placeholder="e.g. 23:41"
                maxlength="10"
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
                placeholder="What were they doing when it happened…"
                maxlength="${FINAL_ACTIONS_MAX}"
                aria-label="Final actions before death (optional)"
              ></textarea>
              <span class="field-char-count" id="final-actions-count" aria-live="polite">
                0 / ${FINAL_ACTIONS_MAX}
              </span>
            </div>
          </div>
        </section>

        <!-- ── Write Name Button ── -->
        <section class="write-name-section" aria-labelledby="write-section-label">
          <span id="write-section-label" class="write-name-hint" aria-live="polite">
            Hold to confirm the entry
          </span>
          <button
            id="write-name-btn"
            class="write-name-btn disabled"
            type="button"
            aria-label="Hold for 2 seconds to write name and confirm kill"
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
    <span>World reacting…</span>
  </div>

  <!-- ── Error Toast ── -->
  <div id="notebook-error-toast" class="notebook-error-toast" role="alert" aria-live="assertive"></div>
  `;
}

// ---------------------------------------------------------------------------
// DOM helpers
// ---------------------------------------------------------------------------

function el(id) {
  return document.getElementById(id);
}

// ---------------------------------------------------------------------------
// Validation
// ---------------------------------------------------------------------------

/** Returns true if all required fields are valid */
function isFormValid() {
  return (
    form.name.trim().length > 0 &&
    form.targetType !== null &&
    form.method !== null
  );
}

/**
 * Runs validation, highlights errors, returns true if valid.
 */
function validateAndHighlight() {
  let valid = true;

  // Name
  const nameBlock = el('target-name-input')?.closest('.name-input-block');
  if (!form.name.trim()) {
    nameBlock?.classList.add('field-block--error');  // shows the error msg via CSS
    el('name-field-error')?.style && (el('name-field-error').style.opacity = '1');
    valid = false;
  } else {
    nameBlock?.classList.remove('field-block--error');
    if (el('name-field-error')) el('name-field-error').style.opacity = '0';
  }

  // Type
  if (!form.targetType) {
    el('type-field-error')?.style && (el('type-field-error').style.opacity = '1');
    valid = false;
  } else {
    if (el('type-field-error')) el('type-field-error').style.opacity = '0';
  }

  // Method
  if (!form.method) {
    el('method-field-error')?.style && (el('method-field-error').style.opacity = '1');
    valid = false;
  } else {
    if (el('method-field-error')) el('method-field-error').style.opacity = '0';
  }

  return valid;
}

// ---------------------------------------------------------------------------
// Button enablement
// ---------------------------------------------------------------------------

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
// Name input events
// ---------------------------------------------------------------------------

function bindNameInput() {
  const input = el('target-name-input');
  const wrapper = el('name-input-wrapper');

  input.addEventListener('input', () => {
    form.name = input.value;
    wrapper.classList.toggle('has-value', form.name.trim().length > 0);
    updateWriteButton();
  });
}

// ---------------------------------------------------------------------------
// Identity chips
// ---------------------------------------------------------------------------

function bindIdentityChips() {
  const chips = document.querySelectorAll('.identity-chip');
  const preview = el('identity-preview');
  const previewRange = el('identity-preview-range');

  chips.forEach(chip => {
    chip.addEventListener('click', () => {
      const typeKey = chip.dataset.type;
      form.targetType = typeKey;

      // Update aria-pressed
      chips.forEach(c => c.setAttribute('aria-pressed', 'false'));
      chip.setAttribute('aria-pressed', 'true');

      // Update chip selected style — remove all, add to clicked
      chips.forEach(c => c.classList.remove('identity-chip--selected'));
      chip.classList.add('identity-chip--selected');

      // Show preview
      const typeMeta = TARGET_TYPES.find(t => t.key === typeKey);
      if (typeMeta && previewRange) {
        previewRange.textContent = typeMeta.crimePreview;
        preview?.classList.add('visible');
      }

      updateWriteButton();
    });
  });
}

// ---------------------------------------------------------------------------
// Cause of death options
// ---------------------------------------------------------------------------

function bindCauseOptions() {
  const options = document.querySelectorAll('.cause-option');

  options.forEach(opt => {
    opt.addEventListener('click', () => {
      const method = opt.dataset.method;
      form.method = method;

      // Update all options
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

// ---------------------------------------------------------------------------
// Time input
// ---------------------------------------------------------------------------

function bindTimeInput() {
  const input = el('time-of-death-input');
  input.addEventListener('input', () => {
    form.time = input.value;
  });
}

// ---------------------------------------------------------------------------
// Final actions textarea
// ---------------------------------------------------------------------------

function bindFinalActionsInput() {
  const textarea = el('final-actions-input');
  const counter = el('final-actions-count');

  textarea.addEventListener('input', () => {
    form.finalActions = textarea.value;
    const len = textarea.value.length;
    counter.textContent = `${len} / ${FINAL_ACTIONS_MAX}`;
    counter.classList.toggle('near-limit', len >= FINAL_ACTIONS_MAX * 0.85);
  });
}

// ---------------------------------------------------------------------------
// Hold button mechanic — 2-second press to confirm
// GDD 5.3: "WRITE NAME requires 2s hold to prevent accidents"
// ---------------------------------------------------------------------------

function bindWriteNameButton() {
  const btn = el('write-name-btn');
  const fill = el('write-btn-fill');
  const label = el('write-btn-label');
  const timerDisplay = el('hold-timer-display');

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

      // Update fill
      if (fill) fill.style.width = `${progress * 100}%`;

      // Update timer display
      const remaining = Math.max(0, HOLD_DURATION_MS - elapsed);
      if (timerDisplay) {
        timerDisplay.textContent = remaining > 50
          ? `Hold ${(remaining / 1000).toFixed(1)}s…`
          : '';
      }

      if (progress >= 1) {
        releaseHold(true);
      }
    }, 16); // ~60fps
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
      // Immediately disable to prevent double-fire
      btn.disabled = true;
      btn.classList.add('loading');
      if (label) label.textContent = 'Processing';
      if (fill) fill.style.width = '100%';
      onKillConfirmed();
    } else {
      // Animate fill back to 0
      if (fill) {
        fill.style.transition = `width ${HOLD_DURATION_MS * 0.3}ms ease-out`;
        fill.style.width = '0%';
        setTimeout(() => { if (fill) fill.style.transition = 'none'; }, HOLD_DURATION_MS * 0.3);
      }
    }
  }

  // Mouse events
  btn.addEventListener('mousedown', startHold);
  btn.addEventListener('mouseup', () => cancelHold());
  btn.addEventListener('mouseleave', () => cancelHold());

  // Touch events (mobile)
  btn.addEventListener('touchstart', startHold, { passive: false });
  btn.addEventListener('touchend', () => cancelHold());
  btn.addEventListener('touchcancel', () => cancelHold());
}

// ---------------------------------------------------------------------------
// onKillConfirmed — core kill flow
// ---------------------------------------------------------------------------

async function onKillConfirmed() {
  const btn = el('write-name-btn');
  const processing = el('notebook-processing');

  // Build the kill object from form state
  const kill = {
    targetName: form.name.trim(),
    targetType: form.targetType,
    method: form.method,
    finalActions: form.finalActions.trim() || null,
    timeOfDeath: form.time.trim() || null,
  };

  // Show processing toast
  processing?.classList.add('visible');

  try {
    // Get live game state — fall back to a minimal stub if not initialized yet
    const gameState = getGameState() || _createFallbackState();

    // Build prompt with compound memory if available
    const runHistory = getRunHistory();
    const prompt = buildWorldReactionPrompt(gameState, kill, runHistory);

    // Call Gemini
    const reaction = await callGemini(prompt);

    // Validate
    const { valid, errors } = validateWorldReaction(reaction, gameState);
    if (!valid) {
      console.warn('[Notebook] Validation warnings:', errors);
      // Continue — soft errors are already clamped inside validateWorldReaction
    }

    // Apply deltas to game state
    applyWorldReaction(gameState, reaction, kill, clamp);

    // Recalculate agency statuses after suspicion deltas are applied
    const agencyChanges = updateAllAgencyStatuses(gameState);
    if (agencyChanges.anyEscalation) {
      console.log('[Notebook] Agency escalations:', agencyChanges.changes);
    }

    // Persist
    saveGame();

    // FIX 7: Sync window.gameState reference so dashboard re-render reads fresh data
    window.gameState = getGameState();

    // FIX 7: Notify dashboard to re-render before ink animation starts
    window.dispatchEvent(new CustomEvent('null:kill-complete'));

    // Play ink animation then redirect
    processing?.classList.remove('visible');
    await playInkAnimation(kill.targetName, reaction.voidLine || '');

  } catch (err) {
    console.error('[Notebook] Kill flow error:', err);
    processing?.classList.remove('visible');
    showError(`World engine unreachable. ${err.message?.slice(0, 80) || 'Unknown error.'}`);

    // Reset button so player can retry
    if (btn) {
      btn.disabled = false;
      btn.classList.remove('loading', 'disabled');
      btn.classList.remove('disabled'); // redundant safety
      btn.querySelector('.write-name-btn__label').textContent = 'WRITE NAME';
      const fill = el('write-btn-fill');
      if (fill) fill.style.width = '0%';
    }
  }
}

/**
 * Creates a minimal fallback game state if initGame hasn't been called.
 * Prevents the notebook from crashing when loaded standalone.
 */
function _createFallbackState() {
  return {
    version: '1.0',
    region: 'india',
    playerName: 'Unknown',
    currentAct: 1,
    currentBeat: 1,
    runNumber: 1,
    crimeRate: 80,
    publicFearIndex: 10,
    egoIndex: 0,
    exposureRisk: 0,
    lifespanDays: 9847,
    agencySuspicion: { CBI: 0, RAW: 0, IB: 0 },
    agencyStatus: { CBI: 'UNAWARE', RAW: 'UNAWARE', IB: 'UNAWARE' },
    agencyDarkMode: false,
    eyesDealActive: false,
    totalKills: 0,
    killMethods: { heartAttack: 0, accident: 0, publicDeath: 0, manipulated: 0 },
    companionAlliance: null,
    phantomBroadcastTriggered: false,
    newsFeed: [],
    killLog: [],
    compoundMemoryEnabled: false,
    lastSavedAt: null,
  };
}

// ---------------------------------------------------------------------------
// Ink spread animation — plays after kill confirmed, before redirect
// ---------------------------------------------------------------------------

function playInkAnimation(targetName, voidLine) {
  return new Promise((resolve) => {
    const overlay = el('ink-overlay');
    const nameFlash = el('ink-name-flash');
    const voidEl = el('ink-void-line');

    if (!overlay) {
      // No overlay? Just redirect immediately
      setTimeout(redirectToDashboard, 300);
      resolve();
      return;
    }

    // Set content
    if (nameFlash) nameFlash.textContent = targetName;
    if (voidEl) voidEl.textContent = voidLine;

    // Activate — triggers CSS animations
    overlay.setAttribute('aria-hidden', 'false');
    overlay.classList.add('active');

    // After animation completes (~2s), redirect
    setTimeout(() => {
      resolve();
      redirectToDashboard();
    }, 2200);
  });
}

// ---------------------------------------------------------------------------
// Navigation
// ---------------------------------------------------------------------------

function redirectToDashboard() {
  // If using a single-page layout, hide notebook and show dashboard
  const notebookScreen = el('notebook-screen');
  const dashboardScreen = el('dashboard-screen');
  const inkOverlay = el('ink-overlay');

  if (dashboardScreen && notebookScreen) {
    // Fade out ink overlay
    if (inkOverlay) {
      inkOverlay.style.opacity = '0';
      inkOverlay.style.transition = 'opacity 0.4s ease-out';
      setTimeout(() => {
        inkOverlay.classList.remove('active');
        inkOverlay.removeAttribute('style');
        inkOverlay.setAttribute('aria-hidden', 'true');
      }, 400);
    }

    // Screen swap
    setTimeout(() => {
      notebookScreen.classList.add('hidden');
      dashboardScreen.classList.remove('hidden');

      // Trigger dashboard re-render with updated game state
      window.dispatchEvent(new CustomEvent('null:kill-complete', {
        detail: { timestamp: Date.now() }
      }));
    }, 400);
  } else {
    // Fallback: hard redirect
    window.location.hash = '#dashboard';
    window.location.reload();
  }
}

function showNotebook() {
  const notebookScreen = el('notebook-screen');
  const dashboardScreen = el('dashboard-screen');

  if (notebookScreen) {
    notebookScreen.classList.remove('hidden');
    notebookScreen.style.animation = 'none';
    // Force reflow, then re-apply
    void notebookScreen.offsetWidth;
    notebookScreen.style.animation = '';
  }
  if (dashboardScreen) {
    dashboardScreen.classList.add('hidden');
  }

  // Reset form for fresh entry
  resetForm();
}

// ---------------------------------------------------------------------------
// Form reset
// ---------------------------------------------------------------------------

function resetForm() {
  // Clear form state
  form.name = '';
  form.targetType = null;
  form.method = null;
  form.time = '';
  form.finalActions = '';

  // Reset DOM
  const nameInput = el('target-name-input');
  if (nameInput) nameInput.value = '';

  const wrapper = el('name-input-wrapper');
  wrapper?.classList.remove('has-value');

  // Deselect all chips
  document.querySelectorAll('.identity-chip').forEach(c => {
    c.classList.remove('identity-chip--selected');
    c.setAttribute('aria-pressed', 'false');
  });

  // Hide preview
  el('identity-preview')?.classList.remove('visible');

  // Deselect all cause options
  document.querySelectorAll('.cause-option').forEach(o => {
    o.classList.remove('cause-option--selected');
    o.setAttribute('aria-pressed', 'false');
  });

  // Reset time & final actions
  const timeInput = el('time-of-death-input');
  if (timeInput) timeInput.value = '';

  const finalActionsTextarea = el('final-actions-input');
  if (finalActionsTextarea) finalActionsTextarea.value = '';

  const charCount = el('final-actions-count');
  if (charCount) charCount.textContent = `0 / ${FINAL_ACTIONS_MAX}`;

  // Reset button
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

  // Clear error states
  [el('name-field-error'), el('type-field-error'), el('method-field-error')].forEach(e => {
    if (e) e.style.opacity = '0';
  });

  // Update kill count from game state
  updateKillCount();
}

function updateKillCount() {
  const gameState = getGameState();
  const countEl = el('notebook-kill-count');
  if (countEl && gameState) {
    const n = gameState.totalKills || 0;
    countEl.textContent = `${n} ${n === 1 ? 'entry' : 'entries'}`;
  }
}

// ---------------------------------------------------------------------------
// Error toast
// ---------------------------------------------------------------------------

function showError(message) {
  const toast = el('notebook-error-toast');
  if (!toast) return;
  toast.textContent = message;
  toast.classList.add('visible');
  setTimeout(() => toast.classList.remove('visible'), 5000);
}

// ---------------------------------------------------------------------------
// Back button
// ---------------------------------------------------------------------------

function bindBackButton() {
  const backBtn = el('notebook-back-btn');
  backBtn?.addEventListener('click', () => {
    redirectToDashboard();
  });
}

// ---------------------------------------------------------------------------
// Initialization
// ---------------------------------------------------------------------------

function injectNotebookHTML() {
  // Check if already injected
  if (el('notebook-screen')) return;

  const container = document.createElement('div');
  container.innerHTML = buildNotebookHTML();
  // Append the main screen element
  document.body.appendChild(container.querySelector('#notebook-screen'));
  // Append the overlays if not already present
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

  // Bind all interactive elements
  bindNameInput();
  bindIdentityChips();
  bindCauseOptions();
  bindTimeInput();
  bindFinalActionsInput();
  bindWriteNameButton();
  bindBackButton();

  // Wire dashboard "Open Notebook" nav button
  const navNotebookBtn = el('nav-notebook');
  navNotebookBtn?.addEventListener('click', showNotebook);

  // Listen for kill-complete events to re-render dashboard
  window.addEventListener('null:kill-complete', () => {
    // Give dashboard a chance to re-render with fresh game state
    if (typeof window.renderStatCards === 'function') {
      const gs = getGameState();
      if (gs) {
        window.renderStatCards(gs);
        window.renderAgencies?.(gs);
        // Prepend latest news item if available
        if (gs.newsFeed?.length > 0 && typeof window.prependNewsItem === 'function') {
          window.prependNewsItem(gs.newsFeed[0]);
        }
      }
    }
  });

  updateKillCount();
}

// ---------------------------------------------------------------------------
// Auto-initialize on DOM ready
// ---------------------------------------------------------------------------

if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', initNotebook);
} else {
  initNotebook();
}

// ---------------------------------------------------------------------------
// Exports
// ---------------------------------------------------------------------------

export { initNotebook, showNotebook, redirectToDashboard };
