import { useEffect, type ReactNode } from 'react';
import { X } from 'lucide-react';

/**
 * Leichtgewichtiges Modal (Backdrop + Karte). Ersetzt window.prompt/confirm
 * für alles, was mehr als eine Ein-Wort-Antwort braucht.
 */
export function Modal({
  title,
  onClose,
  children,
  maxWidth = 'max-w-md',
}: {
  title: string;
  onClose: () => void;
  children: ReactNode;
  maxWidth?: string;
}) {
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);

  return (
    <div className="fixed inset-0 z-[70] flex items-center justify-center p-4">
      <div className="absolute inset-0 bg-slate-950/70 backdrop-blur-sm" onClick={onClose} />
      <div
        role="dialog"
        aria-modal="true"
        className={`relative w-full ${maxWidth} rounded-xl border border-slate-700 bg-slate-900 p-5 shadow-2xl shadow-black/60`}
      >
        <div className="mb-4 flex items-center justify-between gap-4">
          <h2 className="text-sm font-semibold text-slate-100">{title}</h2>
          <button
            type="button"
            onClick={onClose}
            title="Schließen"
            className="rounded-md p-1 text-slate-500 transition-colors hover:bg-slate-800 hover:text-slate-200"
          >
            <X size={16} />
          </button>
        </div>
        {children}
      </div>
    </div>
  );
}
