import { pipeline, env } from '@huggingface/transformers';

// ── Model loading strategy ────────────────────────────────────────────────
// Local dev:  model lives at public/models/sentiment/ → 'sentiment' resolves
//             to /models/sentiment/ via env.localModelPath
// Vercel:     .onnx not in repo → pulls 'Shrewdd/studymate-sentiment' from
//             Hugging Face hub, then Service Worker caches it for future visits.

const IS_LOCAL = location.hostname === 'localhost' || location.hostname === '127.0.0.1';

// Local: use the files on disk. Remote: allow HF hub download.
env.allowLocalModels  = true;
env.allowRemoteModels = !IS_LOCAL;   // only allow remote on Vercel
env.localModelPath    = '/models/';

// 'sentiment' → /models/sentiment/ on local dev
// 'Shrewdd/studymate-sentiment' → HF hub on Vercel
const MODEL_ID = IS_LOCAL ? 'sentiment' : 'Shrewdd/studymate-sentiment';

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
    MODEL_ID,
    {
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
self.addEventListener('message', async (event) => {
  const { type, text } = event.data;

  // Whisper signals it's ready — now safe to load AfriBERTa
  if (type === 'INIT') {
    getClassifier().catch((error) => {
      isLoading = false;
      console.error('❌ AfriBERTa failed to load:', error);
      self.postMessage({
        type: 'AFRIBERTA_STATUS',
        status: 'ERROR',
        message: error.message,
      });
    });
    return;
  }

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