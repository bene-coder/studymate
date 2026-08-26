import { useRef, useState, useCallback } from 'react';
import { extractMFCC } from '../audio/mfccExtractor';

/**
 * useAudioRecorder
 * 
 * Owns the microphone, AudioContext, and MFCC extraction.
 * Must run on the main thread — Web Audio API is not available in workers.
 * 
 * @param {object} callbacks
 * @param {function} callbacks.onAudioReady     - Called with (pcmFloat32Array) for Whisper
 * @param {function} callbacks.onMFCCReady      - Called with (paralinguisticScore) for fusion layer
 * @param {function} callbacks.onStatusChange   - Called with (statusString) for UI updates
 * @param {function} callbacks.onError          - Called with (errorMessage) on failure
 */
export function useAudioRecorder({ onAudioReady, onMFCCReady, onStatusChange, onError }) {
  const [isRecording, setIsRecording] = useState(false);

  const audioContextRef = useRef(null);
  const streamRef       = useRef(null);
  const processorRef    = useRef(null);
  const audioChunksRef  = useRef([]);

  const startRecording = useCallback(async () => {
    try {
      audioChunksRef.current = [];
      setIsRecording(true);
      onStatusChange?.('Listening to microphone stream...');

      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      streamRef.current = stream;

      // 16kHz matches Whisper's expected sample rate — avoids resampling artifacts
      audioContextRef.current = new (window.AudioContext || window.webkitAudioContext)({
        sampleRate: 16000
      });

      const source = audioContextRef.current.createMediaStreamSource(stream);

      // ScriptProcessor is deprecated but still the most compatible option
      // across low-end Android browsers in the Nigerian market context
      processorRef.current = audioContextRef.current.createScriptProcessor(4096, 1, 1);

      processorRef.current.onaudioprocess = (e) => {
        const inputData = e.inputBuffer.getChannelData(0);
        audioChunksRef.current.push(new Float32Array(inputData));
      };

      source.connect(processorRef.current);
      processorRef.current.connect(audioContextRef.current.destination);

    } catch (err) {
      console.error('❌ Microphone initialization failed:', err);
      setIsRecording(false);
      onError?.(`Mic Error: ${err.message}`);
    }
  }, [onStatusChange, onError]);

  const stopRecording = useCallback(() => {
    setIsRecording(false);
    onStatusChange?.('Audio capture complete. Extracting features...');

    // Disconnect and clean up Web Audio graph
    if (processorRef.current)    processorRef.current.disconnect();
    if (audioContextRef.current) audioContextRef.current.close();
    if (streamRef.current)       streamRef.current.getTracks().forEach(t => t.stop());

    // Merge all captured chunks into a single Float32Array
    const totalLength = audioChunksRef.current.reduce((acc, chunk) => acc + chunk.length, 0);
    const mergedBuffer = new Float32Array(totalLength);
    let offset = 0;
    for (const chunk of audioChunksRef.current) {
      mergedBuffer.set(chunk, offset);
      offset += chunk.length;
    }

    if (mergedBuffer.length === 0) {
      onError?.('No audio captured — microphone may be muted');
      return;
    }

    // --- MFCC EXTRACTION (must happen here on main thread) ---
    // Web Audio API is unavailable in workers, so this runs before
    // the audio is dispatched to the Whisper worker
    try {
      const { paralinguisticScore, frameCount } = extractMFCC(mergedBuffer, 16000);
      console.log(`✅ MFCC extracted: score=${paralinguisticScore.toFixed(3)}, frames=${frameCount}`);
      onMFCCReady?.(paralinguisticScore);
    } catch (err) {
      console.warn('⚠️ MFCC extraction failed, using fallback score of 0:', err);
      onMFCCReady?.(0); // Fallback to neutral score on failure, since this is a non-critical feature
    }

    // Dispatch raw audio to Whisper worker for transcription
    onAudioReady?.(mergedBuffer);

  }, [onAudioReady, onMFCCReady, onStatusChange, onError]);

  return { isRecording, startRecording, stopRecording };
}