// ============================================================================
// NULL — World Map / Territory Overview
// Shows regional crime distribution and faction influence.
// ============================================================================

import { getGameState } from '../engine/gameState.js';

export function renderWorldMap() {
  const state = getGameState();
  console.log('[WorldMap] Region overview rendered for turn:', state?.turn);
}

export function initWorldMap() {
  renderWorldMap();
}
