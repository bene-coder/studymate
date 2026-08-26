/**
 * Utility to convert an AudioBuffer from the microphone into a 
 * 16kHz Float32Array required by Whisper ONNX.
 */
export async function processAudioForWhisper(audioBlob) {
  // 1. Initialize an offline audio context to handle calculation off-screen
  const audioContext = new (window.AudioContext || window.webkitAudioContext)();
  
  // 2. Convert the raw Blob data into an ArrayBuffer array
  const arrayBuffer = await audioBlob.arrayBuffer();
  
  // 3. Decode the compressed audio data (webm/mp3/wav) into an AudioBuffer object
  const audioBuffer = await audioContext.decodeAudioData(arrayBuffer);
  
  // 4. Create an OfflineAudioContext scaled specifically to Whisper's 16000Hz target
  const offlineContext = new OfflineAudioContext(
    1, // Mono channel
    audioBuffer.duration * 16000, // Total number of samples at 16kHz
    16000 // Target sample rate
  );
  
  // 5. Feed the original recording buffer into our target offline timeline
  const bufferSource = offlineContext.createBufferSource();
  bufferSource.buffer = audioBuffer;
  bufferSource.connect(offlineContext.destination);
  bufferSource.start();
  
  // 6. Run the downsampling audio graph math
  const renderedBuffer = await offlineContext.startRendering();
  
  // 7. Extract the pure Float32 matrix data array
  const rawFloat32Data = renderedBuffer.getChannelData(0);
  
  // Explicitly close the initial context thread to free up system memory
  await audioContext.close();
  
  return rawFloat32Data;
}