// ============================================================================
// NULL — Eyes Deal / Challenge Mode Timer
// Master Prompt Section 9: Supernatural Artefact and Lifespan System
//
// Manages the 3-hour active playtime budget timer.
// Persists elapsed time safely across reloads and prevents negative time,
// duplicate intervals, or accidental resets.
// ============================================================================

import { getGameState, saveGame } from './gameState.js';
import { updateChallengeTimer, pauseChallengeTimer, resumeChallengeTimer } from './supernaturalEngine.js';

let _timerInterval = null;

/**
 * Formats seconds into HH:MM:SS.
 * @param {number} totalSeconds
 * @returns {string}
 */
export function formatTime(totalSeconds) {
  const s = Math.max(0, Math.floor(totalSeconds));
  const hours = Math.floor(s / 3600);
  const minutes = Math.floor((s % 3600) / 60);
  const seconds = s % 60;

  const pad = (n) => String(n).padStart(2, '0');
  return `${pad(hours)}:${pad(minutes)}:${pad(seconds)}`;
}

/**
 * Initializes and updates the visual timer element in the DOM.
 */
export function initEyesTimer() {
  const timerEl = document.getElementById('eyes-timer');
  if (!timerEl) return;

  const state = getGameState();
  if (!state || (!state.challengeMode && !state.sightBargainAccepted)) {
    timerEl.style.display = 'none';
    return;
  }

  // Ensure timer object exists on state
  if (!state.challengeTimer) {
    state.challengeTimer = {
      totalSeconds: 3 * 3600,
      elapsedSeconds: 0,
      isRunning: true,
      lastResumedAt: Date.now(),
    };
  } else if (!state.challengeTimer.isRunning) {
    resumeChallengeTimer(state);
  }

  timerEl.style.display = 'flex';
  renderTimerTick(timerEl, state);

  // Clear existing interval
  if (_timerInterval) clearInterval(_timerInterval);

  _timerInterval = setInterval(() => {
    const currentState = getGameState();
    if (!currentState || !currentState.challengeTimer) {
      clearInterval(_timerInterval);
      return;
    }

    renderTimerTick(timerEl, currentState);
  }, 1000);

  // Pause on page unload or visibility change
  document.addEventListener('visibilitychange', () => {
    const curState = getGameState();
    if (!curState) return;
    if (document.hidden) {
      pauseChallengeTimer(curState);
      saveGame();
    } else {
      resumeChallengeTimer(curState);
    }
  });

  if (typeof window !== 'undefined') {
    window.addEventListener('beforeunload', () => {
      const curState = getGameState();
      if (curState) {
        pauseChallengeTimer(curState);
        saveGame();
      }
    });
  }
}

function renderTimerTick(timerEl, state) {
  const result = updateChallengeTimer(state);
  if (!result) return;

  const formatted = formatTime(result.remaining);
  timerEl.innerHTML = `
    <span class="eyes-timer__icon" aria-hidden="true">⏱️</span>
    <span class="eyes-timer__label">${state.sightBargainAccepted ? 'BARGAIN EXPIRES' : 'CHALLENGE TIME'}:</span>
    <span class="eyes-timer__time ${result.remaining < 600 ? 'eyes-timer__time--danger' : ''}">${formatted}</span>
  `;

  if (result.expired) {
    clearInterval(_timerInterval);
    timerEl.classList.add('eyes-timer--expired');
    window.dispatchEvent(new CustomEvent('null:timer-expired'));
  }
}

if (typeof document !== 'undefined') {
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', initEyesTimer);
  } else {
    initEyesTimer();
  }
}
