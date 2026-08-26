/**
 * EmotionBadge
 * 
 * Surfaces the fused emotional state to the student without sounding
 * clinical or surveillance-like.
 */

const EMOTION_STYLES = {
  frustrated: { label: 'a bit frustrated', bg: 'bg-frustrated-bg', text: 'text-frustrated-text', dot: 'bg-frustrated-dot' },
  confused:   { label: 'working through it', bg: 'bg-confused-bg', text: 'text-confused-text', dot: 'bg-confused-dot' },
  bored:      { label: 'could use a challenge', bg: 'bg-bored-bg', text: 'text-bored-text', dot: 'bg-bored-dot' },
  engaged:    { label: 'in the flow', bg: 'bg-engaged-bg', text: 'text-engaged-text', dot: 'bg-engaged-dot' },
};

export default function EmotionBadge({ emotionalState, compact = false }) {
  if (!emotionalState) return null;

  const style = EMOTION_STYLES[emotionalState] ?? EMOTION_STYLES.confused;

  return (
    <div
      className={`inline-flex items-center gap-1.5 rounded-full whitespace-nowrap font-medium
        ${style.bg} ${style.text}
        ${compact ? 'px-2 py-1 text-[11px]' : 'px-3 py-1.5 text-xs'}`}
    >
      <span className={`w-1.5 h-1.5 rounded-full shrink-0 ${style.dot}`} />
      {!compact && <span>{style.label}</span>}
    </div>
  );
}   