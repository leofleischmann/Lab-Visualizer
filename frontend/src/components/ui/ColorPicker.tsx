import clsx from 'clsx';
import { Check } from 'lucide-react';

/**
 * Farbwahl aus einer festen Palette.
 *
 * Bewusst eine Palette statt eines freien Farbwählers: die Farben stammen aus
 * derselben Tailwind-Reihe wie der Katalog (backend/src/catalog/), damit
 * eigene Zonen und Nodes nicht aus dem Gesamtbild fallen. `null` bedeutet
 * „Farbe der Kategorie" bzw. „Standard".
 *
 * Genutzt von: panel/NodePanel.tsx (Node- und Zonenfarbe),
 * projects/ProjectSettingsDialog.tsx, views/ViewStyleDialog.tsx.
 */
export const PALETTE = [
  '#ef4444', // rot
  '#f97316', // orange
  '#eab308', // gelb
  '#84cc16', // limette
  '#22c55e', // grün
  '#14b8a6', // türkis
  '#38bdf8', // himmelblau
  '#6366f1', // indigo
  '#a78bfa', // violett
  '#ec4899', // pink
  '#94a3b8', // grau
];

export function ColorPicker({
  value,
  onChange,
  defaultLabel = 'Standard',
}: {
  value: string | null;
  onChange: (color: string | null) => void;
  defaultLabel?: string;
}) {
  return (
    <div className="flex flex-wrap items-center gap-1.5">
      <button
        type="button"
        onClick={() => onChange(null)}
        title={defaultLabel}
        className={clsx(
          'flex h-6 items-center rounded-md border px-2 text-[10px] transition-colors',
          value === null
            ? 'border-sky-500 bg-sky-500/10 text-sky-200'
            : 'border-slate-700 text-slate-500 hover:border-slate-500'
        )}
      >
        {defaultLabel}
      </button>
      {PALETTE.map((color) => (
        <button
          key={color}
          type="button"
          onClick={() => onChange(color)}
          title={color}
          className={clsx(
            'flex h-6 w-6 items-center justify-center rounded-md border transition-transform hover:scale-110',
            value === color ? 'border-slate-200' : 'border-transparent'
          )}
          style={{ backgroundColor: color }}
        >
          {value === color && <Check size={12} className="text-slate-900" strokeWidth={3} />}
        </button>
      ))}
    </div>
  );
}
