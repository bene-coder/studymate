import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import { LuMic } from 'react-icons/lu';

/**
 * MessageBubble
 * 
 * Renders a single turn in the conversation. User messages align right
 * with a muted fill; AI responses align left with a bordered surface
 * so long explanations stay easy to read against the page background.
 * 
 * AI messages are rendered through ReactMarkdown so bold, code, lists,
 * and fenced code blocks display correctly instead of raw asterisks/backticks.
 */
export default function MessageBubble({ role, content, inputMode, durationLabel, isStreaming }) {
  const isUser = role === 'user';

  return (
    <div className={`flex flex-col max-w-[78%] ${isUser ? 'items-end self-end' : 'items-start self-start'}`}>
      <div
        className={`rounded-2xl px-4 py-2.5 text-[14.5px] leading-relaxed text-text-primary
          ${isUser
            ? 'bg-surface-muted whitespace-pre-wrap'
            : 'bg-surface border border-border ai-prose'
          }`}
      >
        {isUser ? (
          content
        ) : (
          <ReactMarkdown
            remarkPlugins={[remarkGfm]}
            components={{
              // Paragraphs — kill default margins except between siblings
              p: ({ children }) => (
                <p className="m-0 [&+p]:mt-2">{children}</p>
              ),
              // Inline code — subtle pill
              code: ({ inline, children }) =>
                inline ? (
                  <code className="bg-surface-muted text-accent font-mono text-[13px] px-1.5 py-0.5 rounded-md">
                    {children}
                  </code>
                ) : (
                  <code>{children}</code>
                ),
              // Fenced code blocks
              pre: ({ children }) => (
                <pre className="bg-surface-muted font-mono text-[13px] rounded-xl px-4 py-3 mt-2 mb-1 overflow-x-auto">
                  {children}
                </pre>
              ),
              // Bold
              strong: ({ children }) => (
                <strong className="font-semibold text-text-primary">{children}</strong>
              ),
              // Italic
              em: ({ children }) => (
                <em className="italic text-text-secondary">{children}</em>
              ),
              // Unordered lists
              ul: ({ children }) => (
                <ul className="list-disc list-outside pl-5 mt-1.5 mb-1 space-y-1">{children}</ul>
              ),
              // Ordered lists
              ol: ({ children }) => (
                <ol className="list-decimal list-outside pl-5 mt-1.5 mb-1 space-y-1">{children}</ol>
              ),
              li: ({ children }) => (
                <li className="text-[14.5px] leading-relaxed">{children}</li>
              ),
              // Headings — AI occasionally uses these for structured explanations
              h1: ({ children }) => (
                <h1 className="font-display font-semibold text-base mt-3 mb-1">{children}</h1>
              ),
              h2: ({ children }) => (
                <h2 className="font-display font-semibold text-[14.5px] mt-2.5 mb-1">{children}</h2>
              ),
              h3: ({ children }) => (
                <h3 className="font-semibold text-[14px] mt-2 mb-0.5">{children}</h3>
              ),
              // Blockquotes — used for callouts or quoted context
              blockquote: ({ children }) => (
                <blockquote className="border-l-2 border-accent pl-3 text-text-secondary italic my-2">
                  {children}
                </blockquote>
              ),
              // Horizontal rule
              hr: () => <hr className="border-border my-3" />,
            }}
          >
            {content}
          </ReactMarkdown>
        )}

        {isStreaming && (
          <span
            aria-hidden="true"
            className="inline-block w-0.5 h-3.5 bg-accent ml-0.5 align-middle animate-[studymate-blink_1s_steps(1)_infinite]"
          />
        )}
      </div>

      {isUser && inputMode === 'voice' && (
        <span className="text-[11px] text-text-tertiary mt-1 mr-1 flex items-center gap-1">
          <LuMic className="w-3.5 h-3.5" aria-hidden="true" />
          voice {durationLabel ? `· ${durationLabel}` : ''}
        </span>
      )}
    </div>
  );
}