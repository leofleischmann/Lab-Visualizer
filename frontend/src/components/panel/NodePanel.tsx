import { useEffect, useMemo, useState } from 'react';
import { ExternalLink, Layers, Plus, Save, Trash2, X } from 'lucide-react';
import type { ApiNode, NodePatch } from '../../api/types';
import { categoryOf, groupedCategories, iconOf } from '../../lib/catalog';
import { absolutePosition, useGraphStore } from '../../store/graph';
import { CustomFieldsEditor, toRecord, toRows, type FieldRow } from './CustomFieldsEditor';
import { MarkdownEditor } from './MarkdownEditor';
import { Field, TextInput } from './controls';

type Draft = {
  name: string;
  category: string;
  status: string;
  parentId: string;
  ip: string;
  vlan: string;
  os: string;
  hostname: string;
  url: string;
  notes: string;
  fields: FieldRow[];
};

const toDraft = (entity: ApiNode): Draft => ({
  name: entity.name,
  category: entity.category,
  status: entity.status,
  parentId: entity.parentId ?? '',
  ip: entity.ip ?? '',
  vlan: entity.vlan ?? '',
  os: entity.os ?? '',
  hostname: entity.hostname ?? '',
  url: entity.url ?? '',
  notes: entity.notes,
  fields: toRows(entity.customFields),
});

export function NodePanel({ entity }: { entity: ApiNode }) {
  const catalog = useGraphStore((s) => s.catalog);
  const nodes = useGraphStore((s) => s.nodes);
  const views = useGraphStore((s) => s.views);
  const saveNode = useGraphStore((s) => s.saveNode);
  const removeNode = useGraphStore((s) => s.removeNode);
  const createDetailView = useGraphStore((s) => s.createDetailView);
  const setActiveView = useGraphStore((s) => s.setActiveView);

  const linkedView = views.find((v) => v.id === entity.linkedViewId) ?? null;

  const [draft, setDraft] = useState<Draft>(() => toDraft(entity));
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    setDraft(toDraft(entity));
  }, [entity.id, entity.updatedAt]);

  const category = categoryOf(catalog, draft.category);
  const Icon = iconOf(category.icon);

  const zoneOptions = useMemo(
    () =>
      nodes.filter(
        (n) => n.data.entity.category === 'group' && n.id !== entity.id
      ),
    [nodes, entity.id]
  );

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
    const patch: NodePatch = {
      name: draft.name.trim() || entity.name,
      category: draft.category,
      status: draft.status,
      ip: draft.ip.trim() || null,
      vlan: draft.vlan.trim() || null,
      os: draft.os.trim() || null,
      hostname: draft.hostname.trim() || null,
      url: draft.url.trim() || null,
      notes: draft.notes,
      customFields: toRecord(draft.fields),
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
          style={{ backgroundColor: `${category.color}22`, color: category.color }}
        >
          <Icon size={18} />
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
              {!catalog?.categories.some((c) => c.id === draft.category) && (
                <option value={draft.category}>{draft.category} (eigene)</option>
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

        <div className="grid grid-cols-2 gap-3">
          <Field label="IP-Adresse">
            <TextInput mono value={draft.ip} onChange={(v) => set('ip', v)} placeholder="192.168.2.x" />
          </Field>
          <Field label="VLAN">
            <TextInput mono value={draft.vlan} onChange={(v) => set('vlan', v)} placeholder="–" />
          </Field>
          <Field label="Betriebssystem">
            <TextInput value={draft.os} onChange={(v) => set('os', v)} placeholder="Debian 12 …" />
          </Field>
          <Field label="Hostname">
            <TextInput mono value={draft.hostname} onChange={(v) => set('hostname', v)} />
          </Field>
        </div>

        <Field label="URL">
          <div className="flex gap-1.5">
            <TextInput
              mono
              value={draft.url}
              onChange={(v) => set('url', v)}
              placeholder="https://…"
            />
            {draft.url && (
              <a
                href={draft.url}
                target="_blank"
                rel="noreferrer"
                title="URL öffnen"
                className="flex items-center rounded-md border border-slate-700 px-2 text-slate-400 transition-colors hover:border-sky-500 hover:text-sky-300"
              >
                <ExternalLink size={14} />
              </a>
            )}
          </div>
        </Field>

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
          title="Node löschen"
          className="flex items-center gap-1.5 rounded-md border border-red-900/60 px-3 py-2 text-xs font-medium text-red-400 transition-colors hover:bg-red-500/10"
        >
          <Trash2 size={14} /> Löschen
        </button>
      </footer>
    </div>
  );
}
