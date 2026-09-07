import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { ReactFlowProvider } from '@xyflow/react';
import App from './App';
import { SharedApp } from './components/share/SharedApp';
import './index.css';

/**
 * Einstiegspunkt. Zwei Betriebsarten, unterschieden allein am Pfad:
 *
 *   /s/<token>  Leseansicht eines Freigabelinks (ohne Konto)
 *   alles ubrige  die normale App
 *
 * Bewusst ohne Router-Bibliothek: es gibt genau diese eine Weiche, und die App
 * kommt sonst ohne Routen aus. nginx liefert fuer unbekannte Pfade index.html
 * aus (`try_files`), der Aufruf landet also hier.
 */
function resolveShareToken(): string | null {
  const match = /^\/s\/([A-Za-z0-9_-]+)\/?$/.exec(window.location.pathname);
  return match ? match[1] : null;
}

const shareToken = resolveShareToken();

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <ReactFlowProvider>
      {shareToken ? <SharedApp token={shareToken} /> : <App />}
    </ReactFlowProvider>
  </StrictMode>
);
