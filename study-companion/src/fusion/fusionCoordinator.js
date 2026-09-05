/**
 * FUSION COORDINATOR
 * 
 * Handles the async timing problem: MFCC arrives instantly from the main thread
 * but Whisper + AfriBERTa results arrive later from their workers.
 * 
 * This coordinator holds partial results until both modalities are ready,
 * then triggers the fusion layer and emits a unified emotional state.
 */

import { fuseModalities } from './fusionLayer';

/**
 * Creates a coordinator instance tied to a single recording session.
 * Call createFusionCoordinator() fresh for each new student input.
 * 
 * @param {function} onFusionComplete - Callback fired when both modalities are ready.
 *   Receives: { emotionalState, fusedScore, normalizedText, confidence, sessionId }
 * @param {string} sessionId    - Optional ID to correlate results with a specific input event
 * @param {string} studentInput - The raw student text, used by the bored short-input heuristic
 */
export function createFusionCoordinator(onFusionComplete, sessionId = null, studentInput = '') {
  const state = {
    audioScore:   null,
    textLabel:    null,
    textScore:    null,
    audioReady:   false,
    textReady:    false,
  };

  function setAudioResult(paralinguisticScore) {
    state.audioScore = paralinguisticScore;
    state.audioReady = true;
    console.log(`🎙️ Coordinator [${sessionId}]: Audio result received (${paralinguisticScore.toFixed(3)})`);
    tryFuse();
  }

  function setTextResult(label, score) {
    state.textLabel = label;
    state.textScore = score;
    state.textReady = true;
    console.log(`📝 Coordinator [${sessionId}]: Text result received (${label}, ${score.toFixed(3)})`);
    tryFuse();
  }

  function tryFuse() {
    if (!state.audioReady || !state.textReady) return;

    // Pass studentInput so fusionLayer can apply the short-input bored heuristic
    const result = fuseModalities(
      state.textLabel,
      state.textScore,
      state.audioScore,
      studentInput,
    );

    onFusionComplete({ ...result, sessionId });
  }

  function setAudioFallback() {
    console.warn(`⚠️ Coordinator [${sessionId}]: Using audio fallback (score=0)`);
    setAudioResult(0);
  }

  function setTextFallback() {
    console.warn(`⚠️ Coordinator [${sessionId}]: Using text fallback (neutral, 0.5)`);
    setTextResult('neutral', 0.5);
  }

  return {
    setAudioResult,
    setTextResult,
    setAudioFallback,
    setTextFallback,
  };
}