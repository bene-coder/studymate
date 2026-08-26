/**
 * TypingIndicator
 * 
 * Shown while the fusion pipeline (MFCC + Whisper + AfriBERTa + Gemini)
 * is working. Copy is deliberately non-technical.
 */
const STAGE_LABELS = {
  transcribing: 'Listening closely...',
  analyzing: 'Reading the tone of your message...',
  generating: 'Thinking it through...',
};

export default function TypingIndicator({ stage }) {
  const label = STAGE_LABELS[stage] ?? 'Thinking it through...';

  return (
    <div className="flex items-center gap-2.5 self-start py-2.5 px-1">
      <div className="flex gap-1">
        {[0, 1, 2].map(i => (
          <span
            key={i}
            className="w-1.5 h-1.5 rounded-full bg-text-tertiary"
            style={{ animation: `studymate-bounce 1.2s ${i * 0.15}s infinite ease-in-out` }}
          />
        ))}
      </div>
      <span className="text-[12.5px] text-text-secondary">{label}</span>
    </div>
  );
}