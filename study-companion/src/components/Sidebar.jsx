import { useLiveQuery } from 'dexie-react-hooks';
import { db } from '../db/db';
import { exportSessionsToCSV } from '../db/exportCSV';
import { LuBookOpenText, LuX, LuWifiOff, LuLoader, LuPlus, LuDownload } from 'react-icons/lu'; 
import { FiSun, FiMoon } from 'react-icons/fi';

/**
 * Sidebar
 * 
 * Persistent on desktop, slide-in drawer on mobile.
 * The offline badge and dark mode toggle both live here —
 * both are always-accessible utility controls, not buried in settings.
 */
export default function Sidebar({
  activeSessionId,
  onSelectSession,
  onNewSession,
  modelsReady,
  studentName,
  isDark,
  onToggleTheme,
  onClose,
}) {
  const sessions = useLiveQuery(
    () => db.sessions.orderBy('updatedAt').reverse().toArray(),
    []
  );

  const handleExport = async () => {
    try {
      const count = await exportSessionsToCSV();
      if (count === null) alert('No session data yet to export.');
    } catch {
      alert('Export failed — check the console for details.');
    }
  };

  return (
    <div className="w-60 h-full flex flex-col bg-bg border-r border-border p-4 box-border">

      {/* Logo + close (mobile only) */}
      <div className="flex items-center justify-between mb-4">
        <div className="flex items-center gap-2">
          <div className="w-7 h-7 rounded-lg bg-accent-soft flex items-center justify-center">
            <LuBookOpenText className="text-accent text-base" aria-hidden="true" />
          </div>
          <span className="font-display font-semibold text-[15.5px] text-text-primary">Study Mate</span>
        </div>
        {onClose && (
          <button onClick={onClose} aria-label="Close menu" className="text-text-secondary p-1 cursor-pointer">
            <LuX className="w-6 h-6" aria-hidden="true" />
          </button>
        )}
      </div>

      {/* Offline badge */}
      <div className={`flex items-center gap-1.5 rounded-lg px-2.5 py-2 mb-3 text-[11.5px]
        ${modelsReady ? 'bg-engaged-bg text-engaged-text' : 'bg-confused-bg text-confused-text'}`}>
        {modelsReady ? (
          <LuWifiOff className="w-3.5 h-3.5 text-text-secondary" aria-hidden="true" />
        ) : (
          <LuLoader className="w-3.5 h-3.5 animate-spin text-accent" aria-hidden="true" />
        )}
        <span>{modelsReady ? 'Ready to use offline' : 'Loading models...'}</span>
      </div>

      {/* New session */}
      <button
        onClick={onNewSession}
        className="w-full bg-text-primary text-surface rounded-lg px-3 py-2.5 text-[13px] font-medium
                   mb-4 flex items-center justify-center gap-1.5 cursor-pointer border-none"
      >
        <LuPlus className="w-4 h-4 text-green" strokeWidth={2.5} aria-hidden="true" />
        New session
      </button>

      {/* Session list */}
      <p className="text-[11px] text-text-tertiary mb-2 ml-0.5 uppercase tracking-wide">
        Recent sessions
      </p>
      <div className="flex flex-col gap-0.5 flex-1 overflow-y-auto">
        {sessions?.length === 0 && (
          <p className="text-[12.5px] text-text-tertiary px-2.5 py-2">
            No sessions yet — start one above.
          </p>
        )}
        {sessions?.map(session => (
          <button
            key={session.id}
            onClick={() => onSelectSession(session.id)}
            className={`text-left rounded-lg px-2.5 py-2 cursor-pointer border-none
              ${session.id === activeSessionId ? 'bg-surface-muted' : 'bg-transparent'}`}
          >
            <p className="text-[12.5px] font-medium m-0 text-text-primary truncate">
              {session.title}
            </p>
            <p className="text-[11px] text-text-secondary mt-0.5 m-0">
              {formatRelativeTime(session.updatedAt)}
            </p>
          </button>
        ))}
      </div>

      {/* Export */}
      <button
        onClick={handleExport}
        className="text-[11px] text-text-secondary border border-border rounded-lg px-2.5 py-2 mb-2
                   flex items-center justify-center gap-1.5 cursor-pointer bg-transparent"
      >
        <LuDownload className="w-3.5 h-3.5 text-text-secondary" aria-hidden="true" />
        Export session data
      </button>

      {/* Footer: profile + dark mode toggle */}
      <div className="border-t border-border pt-2.5 flex items-center gap-2">
        <div className="w-6 h-6 rounded-full bg-accent-soft flex items-center justify-center
                        text-[11px] font-semibold text-accent shrink-0">
          {studentName?.slice(0, 2).toUpperCase() ?? 'ST'}
        </div>
        <span className="text-[12.5px] text-text-primary flex-1 truncate">
          {studentName ?? 'Student'}
        </span>

        {/* Dark mode toggle */}
        <button
          onClick={onToggleTheme}
          aria-label={isDark ? 'Switch to light mode' : 'Switch to dark mode'}
          className="p-1.5 rounded-lg bg-surface-muted text-text-secondary cursor-pointer border-none
                     hover:text-text-primary transition-colors"
        >
          {isDark ? (
                <FiSun className="w-3.75 h-3.75" aria-hidden="true" />
              ) : (
                <FiMoon className="w-3.75 h-3.75" aria-hidden="true" />
              )}
        </button>
      </div>
    </div>
  );
}

function formatRelativeTime(date) {
  if (!date) return '';
  const d = date instanceof Date ? date : new Date(date);
  const diffMs = Date.now() - d.getTime();
  const diffMins = Math.floor(diffMs / 60000);
  if (diffMins < 1) return 'Just now';
  if (diffMins < 60) return `${diffMins}m ago`;
  const diffHours = Math.floor(diffMins / 60);
  if (diffHours < 24) return `${diffHours}h ago`;
  const diffDays = Math.floor(diffHours / 24);
  if (diffDays === 1) return 'Yesterday';
  if (diffDays < 7) return `${diffDays} days ago`;
  return d.toLocaleDateString();
}