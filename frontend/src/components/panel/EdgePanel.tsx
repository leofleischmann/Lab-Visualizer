import { useEffect, useMemo, useState } from 'react';
import { ArrowLeftRight, ArrowRight, RotateCcw, Save, Trash2 } from 'lucide-react';
import type { ApiEdge, EdgePatch, LineStyle } from '../../api/types';
import { groupedEdgeKinds, kindOf } from '../../lib/catalog';
import { isRoutingCustomized, normalizeRouting } from '../../lib/edge/routing';
import { useGraphStore } from '../../store/graph';
import { CustomFieldsEditor, toRecord, toRows, type FieldRow } from './CustomFieldsEditor';
import { MarkdownEditor } from './MarkdownEditor';
import { Field, TextInput } from './controls';

type Draft = {
  label: string;
  kind: string;
  lineStyle: LineStyle;
  animated: boolean;
  notes: string;
  fields: FieldRow[];
};

const toDraft = (entity: ApiEdge): Draft => ({
  label: entity.label,
  kind: entity.kind,
  lineStyle: entity.lineStyle,
  animated: entity.animated,
  notes: entity.notes,
  fields: toRows(entity.customFields),
});

const LINE_STYLE_LABELS: Record<LineStyle, string> = {
  solid: 'Durchgezogen',
  dashed: 'Gestrichelt',
  dotted: 'Gepunktet',
};

