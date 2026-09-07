import { useEffect, useState } from 'react';
import clsx from 'clsx';
import { Check, Loader2 } from 'lucide-react';
import { api } from '../../api/client';
import type { Pack, Template } from '../../api/types';
import { iconOf } from '../../lib/catalog';
import { useGraphStore } from '../../store/graph';
import { Modal } from '../ui/Modal';

/**
 * Anlegen eines Projekts: Vorlage wählen, Name vergeben, optional die
 * Domain-Packs anpassen.
 *
 * Die Vorlage bestimmt beides — den Startinhalt UND die Packs, also welche
 * Bausteine das Projekt überhaupt sieht. Damit ist der Einstieg die Domäne,
 * in der jemand arbeitet, statt einer leeren Canvas mit Server-Palette.
 *
 * Beeinflusst: backend/src/templates/ (Vorlagen), backend/src/catalog/ (Packs).
 * Neue Vorlage oder neues Pack = nur ein Eintrag dort, dieser Dialog folgt.
 */
export function NewProjectDialog({ onClose }: { onClose: () => void }) {
  const createProject = useGraphStore((s) => s.createProject);

  const [templates, setTemplates] = useState<Template[] | null>(null);
  const [packs, setPacks] = useState<Pack[] | null>(null);
  const [templateId, setTemplateId] = useState('empty');
  const [name, setName] = useState('');
  // null = „Packs der Vorlage übernehmen"; sobald jemand etwas anklickt,
  // gilt die eigene Auswahl.
  const [customPacks, setCustomPacks] = useState<string[] | null>(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      const [t, p] = await Promise.all([api.templates(), api.packs()]);
      if (cancelled) return;
      setTemplates(t.templates);
      setPacks(p.packs);
    })().catch(() => undefined);
    return () => {
      cancelled = true;
    };
  }, []);

  const template = templates?.find((t) => t.id === templateId) ?? null;
  const activePacks = customPacks ?? template?.packs ?? [];

  const chooseTemplate = (t: Template) => {
    setTemplateId(t.id);
    // Vorschlagsname folgt der Vorlage, solange nichts Eigenes getippt wurde.
    setCustomPacks(null);
    setName((current) => {
      const previous = templates?.find((x) => x.id === templateId);
      return current === '' || current === previous?.label ? t.label : current;
    });
  };

  const togglePack = (id: string) =>
    setCustomPacks(
      activePacks.includes(id) ? activePacks.filter((p) => p !== id) : [...activePacks, id]
    );

  const submit = async () => {
    setBusy(true);
    const created = await createProject({
      name: name.trim() || template?.label || 'New project',
      color: template?.color ?? null,
      icon: template?.icon ?? null,
      template: templateId,
      ...(customPacks ? { packs: customPacks } : {}),
    });
    setBusy(false);
    if (created) onClose();
  };

  return (
    <Modal title="New project" onClose={onClose} maxWidth="max-w-2xl">
      {!templates || !packs ? (
        <div className="flex items-center gap-2 py-8 text-xs text-slate-400">
          <Loader2 size={14} className="animate-spin" /> Loading templates …
        </div>
      ) : (
        <div className="space-y-5">
          <div>
            <span className="mb-2 block text-[11px] font-medium uppercase tracking-wide text-slate-500">
              Template
            </span>
            <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
              {templates.map((t) => {
                const Icon = iconOf(t.icon);
                const selected = t.id === templateId;
                return (
                  <button
                    key={t.id}
                    type="button"
                    onClick={() => chooseTemplate(t)}
                    className={clsx(
                      'flex flex-col gap-1.5 rounded-lg border p-2.5 text-left transition-colors',
                      selected
                        ? 'border-sky-500 bg-sky-500/10'
                        : 'border-slate-700 hover:border-slate-500'
                    )}
                  >
                    <span className="flex items-center gap-1.5">
                      <Icon size={14} style={{ color: t.color }} />
                      <span className="truncate text-xs font-semibold text-slate-100">
                        {t.label}
                      </span>
                    </span>
                    <span className="line-clamp-2 text-[10px] leading-snug text-slate-500">
                      {t.description}
                    </span>
                    {t.footprint.nodes > 0 && (
                      <span className="text-[10px] text-slate-600">
                        {t.footprint.nodes} nodes · {t.footprint.views}{' '}
                        {t.footprint.views === 1 ? 'level' : 'levels'}
                      </span>
                    )}
                  </button>
                );
              })}
            </div>
          </div>

          <div>
            <span className="mb-1 block text-[11px] font-medium uppercase tracking-wide text-slate-500">
              Name
            </span>
            <input
              value={name}
              autoFocus
              onChange={(e) => setName(e.target.value)}
              placeholder={template?.label ?? 'New project'}
              onKeyDown={(e) => {
                if (e.key === 'Enter' && !busy) void submit();
              }}
              className="w-full rounded-md border border-slate-700 bg-slate-950/70 px-2.5 py-2 text-xs text-slate-200 placeholder:text-slate-600 focus:border-sky-500 focus:outline-none"
            />
          </div>

          <PackPicker packs={packs} active={activePacks} onToggle={togglePack} />

          <div className="flex justify-end gap-2 border-t border-slate-800 pt-4">
            <button
              type="button"
              onClick={onClose}
              className="rounded-md border border-slate-700 px-3 py-1.5 text-xs text-slate-300 hover:border-slate-500"
            >
              Cancel
            </button>
            <button
              type="button"
              disabled={busy}
              onClick={() => void submit()}
              className="flex items-center gap-1.5 rounded-md bg-sky-600 px-3 py-1.5 text-xs font-semibold text-white hover:bg-sky-500 disabled:bg-slate-800 disabled:text-slate-500"
            >
              {busy && <Loader2 size={13} className="animate-spin" />}
              Create project
            </button>
          </div>
        </div>
      )}
    </Modal>
  );
}

