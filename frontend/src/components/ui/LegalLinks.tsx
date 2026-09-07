import { lazy, Suspense, useEffect, useState } from 'react';
import { api } from '../../api/client';
import type { LegalDocument } from '../../api/types';
import { Modal } from './Modal';

// Dieselbe lazy geladene Vorschau wie im Notiz-Editor.
const MarkdownPreview = lazy(() => import('../panel/MarkdownPreview'));

/**
 * Impressum- und Datenschutz-Links dieser Instanz.
 *
 * Die Texte kommen aus `GET /api/meta/legal` und werden pro Instanz unter
 * `$DATA_DIR/legal/` hinterlegt (siehe backend/src/legal.js). Hinterlegt eine
 * Instanz nichts — der Normalfall beim Self-Hosting im eigenen Netz —, rendert
 * die Komponente gar nichts.
 *
 * Der Abruf läuft ohne Anmeldung, damit die Links auch auf dem Login-Screen
 * stehen können: Ein Impressum muss ohne Konto erreichbar sein.
 */
export function LegalLinks({ className = '' }: { className?: string }) {
  const [documents, setDocuments] = useState<LegalDocument[]>([]);
  const [open, setOpen] = useState<LegalDocument | null>(null);

  useEffect(() => {
    let active = true;
    api
      .legal()
      .then((res) => active && setDocuments(res.documents))
      .catch(() => {
        /* Ohne Rechtstexte bleibt die Zeile einfach leer. */
      });
    return () => {
      active = false;
    };
  }, []);

  if (documents.length === 0) return null;

  return (
    <>
      <div className={`flex items-center justify-center gap-3 text-[11px] text-slate-600 ${className}`}>
        {documents.map((doc) => (
          <button
            key={doc.id}
            type="button"
            onClick={() => setOpen(doc)}
            className="transition-colors hover:text-slate-400 hover:underline"
          >
            {doc.title}
          </button>
        ))}
      </div>

      {open && (
        <Modal title={open.title} onClose={() => setOpen(null)} maxWidth="max-w-3xl">
          <div className="prose prose-invert prose-sm max-h-[70vh] max-w-none overflow-y-auto pr-2 prose-headings:mt-4 prose-headings:mb-1.5 prose-p:my-2">
            <Suspense fallback={<p className="italic text-slate-500">Loading …</p>}>
              <MarkdownPreview value={open.markdown} />
            </Suspense>
          </div>
        </Modal>
      )}
    </>
  );
}
