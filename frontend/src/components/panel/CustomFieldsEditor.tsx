import { Plus, Trash2 } from 'lucide-react';
import { useReadOnly } from './controls';

export type FieldRow = { key: string; value: string };

type Props = {
  rows: FieldRow[];
  onChange: (rows: FieldRow[]) => void;
};

export function toRows(fields: Record<string, string>): FieldRow[] {
  return Object.entries(fields).map(([key, value]) => ({ key, value }));
}

export function toRecord(rows: FieldRow[]): Record<string, string> {
  const record: Record<string, string> = {};
  for (const row of rows) {
    const key = row.key.trim();
    if (key) record[key] = row.value;
  }
  return record;
}

export function CustomFieldsEditor({ rows, onChange }: Props) {
  const readOnly = useReadOnly();
  const update = (index: number, patch: Partial<FieldRow>) =>
    onChange(rows.map((row, i) => (i === index ? { ...row, ...patch } : row)));

  const duplicates = new Set(
    rows
      .map((r) => r.key.trim())
      .filter((key, i, all) => key && all.indexOf(key) !== i)
  );

  return (
    <div className="space-y-1.5">
      {rows.map((row, index) => (
        <div key={index} className="flex items-center gap-1.5">
          <input
            value={row.key}
            onChange={(e) => update(index, { key: e.target.value })}
            readOnly={readOnly}
            placeholder="Key"
            className={`w-2/5 rounded-md border bg-slate-900 px-2 py-1.5 text-xs text-slate-200 placeholder:text-slate-600 focus:border-sky-500 focus:outline-none ${
              duplicates.has(row.key.trim()) ? 'border-red-500' : 'border-slate-700'
            }`}
          />
          <input
            value={row.value}
            onChange={(e) => update(index, { value: e.target.value })}
            readOnly={readOnly}
            placeholder="Value"
            className="flex-1 rounded-md border border-slate-700 bg-slate-900 px-2 py-1.5 text-xs text-slate-200 placeholder:text-slate-600 focus:border-sky-500 focus:outline-none"
          />
          {!readOnly && (
          <button
            type="button"
            title="Remove field"
            onClick={() => onChange(rows.filter((_, i) => i !== index))}
            className="rounded-md p-1.5 text-slate-500 transition-colors hover:bg-red-500/10 hover:text-red-400"
          >
            <Trash2 size={14} />
          </button>
          )}
        </div>
      ))}
      {duplicates.size > 0 && (
        <p className="text-[11px] text-red-400">
          Duplicate keys are merged when saving.
        </p>
      )}
      {!readOnly && (
      <button
        type="button"
        onClick={() => onChange([...rows, { key: '', value: '' }])}
        className="flex items-center gap-1.5 rounded-md border border-dashed border-slate-600 px-2.5 py-1.5 text-xs text-slate-400 transition-colors hover:border-sky-500 hover:text-sky-300"
      >
        <Plus size={13} /> Add field
      </button>
      )}
    </div>
  );
}
