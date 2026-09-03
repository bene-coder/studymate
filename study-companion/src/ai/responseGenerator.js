/**
 * ADAPTIVE RESPONSE GENERATOR (Gemini API)
 * 
 * Calls the Gemini API to generate a full pedagogical tutoring response.
 * Uses the fused emotional state and response strategy to construct
 * a context-aware system instruction, then streams the reply back to the UI
 * using Server-Sent Events (SSE).
 * 
 * This is the bridge between the fusion layer output and the student-facing response.
 */

import { getSystemPrompt } from './systemPrompts';

const GEMINI_MODEL    = 'gemini-2.5-flash';
const GEMINI_API_BASE = 'https://generativelanguage.googleapis.com/v1beta';

/**
 * Generates a tutoring response using the Gemini API.
 * Supports streaming so the response appears token-by-token in the UI.
 *
 * @param {object}   params
 * @param {string}   params.studentInput        - Raw text or transcription from the student
 * @param {string}   params.emotionalState      - frustrated | confused | bored | engaged
 * @param {object}   params.responseStrategy    - Output from selectResponseStrategy()
 * @param {Array}    params.conversationHistory - [{role, content}] for multi-turn context
 * @param {function} params.onToken             - Called with each streamed text chunk
 * @param {function} params.onComplete          - Called with the full assembled response string
 * @param {function} params.onError             - Called with error message string on failure
 */
export async function generateAdaptiveResponse({
  studentInput,
  emotionalState,
  responseStrategy,
  conversationHistory = [],
  onToken,
  onComplete,
  onError,
}) {
  const apiKey = import.meta.env.VITE_GEMINI_API_KEY;

  if (!apiKey) {
    onError?.('Missing Gemini API key. Add VITE_GEMINI_API_KEY to your .env file.');
    return;
  }

  const userMessageWithContext = buildUserMessage(studentInput, responseStrategy);
  const systemPrompt = getSystemPrompt(emotionalState);

  // Convert history to Gemini format (role: 'model' not 'assistant')
  const contents = [
    ...conversationHistory.map(turn => ({
      role: turn.role === 'assistant' ? 'model' : 'user',
      parts: [{ text: turn.content }],
    })),
    {
      role: 'user',
      parts: [{ text: userMessageWithContext }],
    },
  ];

  const requestBody = {
    contents,
    systemInstruction: {
      parts: [{ text: systemPrompt }],
    },
    generationConfig: {
      // Raised from 1000 → 2048 so detailed explanations (RSA, algorithms,
      // multi-step proofs) complete without cutting off mid-sentence.
      // Still capped to manage student data costs on mobile connections.
      maxOutputTokens: 2048,

      // Slight temperature reduction keeps tutoring responses focused
      // and less likely to meander when the student asks for detail.
      temperature: 0.7,
    },
  };

  try {
    const url = `${GEMINI_API_BASE}/models/${GEMINI_MODEL}:streamGenerateContent?alt=sse&key=${apiKey}`;

    const response = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(requestBody),
    });

    if (!response.ok) {
      const errorData = await response.json().catch(() => ({}));
      throw new Error(
        `Gemini API Error ${response.status}: ${errorData.error?.message ?? response.statusText}`
      );
    }

    // ── STREAM PROCESSING ──────────────────────────────────────────────────
    const reader  = response.body.getReader();
    const decoder = new TextDecoder();
    let fullResponse = '';
    let buffer       = '';

    while (true) {
      const { done, value } = await reader.read();
      if (done) break;

      buffer += decoder.decode(value, { stream: true });

      // SSE events are newline-separated; keep the incomplete trailing line
      const lines = buffer.split('\n');
      buffer = lines.pop();

      for (const line of lines) {
        if (!line.startsWith('data: ')) continue;

        const data = line.slice(6).trim();
        if (!data) continue;

        try {
          const parsed = JSON.parse(data);
          const token  = parsed?.candidates?.[0]?.content?.parts?.[0]?.text;

          if (token) {
            fullResponse += token;
            onToken?.(token);
          }

          const finishReason = parsed?.candidates?.[0]?.finishReason;
          if (finishReason && finishReason !== 'STOP') {
            console.warn(`⚠️ Gemini finish reason: ${finishReason}`);
          }

        } catch (parseErr) {
          // Malformed SSE lines occasionally appear at stream boundaries
          console.warn('⚠️ SSE parse warning:', parseErr.message);
        }
      }
    }

    if (!fullResponse) {
      throw new Error('Empty response from Gemini — possible content filter block');
    }

    // ── DEDUPLICATION ──────────────────────────────────────────────────────
    // Gemini occasionally echoes the pedagogical opener from the system
    // prompt verbatim as the first sentence of the response, causing the
    // same text to appear twice in the UI (once from the opener injection
    // and once in the streamed reply). Strip it if detected.
    const cleanedResponse = stripDuplicateOpener(fullResponse, responseStrategy.opening);

    onComplete?.(cleanedResponse);

  } catch (err) {
    console.error('❌ Response Generator Error:', err);
    onError?.(err.message ?? 'Failed to generate response');
  }
}

/**
 * Strips the pedagogical opener from the start of the response if Gemini
 * echoed it back verbatim or near-verbatim. Comparison is case-insensitive
 * and strips punctuation so minor reformatting doesn't prevent detection.
 *
 * @param {string} response - Full streamed response text
 * @param {string} opener   - The opener string from the response strategy
 * @returns {string}        - Cleaned response
 */
function stripDuplicateOpener(response, opener) {
  if (!opener || !response) return response;

  const normalize = str =>
    str.toLowerCase().replace(/[^a-z0-9\s]/g, '').replace(/\s+/g, ' ').trim();

  const normalizedOpener   = normalize(opener);
  const normalizedResponse = normalize(response);

  // If the response starts with the opener, remove it
  if (normalizedResponse.startsWith(normalizedOpener)) {
    // Remove the opener length (approx) from the original response
    const openerLength = opener.length;
    const stripped = response.slice(openerLength).replace(/^[\s\n,.\-–—]+/, '');
    // Capitalise first letter of remainder
    return stripped.charAt(0).toUpperCase() + stripped.slice(1);
  }

  return response;
}

/**
 * Constructs the user message sent to Gemini.
 * Injects the pedagogical opener as a soft instruction so the model opens
 * with the right tone without it appearing verbatim as a rigid template.
 *
 * The instruction is framed as guidance to the model, not as text for
 * the student — this reduces the likelihood of Gemini echoing it back.
 */
function buildUserMessage(studentInput, responseStrategy) {
  const { opening, tone, scaffoldingLevel, pacing } = responseStrategy;

  return `
[Student message]: "${studentInput}"

[Tutor instructions — internal only, do not repeat these to the student]:
- Begin your response in a way that reflects this sentiment: ${opening}
- Tone: ${tone}
- Scaffolding: ${scaffoldingLevel} (high = step-by-step breakdown; low = extend and challenge)
- Pacing: ${pacing}
- Respond fully — do not cut off mid-explanation. Complete every thought.

Respond now as the student's AI study companion.
`.trim();
}