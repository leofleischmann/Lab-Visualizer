import { useEffect, useMemo, useState } from 'react';
import { ChevronDown, ChevronRight, Copy, ImagePlus, Layers, Plus, Save, Trash2, X } from 'lucide-react';
import clsx from 'clsx';
import type { ApiNode, FieldDef, NodePatch } from '../../api/types';
import {
  categoryOf,
  groupedCategories,
  groupedFields,
  isInactiveCategory,
  orphanFields,
  ORPHAN_GROUP,
} from '../../lib/catalog';
import { EntityIcon } from '../../lib/icons';
import { ColorPicker } from '../ui/ColorPicker';
import { IconPicker } from './IconPicker';
import { absolutePosition, useGraphStore } from '../../store/graph';
import { CustomFieldsEditor, toRecord, toRows, type FieldRow } from './CustomFieldsEditor';
import { MarkdownEditor } from './MarkdownEditor';
import { Field, FieldInput, TextInput } from './controls';

type Draft = {
  name: string;
  category: string;
  status: string;
  parentId: string;
  /** Eigenes Icon; null = Icon der Kategorie. */
  icon: string | null;
  /** Eigene Farbe; null = Farbe der Kategorie. */
  color: string | null;
  /** Typisierte Felder (Schlüssel aus dem Backend-Katalog). */
  fields: Record<string, string>;
  notes: string;
  /** Freiform-Key-Value (Custom Fields) als editierbare Zeilenliste. */
  customRows: FieldRow[];
};

const toDraft = (entity: ApiNode): Draft => ({
  name: entity.name,
  category: entity.category,
  status: entity.status,
  parentId: entity.parentId ?? '',
  icon: entity.icon,
  color: entity.color,
  fields: { ...entity.fields },
  notes: entity.notes,
  customRows: toRows(entity.customFields),
});

/**
 * Werte trimmen und leere entfernen: „nicht gesetzt" wird nicht persistiert.
 * Ohne das bliebe der Speichern-Button aktiv, sobald jemand in ein leeres Feld
 * tippt und den Text wieder löscht — und ein " 192.168.1.1" mit Leerzeichen
 * würde die Suche verfehlen.
 */
const compactFields = (fields: Record<string, string>): Record<string, string> =>
  Object.fromEntries(
    Object.entries(fields)
      .map(([key, value]) => [key, value.trim()] as const)
      .filter(([, value]) => value !== '')
  );

/**
 * Ein Abschnitt typisierter Felder (Allgemein, Netzwerk, System, …). Gruppen
 * ohne einen einzigen Wert starten eingeklappt, damit das Panel nicht zur
 * Formularwand wird — für ein Setup ohne Netzwerkbezug bleibt „Netzwerk"
 * einfach zu.
 */
