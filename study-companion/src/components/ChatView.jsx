import { useEffect, useRef } from 'react';
import EmotionBadge from './EmotionBadge';
import MessageBubble from './MessageBubble';
import TypingIndicator from './TypingIndicator';
import InputBar from "./InputBar";
import { FiSun, FiMoon } from 'react-icons/fi';
import { LuBookOpenText, LuMenu } from 'react-icons/lu';


/**
 * ChatView
 *
 * Main conversation surface. Header has the session title, emotion badge,
 * and on mobile — the menu button and dark mode toggle.
 *
 * Mobile keyboard fixes applied here:
 *
 * 1. Root div uses `h-[100dvh]` (dynamic viewport height) instead of `h-full`
 *    or `h-screen`. dvh shrinks when the virtual keyboard opens, so the
 *    InputBar stays pinned above the keyboard rather than sliding under it.
 *
 * 2. A `visualViewport` resize listener fires whenever the keyboard
 *    opens/closes and scrolls the message list to the bottom. This prevents
 *    the double-tap issue where the textarea appears off-screen after the
 *    keyboard raises the viewport.
 */
export default function ChatView({
  sessionTitle,
  sessionSubject,
  messages,
  currentEmotionalState,
  pipelineStage,
  isRecording,
  isProcessing,
  livePreviewText,
  onStartRecording,
  onStopRecording,
  onSubmitText,
  onOpenMenu,
  isDark,
  onToggleTheme,
}) {
  const scrollRef = useRef(null);

  // Scroll to bottom when messages change or pipeline stage updates
  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
  }, [messages, pipelineStage]);

  // Re-scroll when the virtual keyboard opens or closes.
  // visualViewport fires a resize event as the keyboard animates in —
  // scrolling at that point keeps the latest message visible and the
  // InputBar immediately above the keyboard.
  useEffect(() => {
    const vv = window.visualViewport;
    if (!vv) return;

    const handleViewportResize = () => {
      if (scrollRef.current) {
        // Small timeout lets the browser finish repositioning the layout
        // before we scroll, otherwise we scroll to the pre-keyboard bottom.
        setTimeout(() => {
          scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
        }, 50);
      }
    };

    vv.addEventListener('resize', handleViewportResize);
    return () => vv.removeEventListener('resize', handleViewportResize);
  }, []);

  return (
    <div className="flex-1 flex flex-col h-dvh bg-bg min-w-0 overflow-hidden">

      {/* Header */}
      <div className="border-b border-border px-5 py-3.5 flex items-center justify-between gap-2.5 bg-surface shrink-0">
        <div className="flex items-center gap-2.5 min-w-0">
          {onOpenMenu && (
            <button
              onClick={onOpenMenu}
              aria-label="Open menu"
              className="p-1 shrink-0 text-text-primary cursor-pointer border-none bg-transparent"
            >
              <LuMenu className="w-6 h-6" aria-hidden="true" />
            </button>
          )}
          <div className="min-w-0">
            <p className="font-display font-semibold text-[14.5px] text-text-primary m-0 truncate">
              {sessionTitle || 'New session'}
            </p>
            {sessionSubject && (
              <p className="text-[11.5px] text-text-secondary m-0">{sessionSubject}</p>
            )}
          </div>
        </div>

        <div className="flex items-center gap-2 shrink-0">
          <EmotionBadge emotionalState={currentEmotionalState} />

          {/* Dark mode toggle — visible on mobile only (desktop toggle is in sidebar) */}
          {onOpenMenu && (
            <button
              onClick={onToggleTheme}
              aria-label={isDark ? 'Switch to light mode' : 'Switch to dark mode'}
              className="p-1.5 rounded-lg bg-surface-muted text-text-secondary cursor-pointer
                         border-none hover:text-text-primary transition-colors"
            >
              {isDark ? (
                <FiSun className="w-3.75 h-3.75" aria-hidden="true" />
              ) : (
                <FiMoon className="w-3.75 h-3.75" aria-hidden="true" />
              )}
            </button>
          )}
        </div>
      </div>

      {/* Messages — flex-1 takes all remaining space between header and InputBar.
          hide-scrollbar removes the native scrollbar while keeping scroll behaviour. */}
      <div
        ref={scrollRef}
        className="flex-1 overflow-y-auto px-5 py-5 flex flex-col gap-3.5 hide-scrollbar"
      >
        {messages.length === 0 && !pipelineStage && <EmptyState />}

        {messages.map((msg) => (
          <MessageBubble
            key={msg.id}
            role={msg.role}
            content={msg.content}
            inputMode={msg.inputMode}
            durationLabel={msg.durationLabel}
            isStreaming={msg.isStreaming}
          />
        ))}

        {pipelineStage && <TypingIndicator stage={pipelineStage} />}
      </div>

      {/* InputBar — shrink-0 keeps it at its natural height and never lets
          flex compress it when the message list grows. */}
      <div className="shrink-0">
        <InputBar
          isRecording={isRecording}
          isProcessing={isProcessing}
          onStartRecording={onStartRecording}
          onStopRecording={onStopRecording}
          onSubmitText={onSubmitText}
          livePreviewText={livePreviewText}
        />
      </div>
    </div>
  );
}

function EmptyState() {
  return (
    <div className="flex-1 flex flex-col items-center justify-center text-center px-5 py-10">
      <div className="w-12 h-12 rounded-2xl bg-accent-soft flex items-center justify-center mb-3.5">
        <LuBookOpenText className="text-accent text-base w-6 h-6" aria-hidden="true" />
      </div>
      <p className="font-display text-base text-text-primary mb-1.5 m-0">
        What are we studying today?
      </p>
      <p className="text-[13px] text-text-secondary max-w-70 m-0">
        Type a question or use your voice — in English, Pidgin, or however you'd normally explain it.
      </p>
    </div>
  );
}