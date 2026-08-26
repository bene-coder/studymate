import Meyda from 'meyda';

/**
 * Extracts MFCC-based paralinguistic features from a completed audio recording.
 * Called after Whisper finishes transcription, using the same AudioBuffer.
 * 
 * Returns a single feature vector representing the emotional tone of the audio,
 * not the linguistic content (that's Whisper's job).
 */

const BUFFER_SIZE = 512;       // Must be power of 2. 512 = ~11ms per frame at 44.1kHz
const NUM_MFCC_COEFFICIENTS = 13; // Standard for paralinguistic tasks

/**
 * Computes the mean of each MFCC coefficient across all frames.
 * This collapses a variable-length recording into a fixed 13-value vector
 * that the fusion layer can consume regardless of how long the student spoke.
 */
function computeMeanMFCC(allFrames) {
  if (!allFrames || allFrames.length === 0) return new Array(NUM_MFCC_COEFFICIENTS).fill(0);

  const means = new Array(NUM_MFCC_COEFFICIENTS).fill(0);

  for (const frame of allFrames) {
    for (let i = 0; i < NUM_MFCC_COEFFICIENTS; i++) {
      means[i] += frame[i];
    }
  }

  return means.map(sum => sum / allFrames.length);
}

/**
 * Derives a paralinguistic sentiment score from the mean MFCC vector.
 * 
 * Linguistic basis:
 * - MFCC[0]: Overall energy. Low energy = bored/disengaged, high = frustrated/engaged.
 * - MFCC[1-3]: Spectral shape. Tense/stressed speech shifts these upward.
 * - MFCC[4-12]: Fine timbral texture. Less interpretable individually but useful in aggregate.
 * 
 * This is a heuristic approximation — academically valid for an undergrad project.
 * A proper system would train a classifier on labelled affective speech data.
 */
function deriveSentimentScore(meanMFCC) {
  const energy = meanMFCC[0];          // Coefficient 0: energy/loudness proxy
  const spectralTension = meanMFCC[1]; // Coefficient 1: spectral tilt proxy

  // Normalize to a -1 to +1 range
  // These threshold values are empirically reasonable for speech at typical mic distances
  const normalizedEnergy = Math.max(-1, Math.min(1, energy / 50));
  const normalizedTension = Math.max(-1, Math.min(1, spectralTension / 30));

  // Weighted combination: energy contributes more than spectral tension
  const score = (normalizedEnergy * 0.6) + (normalizedTension * 0.4);

  return Math.max(-1, Math.min(1, score)); // Clamp to [-1, 1]
}

/**
 * Main extraction function.
 * Takes a Float32Array of raw PCM audio samples and returns:
 * - mfccVector: the 13-value mean MFCC feature vector
 * - paralinguisticScore: a single [-1, 1] value representing acoustic emotional tone
 *   (-1 = flat/low energy, +1 = high energy/tense)
 * - frameCount: number of frames processed (useful for debugging short recordings)
 */
export function extractMFCC(audioSamples, sampleRate = 44100) {
  if (!audioSamples || audioSamples.length === 0) {
    console.warn("⚠️ MFCC: Empty audio samples received");
    return {
      mfccVector: new Array(NUM_MFCC_COEFFICIENTS).fill(0),
      paralinguisticScore: 0,
      frameCount: 0
    };
  }

  const allFrames = [];

  // Slide a window across the audio signal, extracting MFCC per frame
  for (let i = 0; i + BUFFER_SIZE <= audioSamples.length; i += BUFFER_SIZE) {
    const frame = audioSamples.slice(i, i + BUFFER_SIZE);

    const features = Meyda.extract(['mfcc'], frame);

    if (features && features.mfcc && !features.mfcc.some(isNaN)) {
      allFrames.push(features.mfcc);
    }
  }

  if (allFrames.length === 0) {
    console.warn("⚠️ MFCC: No valid frames extracted — audio may be silent");
    return {
      mfccVector: new Array(NUM_MFCC_COEFFICIENTS).fill(0),
      paralinguisticScore: 0,
      frameCount: 0
    };
  }

  const mfccVector = computeMeanMFCC(allFrames);
  const paralinguisticScore = deriveSentimentScore(mfccVector);

  console.log(`✅ MFCC: Processed ${allFrames.length} frames`);
  console.log(`📊 MFCC Vector:`, mfccVector.map(v => v.toFixed(3)));
  console.log(`🎙️ Paralinguistic Score: ${paralinguisticScore.toFixed(3)}`);

  return {
    mfccVector,
    paralinguisticScore,
    frameCount: allFrames.length
  };
}