function FieldGroup({
  name,
  defs,
  values,
  onChange,
  hint,
}: {
  name: string;
  defs: FieldDef[];
  values: Record<string, string>;
  onChange: (key: string, value: string) => void;
  hint?: string;
}) {
  const filled = defs.filter((d) => (values[d.key] ?? '') !== '').length;
  const [open, setOpen] = useState(filled > 0);
  const Chevron = open ? ChevronDown : ChevronRight;

  return (
    <div className="rounded-md border border-slate-800">
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        className="flex w-full items-center gap-1.5 px-2.5 py-2 text-left text-[11px] font-medium uppercase tracking-wide text-slate-500 transition-colors hover:text-slate-300"
      >
        <Chevron size={13} />
        <span className="flex-1">{name}</span>
        {filled > 0 && (
          <span className="rounded bg-slate-800 px-1.5 py-0.5 text-[10px] normal-case tracking-normal text-slate-400">
            {filled}
          </span>
        )}
      </button>
      {open && (
        <div className="grid grid-cols-2 gap-3 border-t border-slate-800 px-2.5 py-3">
          {hint && <p className="col-span-2 text-[10px] leading-relaxed text-slate-600">{hint}</p>}
          {defs.map((def) => (
            <div key={def.key} className={clsx(def.wide && 'col-span-2')}>
              <Field label={def.label}>
                <FieldInput
                  def={def}
                  value={values[def.key] ?? ''}
                  onChange={(value) => onChange(def.key, value)}
                />
              </Field>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

export function NodePanel({ entity }: { entity: ApiNode }) {
  const catalog = useGraphStore((s) => s.catalog);
  const nodes = useGraphStore((s) => s.nodes);
  const views = useGraphStore((s) => s.views);
  const saveNode = useGraphStore((s) => s.saveNode);
  const removeNode = useGraphStore((s) => s.removeNode);
  const duplicateNode = useGraphStore((s) => s.duplicateNode);
  const createDetailView = useGraphStore((s) => s.createDetailView);
  const setActiveView = useGraphStore((s) => s.setActiveView);

  const linkedView = views.find((v) => v.id === entity.linkedViewId) ?? null;

  const [draft, setDraft] = useState<Draft>(() => toDraft(entity));
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    setDraft(toDraft(entity));
  }, [entity.id, entity.updatedAt]);

  const category = categoryOf(catalog, draft.category);
  const [pickingIcon, setPickingIcon] = useState(false);
  const effectiveColor = draft.color ?? category.color;

  const zoneOptions = useMemo(
    () =>
      nodes.filter(
        (n) => n.data.entity.category === 'group' && n.id !== entity.id
      ),
    [nodes, entity.id]
  );

  // Katalog-Gruppen plus die Werte, für die der aktive Katalog keine Definition
  // hat — damit ein abgewähltes Pack keine Daten unsichtbar macht.
  const orphanKeys = Object.keys(draft.fields).join(',');
  const fieldGroups = useMemo(() => {
    const orphans = orphanFields(catalog, draft.fields);
    return [
      ...groupedFields(catalog),
      ...(orphans.length ? ([[ORPHAN_GROUP, orphans]] as [string, FieldDef[]][]) : []),
    ];
    // Hängt bewusst nur an den SCHLÜSSELN, nicht an den Werten: sonst würde die
    // Liste bei jedem Tastendruck neu gebaut.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [catalog, orphanKeys]);

  const dirty = useMemo(() => {
    const normalize = (d: Draft) => ({
      ...d,
      fields: compactFields(d.fields),
      customRows: toRecord(d.customRows),
    });
    return JSON.stringify(normalize(draft)) !== JSON.stringify(normalize(toDraft(entity)));
  }, [draft, entity]);

  const set = <K extends keyof Draft>(key: K, value: Draft[K]) =>
    setDraft((d) => ({ ...d, [key]: value }));

  const handleSave = async () => {
    setSaving(true);
    const fields = compactFields(draft.fields);
    console.debug('[Debug NodePanel]: speichere Node', entity.id, {
      fields,
      customFields: Object.keys(toRecord(draft.customRows)).length,
    });
    const patch: NodePatch = {
      name: draft.name.trim() || entity.name,
      category: draft.category,
      status: draft.status,
      icon: draft.icon,
      color: draft.color,
      fields,
      notes: draft.notes,
      customFields: toRecord(draft.customRows),
    };
    const newParent = draft.parentId || null;
    if (newParent !== (entity.parentId ?? null)) {
      patch.parentId = newParent;
      // Absolute Canvas-Position beibehalten: relative Position zum neuen Parent berechnen
      const abs = absolutePosition(nodes, entity.id);
      const parentAbs = newParent ? absolutePosition(nodes, newParent) : { x: 0, y: 0 };
      patch.position = { x: abs.x - parentAbs.x, y: abs.y - parentAbs.y };
    }
    await saveNode(entity.id, patch);
    setSaving(false);
  };

  const handleDelete = () => {
    if (window.confirm(`"${entity.name}" inkl. aller verbundenen Kanten löschen?`)) {
      void removeNode(entity.id);
    }
  };

  const handleCreateDetail = () => {
    const name = window.prompt('Name der Detailebene:', `${entity.name} – intern`);
    if (name?.trim()) void createDetailView(entity.id, name.trim());
  };

  return (
    <div className="flex h-full flex-col">
      <header className="flex items-center gap-3 border-b border-slate-800 px-4 py-3">
        <span
          className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg"
          style={{ backgroundColor: `${effectiveColor}22`, color: effectiveColor }}
        >
          <EntityIcon icon={draft.icon ?? category.icon} size={18} />
        </span>
        <div className="min-w-0">
          <h2 className="truncate text-sm font-semibold text-slate-100">{entity.name}</h2>
          <p className="truncate font-mono text-[11px] text-slate-500">{entity.id}</p>
        </div>
      </header>

      <div className="flex-1 space-y-4 overflow-y-auto px-4 py-4">
        <Field label="Name">
          <TextInput value={draft.name} onChange={(v) => set('name', v)} />
        </Field>

        <div className="grid grid-cols-2 gap-3">
          <Field label="Kategorie">
            <select
              value={draft.category}
              onChange={(e) => {
                if (e.target.value === '__custom__') {
                  const input = window.prompt(
                    'ID der eigenen Kategorie (z. B. "k8s-cluster"):',
                    ''
                  );
                  const slug = input
                    ?.trim()
                    .toLowerCase()
                    .replace(/\s+/g, '-')
                    .replace(/[^a-z0-9_.:-]/g, '')
                    .slice(0, 50);
                  if (slug) set('category', slug);
                  return;
                }
                set('category', e.target.value);
              }}
              className="w-full rounded-md border border-slate-700 bg-slate-900 px-2 py-1.5 text-xs text-slate-200 focus:border-sky-500 focus:outline-none"
            >
              {/* Die Kategorie des Nodes kann aus einem abgewählten Pack stammen
                  oder frei erfunden sein — beides bleibt wählbar, damit ein
                  Speichern sie nicht stillschweigend ersetzt. */}
              {!catalog?.categories.some((c) => c.id === draft.category) && (
                <option value={draft.category}>
                  {isInactiveCategory(catalog, draft.category)
                    ? `${category.label} (Baustein nicht aktiv)`
                    : `${draft.category} (eigene)`}
                </option>
              )}
              {groupedCategories(catalog).map(([groupName, categories]) => (
                <optgroup key={groupName} label={groupName}>
                  {categories.map((c) => (
                    <option key={c.id} value={c.id}>
                      {c.label}
                    </option>
                  ))}
                </optgroup>
              ))}
              <option value="__custom__">Eigene Kategorie …</option>
            </select>
          </Field>
          <Field label="Status">
            <select
              value={draft.status}
              onChange={(e) => set('status', e.target.value)}
              className="w-full rounded-md border border-slate-700 bg-slate-900 px-2 py-1.5 text-xs text-slate-200 focus:border-sky-500 focus:outline-none"
            >
              {(catalog?.statuses ?? []).map((s) => (
                <option key={s.id} value={s.id}>
                  {s.label}
                </option>
              ))}
            </select>
          </Field>
        </div>

        <Field label="Icon">
          <button
            type="button"
            onClick={() => setPickingIcon(true)}
            className="flex w-full items-center gap-2 rounded-md border border-slate-700 bg-slate-900 px-2 py-1.5 text-left text-xs text-slate-300 transition-colors hover:border-sky-500 hover:text-sky-200"
          >
            <span
              className="flex h-6 w-6 shrink-0 items-center justify-center rounded"
              style={{ backgroundColor: `${effectiveColor}1e`, color: effectiveColor }}
            >
              <EntityIcon icon={draft.icon ?? category.icon} size={14} />
            </span>
            <span className="flex-1 truncate">
              {draft.icon ? 'Eigenes Icon' : `Standard (${category.label})`}
            </span>
            <ImagePlus size={13} className="shrink-0 text-slate-500" />
          </button>
        </Field>

        {/* Erst eine eigene Farbe macht Zonen unterscheidbar: über die
            Kategorie hätten alle Zonen dieselbe. */}
        <Field label="Farbe">
          <ColorPicker
            value={draft.color}
            onChange={(color) => set('color', color)}
            defaultLabel={`Standard (${category.label})`}
          />
        </Field>

        <Field label="Zone / Gruppe">
          <select
            value={draft.parentId}
            onChange={(e) => set('parentId', e.target.value)}
            className="w-full rounded-md border border-slate-700 bg-slate-900 px-2 py-1.5 text-xs text-slate-200 focus:border-sky-500 focus:outline-none"
          >
            <option value="">— keine —</option>
            {zoneOptions.map((z) => (
              <option key={z.id} value={z.id}>
                {z.data.entity.name}
              </option>
            ))}
          </select>
        </Field>

        {/* Typisierte Felder — Struktur kommt komplett aus dem Katalog des
            PROJEKTS (/api/projects/:id/catalog -> fields), hängt also an dessen
            Domain-Packs. Hier steht bewusst kein Feldname: ein neues Feld = ein
            Eintrag in backend/src/catalog/. */}
        <div className="space-y-2">
          {fieldGroups.map(([groupName, defs]) => (
            <FieldGroup
              key={`${entity.id}:${groupName}`}
              name={groupName}
              defs={defs}
              values={draft.fields}
              onChange={(key, value) =>
                setDraft((d) => ({ ...d, fields: { ...d.fields, [key]: value } }))
              }
              hint={
                groupName === ORPHAN_GROUP
                  ? 'Werte aus Bausteinen, die dieses Projekt nicht aktiviert hat. Sie bleiben erhalten.'
                  : undefined
              }
            />
          ))}
        </div>

        <Field label="Detailebene (Drill-down)">
          {linkedView ? (
            <div className="space-y-2 rounded-md border border-indigo-500/40 bg-indigo-500/5 px-3 py-2">
              <p className="flex items-center gap-1.5 text-[11px] text-slate-400">
                <Layers size={12} className="text-indigo-300" />
                Verknüpft mit{' '}
                <span className="font-medium text-indigo-300">{linkedView.name}</span>. Doppelklick
                auf den Node öffnet sie.
              </p>
              <div className="flex gap-2">
                <button
                  type="button"
                  onClick={() => void setActiveView(linkedView.id)}
                  className="flex items-center gap-1 rounded-md bg-indigo-600 px-2.5 py-1 text-[11px] font-medium text-white transition-colors hover:bg-indigo-500"
                >
                  <Layers size={12} /> Ebene öffnen
                </button>
                <button
                  type="button"
                  onClick={() => void saveNode(entity.id, { linkedViewId: null })}
                  className="flex items-center gap-1 rounded-md border border-slate-700 px-2.5 py-1 text-[11px] font-medium text-slate-400 transition-colors hover:border-slate-500 hover:text-slate-200"
                >
                  <X size={12} /> Verknüpfung entfernen
                </button>
              </div>
            </div>
          ) : (
            <div className="space-y-2">
              <button
                type="button"
                onClick={handleCreateDetail}
                className="flex w-full items-center justify-center gap-1.5 rounded-md border border-indigo-500/50 bg-indigo-500/10 px-3 py-1.5 text-[11px] font-medium text-indigo-300 transition-colors hover:bg-indigo-500/20"
              >
                <Plus size={13} /> Detailebene erstellen
              </button>
              {views.some((v) => v.id !== entity.viewId) && (
                <select
                  value=""
                  onChange={(e) => {
                    if (e.target.value) void saveNode(entity.id, { linkedViewId: e.target.value });
                  }}
                  className="w-full rounded-md border border-slate-700 bg-slate-900 px-2 py-1.5 text-xs text-slate-300 focus:border-sky-500 focus:outline-none"
                >
                  <option value="">… oder bestehende Ebene verknüpfen</option>
                  {views
                    .filter((v) => v.id !== entity.viewId)
                    .map((v) => (
                      <option key={v.id} value={v.id}>
                        {v.name}
                      </option>
                    ))}
                </select>
              )}
            </div>
          )}
        </Field>

        <Field label="Notizen (Markdown)">
          <MarkdownEditor value={draft.notes} onChange={(v) => set('notes', v)} />
        </Field>

        <Field label="Custom Fields">
          <CustomFieldsEditor
            rows={draft.customRows}
            onChange={(rows) => set('customRows', rows)}
          />
        </Field>

        <p className="text-[10px] text-slate-600">
          Erstellt: {new Date(entity.createdAt).toLocaleString('de-DE')} · Geändert:{' '}
          {new Date(entity.updatedAt).toLocaleString('de-DE')}
        </p>
      </div>

      {pickingIcon && (
        <IconPicker
          value={draft.icon}
          fallbackIcon={category.icon}
          onChange={(icon) => set('icon', icon)}
          onClose={() => setPickingIcon(false)}
        />
      )}

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
          onClick={() => void duplicateNode(entity.id)}
          title="Node duplizieren (Strg+D)"
          className="flex items-center gap-1.5 rounded-md border border-slate-700 px-3 py-2 text-xs font-medium text-slate-300 transition-colors hover:border-sky-500 hover:text-sky-300"
        >
          <Copy size={14} />
        </button>
        <button
          type="button"
          onClick={handleDelete}
          title="Node löschen"
          className="flex items-center gap-1.5 rounded-md border border-red-900/60 px-3 py-2 text-xs font-medium text-red-400 transition-colors hover:bg-red-500/10"
        >
          <Trash2 size={14} /> Löschen
        </button>
      </footer>
    </div>
  );
}
