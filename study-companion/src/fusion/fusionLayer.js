
//  * FUSION LAYER
//  * Combines AfriBERTa text sentiment + Meyda paralinguistic score
//  * into a single unified emotional state.

// Weights determining how much each modality contributes to the final score.
// Text sentiment weighted higher because AfriBERTa was trained on Nigerian language data.
// Audio is supplementary paralinguistic context.
const MODALITY_WEIGHTS = {
  text: 0.65,
  audio: 0.35
};

// Thresholds for classifying the fused score into emotional states
const THRESHOLDS = {
  ENGAGED_MIN: 0.2,      // Fused score above this = engaged
  FRUSTRATED_MIN: 0.15,  // High audio energy + negative text = frustrated
  BORED_MAX: -0.2,       // Fused score below this = bored
  // Everything between BORED_MAX and ENGAGED_MIN = confused
};

/**
 * Converts AfriBERTa's label+score output into a normalized -1 to +1 value.
 * 
 * positive + high confidence  →  close to +1
 * neutral                     →  close to  0
 * negative + high confidence  →  close to -1
 */
export function normalizeTextSentiment(label, score) {
  // score from AfriBERTa is always 0-1 confidence for the predicted label
  const confidence = score ?? 0.5;

  switch (label?.toLowerCase()) {
    case 'positive': return confidence;           //  0.5 to +1.0
    case 'negative': return -confidence;          // -1.0 to -0.5
    case 'neutral':  return (confidence - 0.5);  // -0.5 to +0.5 (centered around 0)
    default:
      console.warn(`⚠️ FusionLayer: Unknown label "${label}", defaulting to 0`);
      return 0;
  }
}

/**
 * Core fusion function.
 * Combines normalized text score and paralinguistic score using modality weights.
 * 
 * @param {string} textLabel      - AfriBERTa output label: 'positive' | 'neutral' | 'negative'
 * @param {number} textScore      - AfriBERTa confidence score: 0 to 1
 * @param {number} audioScore     - Meyda paralinguistic score: -1 to +1
 * 
 * @returns {{ 
 *   emotionalState: string,
 *   fusedScore: number,
 *   normalizedText: number,
 *   confidence: string
 * }}
 */
export function fuseModalities(textLabel, textScore, audioScore) {
  // Step 1 — Normalize text sentiment to -1 to +1
  const normalizedText = normalizeTextSentiment(textLabel, textScore);

  // Step 2 — Clamp audio score defensively (Meyda should already return -1 to +1)
  const normalizedAudio = Math.max(-1, Math.min(1, audioScore ?? 0));

  // Step 3 — Weighted combination
  const fusedScore = (normalizedText * MODALITY_WEIGHTS.text) +
                     (normalizedAudio * MODALITY_WEIGHTS.audio);

  // Step 4 — Detect frustrated separately before general thresholding.

  const isFrustrated =
    textLabel?.toLowerCase() === 'negative' &&
    normalizedAudio > THRESHOLDS.FRUSTRATED_MIN;

  // Step 5 — Map fused score to emotional state
  let emotionalState;

  if (isFrustrated) {
    emotionalState = 'frustrated';
  } else if (fusedScore >= THRESHOLDS.ENGAGED_MIN) {
    emotionalState = 'engaged';
  } else if (fusedScore <= THRESHOLDS.BORED_MAX) {
    emotionalState = 'bored';
  } else {
    // Middle zone: score between BORED_MAX and ENGAGED_MIN
    emotionalState = 'confused';
  }

  // Step 6 — Compute human-readable confidence label
  const absScore = Math.abs(fusedScore);
  const confidence = absScore > 0.6 ? 'high' : absScore > 0.3 ? 'medium' : 'low';

  console.log(`🔀 Fusion: text="${textLabel}"(${normalizedText.toFixed(2)}) + audio(${normalizedAudio.toFixed(2)}) → score=${fusedScore.toFixed(2)} → ${emotionalState} [${confidence}]`);

  return {
    emotionalState,
    fusedScore: parseFloat(fusedScore.toFixed(3)),
    normalizedText: parseFloat(normalizedText.toFixed(3)),
    confidence
  };
}