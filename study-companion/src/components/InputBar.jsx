import { useState, useRef, useEffect } from 'react';
import { LuMic, LuSquare, LuSend } from 'react-icons/lu';

/**
 * InputBar
 * 
 * Single control combining voice and text input. While recording,
 * the text field is replaced by a live waveform + transcript preview
 * so the student gets confirmation the mic is actually working —
 * a real concern on the lower-end Android devices this project targets.
 * 
 * Keyboard behaviour:
 *   Enter           → send (if text is non-empty and not processing)
 *   Shift + Enter   → insert newline (standard multi-line convention)
 */
export default function InputBar({
  isRecording,
  isProcessing,
  onStartRecording,
  onStopRecording,
  onSubmitText,
  livePreviewText,
}) {
  const [text, setText] = useState('');
  const textareaRef = useRef(null);

  // Auto-grow the textarea up to ~5 lines, then scroll inside it
  useEffect(() => {
    const el = textareaRef.current;
    if (!el) return;
    el.style.height = 'auto';
    el.style.height = `${Math.min(el.scrollHeight, 120)}px`;
  }, [text]);

  const submit = () => {
    if (!text.trim() || isProcessing) return;
    onSubmitText(text.trim());
    setText('');
    // Reset height after clearing
    if (textareaRef.current) textareaRef.current.style.height = '40px';
  };

  const handleKeyDown = (e) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault(); // stop textarea inserting a newline
      submit();
    }
    // Shift+Enter falls through naturally — textarea inserts \n as normal
  };

  const handleSubmit = (e) => {
    e.preventDefault();
    submit();
  };

  if (isRecording) {
    return (
      <div className="border-t border-border px-5 py-3 flex items-center gap-3">
        <button
          onClick={onStopRecording}
          aria-label="Stop recording"
          className="w-9.5 h-9.5 rounded-full border-none bg-frustrated-bg text-danger
                     flex items-center justify-center shrink-0 cursor-pointer"
        >
          <LuSquare className="w-5 h-5" aria-hidden="true" />
        </button>

        <div className="flex gap-0.75 items-center h-5.5">
          {[10, 18, 14, 22, 9, 16, 12].map((h, i) => (
            <span
              key={i}
              className="w-0.75 rounded-sm bg-accent"
              style={{ height: h, animation: `studymate-wave 0.9s ${i * 0.08}s infinite ease-in-out` }}
            />
          ))}
        </div>

        <p className="flex-1 text-[12.5px] text-text-secondary italic truncate m-0">
          {livePreviewText || 'Listening...'}
        </p>
      </div>
    );
  }

  return (
    <form onSubmit={handleSubmit} className="border-t border-border px-5 py-3 flex gap-2.5 items-end">
      <button
        type="button"
        onClick={onStartRecording}
        disabled={isProcessing}
        aria-label="Record voice message"
        className={`w-9.5 h-9.5 rounded-full border border-border bg-surface flex items-center justify-center
          shrink-0 ${isProcessing ? 'text-text-tertiary cursor-not-allowed' : 'text-text-primary cursor-pointer'}`}
      >
        <LuMic className="text-accent text-base" aria-hidden="true" />
      </button>

      <textarea
        ref={textareaRef}
        value={text}
        onChange={(e) => setText(e.target.value)}
        onKeyDown={handleKeyDown}
        disabled={isProcessing}
        placeholder="Type or speak"
        rows={1}
        className={`flex-1 border border-border rounded-[10px] px-3.5 py-2.5 text-[13.5px] text-text-primary
          outline-none resize-none leading-relaxed ${isProcessing ? 'bg-surface-muted' : 'bg-surface'}`}
        style={{
          minHeight: '40px',
          maxHeight: '120px',       // ~5 lines before it scrolls internally
          scrollbarWidth: 'none',
          msOverflowStyle: 'none',
        }}
      />

      <button
        type="submit"
        disabled={isProcessing || !text.trim()}
        aria-label="Send message"
        className={`w-9.5 h-9.5 rounded-[10px] border-none flex items-center justify-center shrink-0
          ${isProcessing || !text.trim()
            ? 'bg-surface-muted text-text-tertiary cursor-not-allowed'
            : 'bg-accent text-white cursor-pointer'}`}
      >
        <LuSend className="w-5 h-5" aria-hidden="true" />
      </button>
    </form>
  );
}