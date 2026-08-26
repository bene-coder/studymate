import { pipeline, env } from '@huggingface/transformers';

env.allowLocalModels = true;
env.allowRemoteModels = false;
env.localModelPath = '/models/';

let classifier = null;
let isLoading = false;

async function getClassifier() {
  if (classifier) return classifier;

  if (isLoading) {
    await new Promise(resolve => {
      const interval = setInterval(() => {
        if (classifier) {
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
    'sentiment',
    {
      local_files_only: true,
      progress_callback: (progress) => {
        if (progress.status === 'initiate') {
          self.postMessage({ 
            type: 'AFRIBERTA_STATUS', 
            status: 'COMPILING',
            message: `Initializing: ${progress.file ?? ''}` 
          });
        }

        if (progress.status === 'progress') {
          self.postMessage({ 
            type: 'AFRIBERTA_STATUS', 
            status: 'COMPILING',
            message: `Loading: ${Math.round(progress.progress ?? 0)}%`
          });
        }

        if (progress.status === 'done') {
          self.postMessage({ 
            type: 'AFRIBERTA_STATUS', 
            status: 'COMPILING',
            message: `Compiled: ${progress.file ?? ''}` 
          });
        }
      }
    }
  );

  isLoading = false;
  self.postMessage({ type: 'AFRIBERTA_STATUS', status: 'READY' });

  return classifier;
}

getClassifier().catch((error) => {
  isLoading = false;
  console.error("❌ AfriBERTa failed to load:", error);
  self.postMessage({ 
    type: 'AFRIBERTA_STATUS', 
    status: 'ERROR', 
    message: error.message 
  });
});

self.addEventListener('message', async (event) => {
  const { type, text } = event.data;

  if (type === 'START_CLASSIFICATION' || type === 'TRANSCRIPTION_RESULT') {
    try {
      const instance = await getClassifier();
      const outputs = await instance(text);

      const sentiment = outputs[0].label;
      const confidence = (outputs[0].score * 100).toFixed(2) + '%';

      self.postMessage({
        type: 'RESULT',
        sentiment,
        confidence
      });

    } catch (error) {
      console.error("❌ Inference error:", error);
      self.postMessage({
        type: 'ERROR',
        message: error.message
      });
    }
  }
});