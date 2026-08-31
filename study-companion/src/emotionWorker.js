import { pipeline, env } from '@huggingface/transformers';

// ── Model loading strategy ────────────────────────────────────────────────
// Local dev:  model lives at public/models/sentiment/ → loads instantly
// Vercel:     .onnx excluded from git → falls back to Hugging Face download,
//             then Service Worker caches it for all subsequent visits.
//
// env.allowLocalModels  = true  → always try local first (fast path)
// env.allowRemoteModels = true  → fall back to HF hub if local not found
// local_files_only is NOT passed → let the library decide based on env flags

const IS_LOCAL = location.hostname === 'localhost' || location.hostname === '127.0.0.1';

env.allowLocalModels  = true;
env.allowRemoteModels = true;          // needed on Vercel where .onnx isn't bundled
env.localModelPath    = '/models/';

// On local dev, also set the cache dir so Transformers.js finds the model
// at the correct path without a network round-trip.
if (IS_LOCAL) {
  env.cacheDir = '/models/';
}

let classifier = null;
let isLoading  = false;

async function getClassifier() {
  if (classifier) return classifier;

  // If another call is already loading, wait for it to finish
  if (isLoading) {
    await new Promise(resolve => {
      const interval = setInterval(() => {
        if (classifier || !isLoading) {
          clearInterval(interval);
          resolve();
        }
      }, 100);
    });
    return classifier;
  }

  isLoading = true;
  self.postMessage({ type: 'AFRIBERTA_STATUS', status: 'LOADING' });

  classifier = await pipeline(
    'text-classification',
    'Shrewdd/studymate-sentiment',
    {
      // Do NOT pass local_files_only — let env.allowRemoteModels handle fallback
      progress_callback: (progress) => {
        if (progress.status === 'initiate') {
          self.postMessage({
            type: 'AFRIBERTA_STATUS',
            status: 'COMPILING',
            message: `Initializing: ${progress.file ?? ''}`,
          });
        }
        if (progress.status === 'progress') {
          self.postMessage({
            type: 'AFRIBERTA_STATUS',
            status: 'COMPILING',
            message: `Loading: ${Math.round(progress.progress ?? 0)}%`,
          });
        }
        if (progress.status === 'done') {
          self.postMessage({
            type: 'AFRIBERTA_STATUS',
            status: 'COMPILING',
            message: `Compiled: ${progress.file ?? ''}`,
          });
        }
      },
    }
  );

  isLoading = false;
  self.postMessage({ type: 'AFRIBERTA_STATUS', status: 'READY' });

  return classifier;
}

// Boot — start loading immediately on worker spawn
getClassifier().catch((error) => {
  isLoading = false;
  console.error('❌ AfriBERTa failed to load:', error);
  self.postMessage({
    type: 'AFRIBERTA_STATUS',
    status: 'ERROR',
    message: error.message,
  });
});

self.addEventListener('message', async (event) => {
  const { type, text } = event.data;

  if (type === 'START_CLASSIFICATION' || type === 'TRANSCRIPTION_RESULT') {
    try {
      const instance = await getClassifier();
      const outputs   = await instance(text);

      const sentiment  = outputs[0].label;
      const confidence = (outputs[0].score * 100).toFixed(2) + '%';

      self.postMessage({ type: 'RESULT', sentiment, confidence });

    } catch (error) {
      console.error('❌ Inference error:', error);
      self.postMessage({ type: 'ERROR', message: error.message });
    }
  }
});