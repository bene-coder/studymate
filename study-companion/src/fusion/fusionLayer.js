//  * FUSION LAYER
//  * Combines AfriBERTa text sentiment + Meyda paralinguistic score
//  * into a single unified emotional state.

// Weights determining how much each modality contributes to the final score.
// Text sentiment weighted higher because AfriBERTa was trained on Nigerian language data.
// Audio is supplementary paralinguistic context.
const MODALITY_WEIGHTS = {
  text: 0.65,
  audio: 0.35,
};

// Thresholds for classifying the fused score into emotional states.
//
// Revised threshold rationale:
// ─────────────────────────────────────────────────────────────────
// BORED is a LOW-ENERGY, FLAT state — near-zero sentiment, flat voice.
// It should NOT trigger for negative scores. A frustrated or confused
// student has strong negative signal; a bored student has almost none.
//
// State map (fusedScore axis):
//   < -0.3              → frustrated (strong negative — override via isFrustrated)
//   -0.3 to -0.05       → confused   (moderate negative — uncertain, struggling)
//   -0.05 to +0.15      → bored      (flat, near-zero — disengaged, low energy)
//   > +0.15             → engaged    (positive — curious, on track)
//
const THRESHOLDS = {
  ENGAGED_MIN:      0.15,   // fusedScore above this → engaged
  BORED_UPPER:      0.15,   // fusedScore below ENGAGED_MIN...
  BORED_LOWER:     -0.05,   // ...and above this → bored (flat zone only)
  CONFUSED_LOWER:  -0.30,   // fusedScore below this → frustrated (via isFrustrated)
  FRUSTRATED_AUDIO: 0.15,   // audio energy above this AND negative text → frustrated
};

/**
 * Converts AfriBERTa's label+score output into a normalized -1 to +1 value.
 *
 * positive + high confidence  →  close to +1
 * neutral                     →  close to  0
 * negative + high confidence  →  close to -1
 */
export function normalizeTextSentiment(label, score) {
  const confidence = score ?? 0.5;

  switch (label?.toLowerCase()) {
    case 'positive': return confidence;
    case 'negative': return -confidence;
    case 'neutral':  return (confidence - 0.5);
    default:
      console.warn(`⚠️ FusionLayer: Unknown label "${label}", defaulting to 0`);
      return 0;
  }
}

/**
 * Core fusion function.
 *
 * @param {string} textLabel   - AfriBERTa label: 'positive' | 'neutral' | 'negative'
 * @param {number} textScore   - AfriBERTa confidence: 0 to 1
 * @param {number} audioScore  - Meyda paralinguistic score: -1 to +1
 *
 * @returns {{
 *   emotionalState: string,
 *   fusedScore: number,
 *   normalizedText: number,
 *   confidence: string
 * }}
 */
export function fuseModalities(textLabel, textScore, audioScore) {
  // Step 1 — Normalize text sentiment to [-1, +1]
  const normalizedText = normalizeTextSentiment(textLabel, textScore);

  // Step 2 — Clamp audio score defensively
  const normalizedAudio = Math.max(-1, Math.min(1, audioScore ?? 0));

  // Step 3 — Weighted combination
  const fusedScore =
    normalizedText * MODALITY_WEIGHTS.text +
    normalizedAudio * MODALITY_WEIGHTS.audio;

  // Step 4 — Frustrated detection:
  // Triggered when text is strongly negative AND audio energy is elevated.
  // For text-only input (audio = 0), frustrated triggers when fusedScore
  // is below CONFUSED_LOWER — strong negative text alone is enough.
  const isNegative = textLabel?.toLowerCase() === 'negative';

  const isFrustrated =
    isNegative && (
      normalizedAudio > THRESHOLDS.FRUSTRATED_AUDIO ||   // voice frustration
      fusedScore < THRESHOLDS.CONFUSED_LOWER              // strong text frustration
    );

  // Step 5 — Map fused score to emotional state
  // Bored is now a FLAT ZONE (-0.05 to +0.15) — near-zero only.
  // Negative scores map to confused or frustrated, never bored.
  let emotionalState;

  if (isFrustrated) {
    emotionalState = 'frustrated';
  } else if (fusedScore >= THRESHOLDS.ENGAGED_MIN) {
    emotionalState = 'engaged';
  } else if (fusedScore >= THRESHOLDS.BORED_LOWER && fusedScore < THRESHOLDS.BORED_UPPER) {
    // Flat zone — low energy, near-zero sentiment
    emotionalState = 'bored';
  } else {
    // Moderate negative zone (-0.05 to -0.30) → confused
    emotionalState = 'confused';
  }

  // Step 6 — Confidence label
  const absScore = Math.abs(fusedScore);
  const confidence = absScore > 0.6 ? 'high' : absScore > 0.3 ? 'medium' : 'low';

  console.log(
    `🔀 Fusion: text="${textLabel}"(${normalizedText.toFixed(2)}) + audio(${normalizedAudio.toFixed(2)}) → score=${fusedScore.toFixed(2)} → ${emotionalState} [${confidence}]`
  );

  return {
    emotionalState,
    fusedScore: parseFloat(fusedScore.toFixed(3)),
    normalizedText: parseFloat(normalizedText.toFixed(3)),
    confidence,
  };
}