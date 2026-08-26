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

const GEMINI_MODEL = 'gemini-2.5-flash'; // Fast + cheap, ideal for a tutoring companion
const GEMINI_API_BASE = 'https://generativelanguage.googleapis.com/v1beta';

/**
 * Generates a tutoring response using the Gemini API.
 * Supports streaming so the response appears token-by-token in the UI.
 * 
 * @param {object} params
 * @param {string}   params.studentInput       - The raw text or transcription from the student
 * @param {string}   params.emotionalState     - One of: frustrated | confused | bored | engaged
 * @param {object}   params.responseStrategy   - Output from selectResponseStrategy()
 * @param {Array}    params.conversationHistory - Array of {role, content} objects for multi-turn context
 *                                                  role: 'user' | 'assistant' (converted to Gemini format internally)
 * @param {function} params.onToken            - Called with each streamed text chunk
 * @param {function} params.onComplete         - Called with the full assembled response string
 * @param {function} params.onError            - Called with error message string on failure
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

  // Build the user-facing message that includes the pedagogical opener
  const userMessageWithContext = buildUserMessage(studentInput, responseStrategy);

  const systemPrompt = getSystemPrompt(emotionalState);

  // --- CONVERT HISTORY TO GEMINI FORMAT ---
  // Gemini uses 'user' and 'model' roles (not 'assistant'), and content
  // is wrapped in a `parts` array rather than a plain string
  const contents = [
    ...conversationHistory.map(turn => ({
      role: turn.role === 'assistant' ? 'model' : 'user',
      parts: [{ text: turn.content }]
    })),
    {
      role: 'user',
      parts: [{ text: userMessageWithContext }]
    }
  ];

  const requestBody = {
    contents,
    systemInstruction: {
      parts: [{ text: systemPrompt }]
    },
    generationConfig: {
      maxOutputTokens: 1000,
    }
  };

  try {
    // streamGenerateContent with alt=sse gives us Server-Sent Events
    const url = `${GEMINI_API_BASE}/models/${GEMINI_MODEL}:streamGenerateContent?alt=sse&key=${apiKey}`;

    const response = await fetch(url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(requestBody),
    });

    if (!response.ok) {
      const errorData = await response.json().catch(() => ({}));
      throw new Error(`Gemini API Error ${response.status}: ${errorData.error?.message ?? response.statusText}`);
    }

    // --- STREAM PROCESSING ---
    const reader = response.body.getReader();
    const decoder = new TextDecoder();
    let fullResponse = '';
    let buffer = '';

    while (true) {
      const { done, value } = await reader.read();
      if (done) break;

      buffer += decoder.decode(value, { stream: true });

      // SSE events are separated by newlines, each data line prefixed with "data: "
      const lines = buffer.split('\n');
      buffer = lines.pop(); // Keep incomplete line in buffer

      for (const line of lines) {
        if (!line.startsWith('data: ')) continue;

        const data = line.slice(6).trim();
        if (!data) continue;

        try {
          const parsed = JSON.parse(data);

          // Gemini stream chunks: candidates[0].content.parts[0].text
          const token = parsed?.candidates?.[0]?.content?.parts?.[0]?.text;

          if (token) {
            fullResponse += token;
            onToken?.(token);
          }

          // Check for safety blocks or finish reasons that aren't normal completion
          const finishReason = parsed?.candidates?.[0]?.finishReason;
          if (finishReason && finishReason !== 'STOP') {
            console.warn(`⚠️ Gemini finish reason: ${finishReason}`);
          }

        } catch (parseErr) {
          // Skip malformed SSE lines — they occasionally appear at stream boundaries
          console.warn('⚠️ SSE parse warning:', parseErr.message);
        }
      }
    }

    if (!fullResponse) {
      throw new Error('Empty response from Gemini — possible content filter block');
    }

    onComplete?.(fullResponse);

  } catch (err) {
    console.error('❌ Response Generator Error:', err);
    onError?.(err.message ?? 'Failed to generate response');
  }
}

/**
 * Constructs the user message sent to the API.
 * Injects the pedagogical opener as a soft instruction prefix so the
 * model opens with the right tone without it appearing verbatim as
 * a rigid template in the response.
 */
function buildUserMessage(studentInput, responseStrategy) {
  const { opening, tone, scaffoldingLevel, pacing } = responseStrategy;

  return `
[Detected student input]: "${studentInput}"

[Pedagogical instruction — do not quote this back to the student]:
- Open your response with a message that reflects this tone: "${opening}"
- Tone target: ${tone}
- Scaffolding level: ${scaffoldingLevel} (high = break it down step by step, low = extend and challenge)
- Pacing: ${pacing}

Now respond directly to the student as their AI study companion.
`.trim();
}