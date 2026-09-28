import { env, pipeline } from '@huggingface/transformers';

env.allowLocalModels = false;
env.allowRemoteModels = true;
env.useBrowserCache = true;

// ── Whisper is loaded ON DEMAND, not at worker boot ───────────────────────
// Text-only sessions never pay for it. App.jsx sends INIT_WHISPER the first
// time the student taps the mic, and only starts recording once we reply
// WHISPER_READY.
//
// dtype note: 'fp32' downloads ~150 MB (32.9 MB encoder + ~119 MB decoder).
// If that is still too heavy on 4GB phones, try a mixed dtype, which keeps
// the encoder at full precision and shrinks only the decoder:
//   const WHISPER_DTYPE = { encoder_model: 'fp32', decoder_model_merged: 'q8' };
// Re-test transcription quality after changing it.
const WHISPER_MODEL = 'Xenova/whisper-tiny.en';
const WHISPER_DTYPE = 'fp32';

let transcriber = null;
let initPromise = null;

/**
 * Loads Whisper once. Safe to call from anywhere, any number of times:
 * concurrent callers share the same in-flight load, and a failed load
 * clears itself so the next call retries from scratch.
 */
function initWhisper() {
  if (transcriber) return Promise.resolve(transcriber);
  if (initPromise) return initPromise;

  initPromise = (async () => {
    self.postMessage({ type: 'WHISPER_STATUS', message: 'Loading Whisper model...' });

    transcriber = await pipeline('automatic-speech-recognition', WHISPER_MODEL, {
      dtype: WHISPER_DTYPE,
      device: 'wasm',
    });

    console.log('✅ Whisper initialized successfully');
    self.postMessage({ type: 'WHISPER_READY' });
    return transcriber;
  })().catch((error) => {
    initPromise = null; // allow a clean retry
    transcriber = null;
    throw error;
  });

  return initPromise;
}

self.addEventListener('message', async (event) => {
  const { type, audioArray, id } = event.data;

  // ── Explicit load request (first mic tap) ───────────────────────────────
  if (type === 'INIT_WHISPER') {
    try {
      await initWhisper();
    } catch (error) {
      console.error('❌ Whisper initialization failed:', error);
      // phase: 'init' lets App.jsx tell a failed download apart from a failed
      // transcription, so it does not run the transcription recovery path.
      self.postMessage({ type: 'WHISPER_ERROR', phase: 'init', message: error.message });
    }
    return;
  }

  // ── Transcription ───────────────────────────────────────────────────────
  if (type === 'TRANSCRIBE') {
    console.log('📥 TRANSCRIBE received, audioArray length:', audioArray?.length);

    try {
      // Normally Whisper is already loaded (App.jsx gates recording on it).
      // This is only a safety net: it loads on demand or joins a load in flight.
      const asr = await initWhisper();

      if (!audioArray || audioArray.length === 0) {
        self.postMessage({ type: 'WHISPER_ERROR', phase: 'transcribe', message: 'Empty audio received' });
        return;
      }

      self.postMessage({ type: 'TRANSCRIBING_STATUS', message: 'Transcribing...' });
      console.log('▶️ Running Whisper inference...');

      const response = await asr(audioArray, {
        chunk_length_s: 30,
        stride_length_s: 5,
        return_timestamps: false,
      });

      console.log('✅ Whisper result:', response);

      const text = response?.text?.trim();

      if (!text) {
        self.postMessage({
          type: 'WHISPER_ERROR',
          phase: 'transcribe',
          message: 'No speech detected — please try again',
        });
        return;
      }

      self.postMessage({ type: 'TRANSCRIPTION_RESULT', id, text });

    } catch (error) {
      console.error('❌ Transcription error:', error);
      self.postMessage({ type: 'WHISPER_ERROR', phase: 'transcribe', message: error.message });
    }
  }
});

// The worker script is alive, but no model is loaded yet.
self.postMessage({ type: 'AUDIO_WORKER_ALIVE' });