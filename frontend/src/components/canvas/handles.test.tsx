import { describe, expect, test, beforeEach } from 'vitest';
import { act } from 'react';
import { createRoot } from 'react-dom/client';
import { ReactFlowProvider } from '@xyflow/react';
import { ConnectionHandles } from './handles';
import { useGraphStore } from '../../store/graph';

/**
 * Kernpunkt dieser Datei: die Handles duerfen in der Leseansicht eines
 * Freigabelinks NICHT verschwinden.
 *
 * React Flow loest die Endpunkte einer Kante ueber die `handleBounds` der
 * Endknoten auf. Ein frueheres `if (readOnly) return null` hat deshalb saemtliche
 * Verbindungen aus der Leseansicht entfernt: die Nodes standen da, die Linien
 * dazwischen fehlten ersatzlos — ohne Fehlermeldung. Unsichtbar und nicht
 * bedienbar ja, weg nein.
 *
 * Bewusst im DOM gerendert statt per renderToStaticMarkup: Zustand liefert dem
 * Server-Renderer den INITIALZUSTAND (getInitialState), ein `readOnly` aus dem
 * Test kaeme dort also gar nicht an.
 */
declare global {
  /** Schaltet Reacts act()-Umgebung frei (sonst warnt jeder Render). */
  // eslint-disable-next-line no-var
  var IS_REACT_ACT_ENVIRONMENT: boolean;
}
globalThis.IS_REACT_ACT_ENVIRONMENT = true;

/** Rendert die Handles und liefert deren Klassenlisten. */
function renderHandles(visible: boolean): DOMTokenList[] {
  const container = document.createElement('div');
  document.body.appendChild(container);
  const root = createRoot(container);
  act(() => {
    root.render(
      <ReactFlowProvider>
        <ConnectionHandles visible={visible} />
      </ReactFlowProvider>
    );
  });
  const classes = [...container.querySelectorAll('[data-handleid]')].map((el) => el.classList);
  act(() => root.unmount());
  container.remove();
  return classes;
}

beforeEach(() => {
  useGraphStore.setState({ readOnly: false });
});

describe('Verbindungs-Handles', () => {
  test('im Editor sind alle vier Seiten bedienbar', () => {
    const handles = renderHandles(false);
    expect(handles).toHaveLength(4);
    expect(handles.every((c) => c.contains('connectable'))).toBe(true);
  });

  test('in der Leseansicht bleiben sie erhalten — sonst faellt jede Kante weg', () => {
    useGraphStore.setState({ readOnly: true });
    expect(renderHandles(false)).toHaveLength(4);
  });

  test('in der Leseansicht sind sie unsichtbar und nicht bedienbar', () => {
    useGraphStore.setState({ readOnly: true });
    // `visible` (Selektion) darf sie im Lesemodus nicht wieder einblenden.
    const handles = renderHandles(true);
    expect(handles).toHaveLength(4);
    expect(handles.every((c) => c.contains('!opacity-0'))).toBe(true);
    expect(handles.every((c) => c.contains('!pointer-events-none'))).toBe(true);
    expect(handles.some((c) => c.contains('connectable'))).toBe(false);
  });
});