export function EdgePanel({ entity }: { entity: ApiEdge }) {
  const catalog = useGraphStore((s) => s.catalog);
  const nodes = useGraphStore((s) => s.nodes);
  const saveEdge = useGraphStore((s) => s.saveEdge);
  const removeEdge = useGraphStore((s) => s.removeEdge);
  const resetEdgeRouting = useGraphStore((s) => s.resetEdgeRouting);

  const [draft, setDraft] = useState<Draft>(() => toDraft(entity));
  const [saving, setSaving] = useState(false);
  const routingCustomized = isRoutingCustomized(normalizeRouting(entity.routing));

  useEffect(() => {
    setDraft(toDraft(entity));
  }, [entity.id, entity.updatedAt]);

  const kind = kindOf(catalog, draft.kind);
  const nodeName = (id: string) =>
    nodes.find((n) => n.id === id)?.data.entity.name ?? id;

  const dirty = useMemo(() => {
    const original = toDraft(entity);
    return (
      JSON.stringify({ ...draft, fields: toRecord(draft.fields) }) !==
      JSON.stringify({ ...original, fields: toRecord(original.fields) })
    );
  }, [draft, entity]);

  const set = <K extends keyof Draft>(key: K, value: Draft[K]) =>
    setDraft((d) => ({ ...d, [key]: value }));

  const handleSave = async () => {
    setSaving(true);
    const patch: EdgePatch = {
      label: draft.label,
      kind: draft.kind,
      lineStyle: draft.lineStyle,
      animated: draft.animated,
      notes: draft.notes,
      customFields: toRecord(draft.fields),
    };
    await saveEdge(entity.id, patch);
    setSaving(false);
  };

  const handleDelete = () => {
    if (window.confirm('Diese Verbindung löschen?')) {
      void removeEdge(entity.id);
    }
  };

  return (
    <div className="flex h-full flex-col">
      <header className="border-b border-slate-800 px-4 py-3">
        <h2 className="text-sm font-semibold text-slate-100">Verbindung</h2>
        <div className="mt-1.5 flex items-center gap-1.5 text-xs text-slate-400">
          <span className="max-w-[42%] truncate rounded bg-slate-800 px-1.5 py-0.5">
            {nodeName(entity.sourceId)}
          </span>
          <ArrowRight size={12} style={{ color: kind.color }} />
          <span className="max-w-[42%] truncate rounded bg-slate-800 px-1.5 py-0.5">
            {nodeName(entity.targetId)}
          </span>
          <button
            type="button"
            onClick={() =>
              void saveEdge(entity.id, { sourceId: entity.targetId, targetId: entity.sourceId })
            }
            title="Richtung umkehren (Quelle ↔ Ziel)"
            className="ml-auto shrink-0 rounded-md border border-slate-700 p-1 text-slate-400 transition-colors hover:border-sky-500 hover:text-sky-300"
          >
            <ArrowLeftRight size={12} />
          </button>
        </div>
      </header>

      <div className="flex-1 space-y-4 overflow-y-auto px-4 py-4">
        <Field label="Beschriftung">
          <TextInput value={draft.label} onChange={(v) => set('label', v)} placeholder="z. B. Domain, Port, Protokoll" />
        </Field>

        <div className="grid grid-cols-2 gap-3">
          <Field label="Art">
            <select
              value={draft.kind}
              onChange={(e) => set('kind', e.target.value)}
              className="w-full rounded-md border border-slate-700 bg-slate-900 px-2 py-1.5 text-xs text-slate-200 focus:border-sky-500 focus:outline-none"
            >
              {/* Gruppiert nach Allgemein / Netzwerk / Betrieb: die allgemeinen
                  Beziehungen (Abhängigkeit, Datenfluss) stehen zuerst, damit
                  nicht-technische Diagramme nicht durch Protokolle scrollen. */}
              {groupedEdgeKinds(catalog).map(([groupName, kinds]) => (
                <optgroup key={groupName} label={groupName}>
                  {kinds.map((k) => (
                    <option key={k.id} value={k.id}>
                      {k.label}
                    </option>
                  ))}
                </optgroup>
              ))}
            </select>
          </Field>
          <Field label="Linienstil">
            <select
              value={draft.lineStyle}
              onChange={(e) => set('lineStyle', e.target.value as LineStyle)}
              className="w-full rounded-md border border-slate-700 bg-slate-900 px-2 py-1.5 text-xs text-slate-200 focus:border-sky-500 focus:outline-none"
            >
              {(catalog?.lineStyles ?? ['solid', 'dashed', 'dotted']).map((style) => (
                <option key={style} value={style}>
                  {LINE_STYLE_LABELS[style as LineStyle] ?? style}
                </option>
              ))}
            </select>
          </Field>
        </div>

        <label className="flex cursor-pointer items-center gap-2 text-xs text-slate-300">
          <input
            type="checkbox"
            checked={draft.animated}
            onChange={(e) => set('animated', e.target.checked)}
            className="h-3.5 w-3.5 accent-sky-500"
          />
          Animiert (Datenfluss visualisieren)
        </label>

        {routingCustomized && (
          <div className="rounded-md border border-slate-700 bg-slate-900/60 px-3 py-2">
            <p className="text-[11px] text-slate-400">
              Verlauf oder Label manuell angepasst. Am Canvas: Linie greifen und ziehen,
              Doppelklick auf die Linie fügt einen Eckpunkt ein (Doppelklick auf Eckpunkt
              entfernt ihn), Label entlang der Linie verschieben.
            </p>
            <button
              type="button"
              onClick={() => void resetEdgeRouting(entity.id)}
              className="mt-2 flex items-center gap-1.5 text-[11px] font-medium text-amber-300 hover:text-amber-200"
            >
              <RotateCcw size={12} /> Automatisches Routing wiederherstellen
            </button>
          </div>
        )}

        <Field label="Notizen (Markdown)">
          <MarkdownEditor value={draft.notes} onChange={(v) => set('notes', v)} />
        </Field>

        <Field label="Custom Fields">
          <CustomFieldsEditor rows={draft.fields} onChange={(rows) => set('fields', rows)} />
        </Field>

        <p className="text-[10px] text-slate-600">
          Erstellt: {new Date(entity.createdAt).toLocaleString('de-DE')} · Geändert:{' '}
          {new Date(entity.updatedAt).toLocaleString('de-DE')}
        </p>
      </div>

      <footer className="flex items-center gap-2 border-t border-slate-800 px-4 py-3">
        <button
          type="button"
          onClick={() => void handleSave()}
          disabled={!dirty || saving}
          className="flex flex-1 items-center justify-center gap-1.5 rounded-md bg-sky-600 px-3 py-2 text-xs font-semibold text-white transition-colors hover:bg-sky-500 disabled:cursor-not-allowed disabled:bg-slate-800 disabled:text-slate-500"
        >
          <Save size={14} /> {saving ? 'Speichert …' : 'Speichern'}
        </button>
        <button
          type="button"
          onClick={handleDelete}
          title="Verbindung löschen"
          className="flex items-center gap-1.5 rounded-md border border-red-900/60 px-3 py-2 text-xs font-medium text-red-400 transition-colors hover:bg-red-500/10"
        >
          <Trash2 size={14} /> Löschen
        </button>
      </footer>
    </div>
  );
}
