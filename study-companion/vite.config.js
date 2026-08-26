import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'
import { VitePWA } from 'vite-plugin-pwa'

export default defineConfig({
  plugins: [
    react(),
    tailwindcss(),
    VitePWA({
      registerType: 'autoUpdate',

      // Include the ONNX model and WASM binaries in the SW's precache manifest.
      // Vite-plugin-pwa only picks up files it knows about at build time; anything
      // in /public that isn't imported by JS needs to be listed here explicitly.
      includeAssets: [
        'favicon.ico',
        'icons/*.png',
        // AfriBERTa quantized model + tokenizer artefacts
        'models/sentiment/onnx/model_quantized.onnx',
        'models/sentiment/tokenizer.json',
        'models/sentiment/tokenizer_config.json',
        'models/sentiment/vocab.txt',
        'models/sentiment/special_tokens_map.json',
        // ORT Web WASM binaries (copied to public by transformers.js)
        '*.wasm',
      ],

      manifest: {
        name: 'StudyMate',
        short_name: 'StudyMate',
        description: 'Multimodal sentiment-aware AI study companion',
        theme_color: '#2f5d50',
        background_color: '#fafaf8',
        display: 'standalone',
        orientation: 'portrait-primary',
        scope: '/',
        start_url: '/',
        icons: [
          {
            src: 'icons/icon-192.png',
            sizes: '192x192',
            type: 'image/png',
          },
          {
            src: 'icons/icon-512.png',
            sizes: '512x512',
            type: 'image/png',
          },
          {
            src: 'icons/icon-512.png',
            sizes: '512x512',
            type: 'image/png',
            purpose: 'maskable',
          },
        ],
      },

      workbox: {
        
        runtimeCaching: [
          {
            // Match the quantized ONNX model file
            urlPattern: /\/models\/.*\.onnx$/,
            handler: 'CacheFirst',
            options: {
              cacheName: 'studymate-models',
              expiration: {
                // Only ever 1 model file; keep for 90 days offline
                maxEntries: 1,
                maxAgeSeconds: 60 * 60 * 24 * 90,
              },
              // Required for opaque cross-origin responses to be cached safely
              cacheableResponse: {
                statuses: [0, 200],
              },
              // Range request support — browsers fetch large files in chunks
              rangeRequests: true,
            },
          },
          {
            // WASM binaries used by ORT Web / Transformers.js
            urlPattern: /\.wasm$/,
            handler: 'CacheFirst',
            options: {
              cacheName: 'studymate-wasm',
              expiration: {
                maxEntries: 10,
                maxAgeSeconds: 60 * 60 * 24 * 90,
              },
              cacheableResponse: {
                statuses: [0, 200],
              },
            },
          },
          {
            // Transformers.js may also pull tokenizer JSON from CDN on first load —
            // cache those too so the pipeline works offline after first run.
            urlPattern: /\/models\/.*\.json$/,
            handler: 'CacheFirst',
            options: {
              cacheName: 'studymate-model-configs',
              expiration: {
                maxEntries: 20,
                maxAgeSeconds: 60 * 60 * 24 * 30,
              },
              cacheableResponse: {
                statuses: [0, 200],
              },
            },
          },
        ],

        // The SW must NOT intercept Gemini API calls — those need the network.
        // NavigationRoute handles page navigations; API calls fall through naturally,
        // but list the Gemini domain explicitly to be safe.
        navigateFallback: 'index.html',
        navigateFallbackDenylist: [
          /^\/api\//,
          /generativelanguage\.googleapis\.com/,
        ],

        // Bump this if you manually push a model update and want clients to
        // re-fetch from network rather than serving the stale cached version.
        // Format: 'YYYY-MM-DD-vN'
        additionalManifestEntries: [],
      },

      // Emit the SW in the build output with full Workbox runtime included
      injectRegister: 'auto',
      strategies: 'generateSW',
      devOptions: {
        // Set to true temporarily if you need to test SW behaviour in dev;
        // leave false normally so HMR isn't interrupted by the SW.
        enabled: false,
        type: 'module',
      },
    }),
  ],

  worker: {
    format: 'es',
  },

  optimizeDeps: {
    exclude: ['@huggingface/transformers'],
  },

  server: {
    headers: {
      'Cross-Origin-Embedder-Policy': 'require-corp',
      'Cross-Origin-Opener-Policy': 'same-origin',
    },
    fs: {
      strict: false,
    },
  },

  publicDir: 'public',

  assetsInclude: ['**/*.onnx', '**/*.wasm'],
})