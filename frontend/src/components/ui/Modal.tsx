import { useEffect, type ReactNode } from 'react';
import { createPortal } from 'react-dom';
import { X } from 'lucide-react';

/**
 * Leichtgewichtiges Modal (Backdrop + Karte). Ersetzt window.prompt/confirm
 * für alles, was mehr als eine Ein-Wort-Antwort braucht.
 *
 * WICHTIG — zwei Fallstricke, die hier bewusst gelöst sind:
 *
 * 1. **Portal nach document.body.** `position: fixed` bezieht sich NICHT aufs
 *    Fenster, sobald ein Vorfahre `transform`, `filter`, `backdrop-filter`,
 *    `perspective`, `contain` oder `will-change` setzt — dann spannt dieser den
 *    Bezugsrahmen auf. Genau das passiert hier: TopBar.tsx nutzt
 *    `backdrop-blur` und ist nur 56 px hoch, also wurde jeder aus ihr geöffnete
 *    Dialog (Projekt anlegen, Projekt-Einstellungen, Passwort ändern, Konto
 *    löschen) in diesen Streifen eingesperrt. Das Portal hängt das Modal
 *    ausserhalb aller Vorfahren ein und macht es davon unabhängig.
 *    Wer dieses Modal umbaut: das createPortal nicht entfernen.
 *
 * 2. **Eigener Scrollbereich.** Ein inhaltsreicher Dialog (Vorlagen- und
 *    Baustein-Auswahl) kann höher als der Bildschirm werden. Ohne `max-h-full`
 *    plus scrollendem Inhaltsbereich verteilt `items-center` den Überhang nach
 *    oben UND unten, und die obere Hälfte wird unerreichbar — die Seite selbst
 *    scrollt nicht mit. Die Titelzeile bleibt dabei stehen.
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

  return createPortal(
    <div className="fixed inset-0 z-[70] flex items-center justify-center p-4">
      <div className="absolute inset-0 bg-slate-950/70 backdrop-blur-sm" onClick={onClose} />
      <div
        role="dialog"
        aria-modal="true"
        className={`relative flex max-h-full w-full ${maxWidth} flex-col rounded-xl border border-slate-700 bg-slate-900 shadow-2xl shadow-black/60`}
      >
        <div className="flex shrink-0 items-center justify-between gap-4 px-5 pb-4 pt-5">
          <h2 className="text-sm font-semibold text-slate-100">{title}</h2>
          <button
            type="button"
            onClick={onClose}
            title="Close"
            className="rounded-md p-1 text-slate-500 transition-colors hover:bg-slate-800 hover:text-slate-200"
          >
            <X size={16} />
          </button>
        </div>
        <div className="min-h-0 flex-1 overflow-y-auto px-5 pb-5">{children}</div>
      </div>
    </div>,
    document.body
  );
}
