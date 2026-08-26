import { env, pipeline } from '@huggingface/transformers';

env.allowLocalModels = false;
env.allowRemoteModels = true;
env.useBrowserCache = true;

let transcriber = null;
let isLoading = false;

/**
 * Initializes Whisper immediately when the worker boots. 
 */
async function initWhisper() {
  if (transcriber || isLoading) return;
  isLoading = true;

  try {
    self.postMessage({ type: 'WHISPER_STATUS', message: 'Loading Whisper model...' });

    transcriber = await pipeline(
      'automatic-speech-recognition',
      'Xenova/whisper-tiny.en',
      {
        dtype: 'fp32',
        device: 'wasm',
      }
    );

    isLoading = false;
    console.log('✅ Whisper initialized successfully');
    self.postMessage({ type: 'WHISPER_READY' });

  } catch (error) {
    isLoading = false;
    console.error('❌ Whisper initialization failed:', error);
    self.postMessage({ type: 'WHISPER_ERROR', message: error.message });
  }
}

initWhisper();

self.addEventListener('message', async (event) => {
  const { type, audioArray, id } = event.data;

  if (type === 'INIT_WHISPER') {
    await initWhisper();
    return;
  }

  if (type === 'TRANSCRIBE') {
    console.log('📥 TRANSCRIBE received, audioArray length:', audioArray?.length);

    try {
      if (isLoading) {
        console.log('⏳ Whisper still loading, waiting...');
        await new Promise((resolve) => {
          const check = setInterval(() => {
            if (!isLoading) { clearInterval(check); resolve(); }
          }, 200);
        });
      }

      if (!transcriber) {
        console.error('❌ Transcriber still null after waiting');
        self.postMessage({ type: 'WHISPER_ERROR', message: 'Whisper failed to initialize' });
        return;
      }

      if (!audioArray || audioArray.length === 0) {
        self.postMessage({ type: 'WHISPER_ERROR', message: 'Empty audio received' });
        return;
      }

      self.postMessage({ type: 'TRANSCRIBING_STATUS', message: 'Transcribing...' });

      console.log('▶️ Running Whisper inference...');

      const response = await transcriber(audioArray, {
        chunk_length_s: 30,
        stride_length_s: 5,
        return_timestamps: false,
      });

      console.log('✅ Whisper result:', response);

      const text = response?.text?.trim();

      if (!text) {
        self.postMessage({ type: 'WHISPER_ERROR', message: 'No speech detected — please try again' });
        return;
      }

      self.postMessage({ type: 'TRANSCRIPTION_RESULT', id, text });

    } catch (error) {
      console.error('❌ Transcription error:', error);
      self.postMessage({ type: 'WHISPER_ERROR', message: error.message });
    }
  }
});

self.postMessage({ type: 'AUDIO_WORKER_ALIVE' });