/**
 * Auswahl der Domain-Packs. Wird sowohl beim Anlegen als auch in den
 * Projekt-Einstellungen benutzt.
 */
export function PackPicker({
  packs,
  active,
  onToggle,
}: {
  packs: Pack[];
  active: string[];
  onToggle: (id: string) => void;
}) {
  return (
    <div>
      <span className="mb-1 block text-[11px] font-medium uppercase tracking-wide text-slate-500">
        Building blocks
      </span>
      <p className="mb-2 text-[10px] leading-relaxed text-slate-600">
        Decides which categories and fields the project shows. Core blocks
        (application, database, group, user …) are always included.
      </p>
      <div className="grid grid-cols-2 gap-1.5">
        {packs.map((pack) => {
          const Icon = iconOf(pack.icon);
          const on = active.includes(pack.id);
          return (
            <button
              key={pack.id}
              type="button"
              onClick={() => onToggle(pack.id)}
              title={pack.description}
              className={clsx(
                'flex items-center gap-2 rounded-md border px-2 py-1.5 text-left transition-colors',
                on ? 'border-sky-500/60 bg-sky-500/10' : 'border-slate-800 hover:border-slate-600'
              )}
            >
              <span
                className={clsx(
                  'flex h-4 w-4 shrink-0 items-center justify-center rounded border',
                  on ? 'border-sky-400 bg-sky-500 text-white' : 'border-slate-600'
                )}
              >
                {on && <Check size={11} strokeWidth={3} />}
              </span>
              <Icon size={13} className={on ? 'text-sky-300' : 'text-slate-500'} />
              <span className="min-w-0 flex-1">
                <span
                  className={clsx(
                    'block truncate text-[11px]',
                    on ? 'text-slate-100' : 'text-slate-400'
                  )}
                >
                  {pack.label}
                </span>
                <span className="block text-[10px] text-slate-600">
                  {pack.categories} categories · {pack.fields} fields
                </span>
              </span>
            </button>
          );
        })}
      </div>
    </div>
  );
}
