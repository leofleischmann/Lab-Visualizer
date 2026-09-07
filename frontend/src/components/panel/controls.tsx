import clsx from 'clsx';
import { ExternalLink } from 'lucide-react';
import type { ReactNode } from 'react';
import type { FieldDef } from '../../api/types';
import { useGraphStore } from '../../store/graph';

/**
 * In der Leseansicht eines Freigabelinks sind alle Eingaben gesperrt.
 *
 * Zentral hier statt an jedem Feld: die Panels rendern dieselben Bausteine wie
 * im Editor, und ein vergessenes `disabled` an einer einzelnen Stelle wäre
 * sonst nicht als solches erkennbar. Sperrt nur die Bedienung — verbindlich
 * ist, dass die Freigabe-Route ausschliesslich GET anbietet.
 */
export function useReadOnly(): boolean {
  return useGraphStore((s) => s.readOnly);
}

export function Field({ label, children }: { label: string; children: ReactNode }) {
  // Bewusst kein <label>: es würde verschachtelten Buttons (Markdown-Tabs,
  // Custom-Field-Zeilen) den Feldnamen als Accessible Name aufzwingen.
  return (
    <div className="block">
      <span className="mb-1 block text-[11px] font-medium uppercase tracking-wide text-slate-500">
        {label}
      </span>
      {children}
    </div>
  );
}

export function TextInput({
  value,
  onChange,
  placeholder,
  mono = false,
}: {
  value: string;
  onChange: (value: string) => void;
  placeholder?: string;
  mono?: boolean;
}) {
  const readOnly = useReadOnly();
  return (
    <input
      value={value}
      onChange={(e) => onChange(e.target.value)}
      placeholder={placeholder}
      spellCheck={false}
      readOnly={readOnly}
      className={clsx(
        'w-full rounded-md border border-slate-700 bg-slate-900 px-2 py-1.5 text-xs text-slate-200 placeholder:text-slate-600 focus:border-sky-500 focus:outline-none',
        mono && 'font-mono',
        readOnly && 'cursor-default text-slate-400'
      )}
    />
  );
}

/**
 * Eingabefeld für ein typisiertes Node-Feld. Welche Felder es gibt und welchen
 * Typ sie haben, kommt aus dem Backend-Katalog (`Catalog.fields`) — dieses
 * Modul kennt nur die TYPEN, keine konkreten Feldnamen. Ein neues Feld braucht
 * daher keine Änderung hier.
 *
 * Die Validierung ist bewusst nur eine Eingabehilfe (`type=number`,
 * `type=date`, Auswahlliste); verbindlich prüft das Backend
 * (backend/src/validation.js, fieldsSchema). Werte werden immer als String
 * transportiert, leerer String = nicht gesetzt.
 */
export function FieldInput({
  def,
  value,
  onChange,
}: {
  def: FieldDef;
  value: string;
  onChange: (value: string) => void;
}) {
  const readOnly = useReadOnly();
  const inputClass = clsx(
    'w-full rounded-md border border-slate-700 bg-slate-900 px-2 py-1.5 text-xs text-slate-200 placeholder:text-slate-600 focus:border-sky-500 focus:outline-none',
    def.mono && 'font-mono',
    readOnly && 'cursor-default text-slate-400'
  );

  if (def.type === 'select') {
    return (
      <select
        value={value}
        onChange={(e) => onChange(e.target.value)}
        disabled={readOnly}
        className={inputClass}
      >
        <option value="">— keine Angabe —</option>
        {/* Ein Wert, den der Katalog nicht (mehr) kennt, bleibt sichtbar statt
            beim nächsten Speichern still verloren zu gehen. */}
        {value && !def.options?.includes(value) && <option value={value}>{value}</option>}
        {def.options?.map((option) => (
          <option key={option} value={option}>
            {option}
          </option>
        ))}
      </select>
    );
  }

  const input = (
    <input
      type={def.type === 'number' ? 'number' : def.type === 'date' ? 'date' : 'text'}
      value={value}
      onChange={(e) => onChange(e.target.value)}
      placeholder={def.placeholder}
      spellCheck={false}
      readOnly={readOnly}
      className={inputClass}
    />
  );

  // URL: Direktlink neben dem Feld. Einheit (z. B. "GB") als Suffix.
  if (def.type === 'url' && value) {
    return (
      <div className="flex gap-1.5">
        {input}
        <a
          href={value}
          target="_blank"
          rel="noreferrer"
          title="URL öffnen"
          className="flex items-center rounded-md border border-slate-700 px-2 text-slate-400 transition-colors hover:border-sky-500 hover:text-sky-300"
        >
          <ExternalLink size={14} />
        </a>
      </div>
    );
  }
  if (def.unit) {
    return (
      <div className="flex items-center gap-1.5">
        {input}
        <span className="shrink-0 text-[11px] text-slate-500">{def.unit}</span>
      </div>
    );
  }
  return input;
}
