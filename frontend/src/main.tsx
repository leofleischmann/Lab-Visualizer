import { lazy, StrictMode, Suspense } from 'react';
import { createRoot } from 'react-dom/client';
import { ReactFlowProvider } from '@xyflow/react';
import App from './App';
import { SharedApp } from './components/share/SharedApp';

// Eigenes Chunk: wer nur die App benutzt, lädt die Doku-Seite nie.
const ApiDocs = lazy(() => import('./components/docs/ApiDocs').then((m) => ({ default: m.ApiDocs })));
import './index.css';

/**
 * Einstiegspunkt. Drei Betriebsarten, unterschieden allein am Pfad:
 *
 *   /s/<token>  Leseansicht eines Freigabelinks (ohne Konto)
 *   /docs       API- und MCP-Dokumentation (ohne Konto, components/docs/)
 *   alles ubrige  die normale App
 *
 * Bewusst ohne Router-Bibliothek: es gibt genau diese Weichen, und die App
 * kommt sonst ohne Routen aus. nginx liefert fuer unbekannte Pfade index.html
 * aus (`try_files`), der Aufruf landet also hier.
 */
function resolveShareToken(): string | null {
  const match = /^\/s\/([A-Za-z0-9_-]+)\/?$/.exec(window.location.pathname);
  return match ? match[1] : null;
}

const shareToken = resolveShareToken();
const isDocs = /^\/docs\/?$/.test(window.location.pathname);

function Root() {
  if (shareToken) return <SharedApp token={shareToken} />;
  if (isDocs) {
    return (
      <Suspense fallback={null}>
        <ApiDocs />
      </Suspense>
    );
  }
  return <App />;
}

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <ReactFlowProvider>
      <Root />
    </ReactFlowProvider>
  </StrictMode>
);
