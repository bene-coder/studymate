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
 * @param {string} sessionId - Optional ID to correlate results with a specific input event
 */
export function createFusionCoordinator(onFusionComplete, sessionId = null) {
  // Internal state — holds partial results until both arrive
  const state = {
    audioScore: null,       // From Meyda — arrives first (synchronous)
    textLabel: null,        // From AfriBERTa — arrives after Whisper transcribes
    textScore: null,        // AfriBERTa confidence
    audioReady: false,
    textReady: false,
  };

  /**
   * Called immediately after Meyda MFCC extraction completes on the main thread.
   * This always arrives before the text result.
   */
  function setAudioResult(paralinguisticScore) {
    state.audioScore = paralinguisticScore;
    state.audioReady = true;
    console.log(`🎙️ Coordinator [${sessionId}]: Audio result received (${paralinguisticScore.toFixed(3)})`);
    tryFuse();
  }

  /**
   * Called when AfriBERTa worker posts a RESULT message back to the main thread.
   */
  function setTextResult(label, score) {
    state.textLabel = label;
    state.textScore = score;
    state.textReady = true;
    console.log(`📝 Coordinator [${sessionId}]: Text result received (${label}, ${score.toFixed(3)})`);
    tryFuse();
  }

  /**
   * Attempts fusion. Only executes when both modalities have reported in.
   * Safe to call multiple times — will only fire onFusionComplete once.
   */
  function tryFuse() {
    if (!state.audioReady || !state.textReady) return;

    const result = fuseModalities(state.textLabel, state.textScore, state.audioScore);

    onFusionComplete({
      ...result,
      sessionId
    });
  }

  /**
   * Fallback: if audio never arrives (e.g. mic permission denied),
   * call this to proceed with text-only using a neutral audio score.
   */
  function setAudioFallback() {
    console.warn(`⚠️ Coordinator [${sessionId}]: Using audio fallback (score=0)`);
    setAudioResult(0);
  }

  /**
   * Fallback: if AfriBERTa fails, proceed with audio-only using a neutral text result.
   */
  function setTextFallback() {
    console.warn(`⚠️ Coordinator [${sessionId}]: Using text fallback (neutral, 0.5)`);
    setTextResult('neutral', 0.5);
  }

  return {
    setAudioResult,
    setTextResult,
    setAudioFallback,
    setTextFallback
  };
}