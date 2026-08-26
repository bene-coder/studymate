/**
 * MobileDrawer
 * 
 * Wraps any content (the Sidebar) in a slide-in overlay for mobile.
 * Tapping the backdrop closes it, matching standard mobile drawer behavior.
 */
export default function MobileDrawer({ isOpen, onClose, children }) {
  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex">
      <div
        className="w-65 max-w-[82vw] h-full bg-bg shadow-[2px_0_16px_rgba(0,0,0,0.12)]"
        style={{ animation: 'studymate-slide-in 0.2s ease-out' }}
      >
        {children}
      </div>

      <div onClick={onClose} aria-hidden="true" className="flex-1 bg-black/25" />
    </div>
  );
}