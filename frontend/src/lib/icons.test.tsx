import { describe, expect, test } from 'vitest';
import { renderToStaticMarkup } from 'react-dom/server';
import { assetIconRef, assetIdOf, assetUrl, EntityIcon, isAssetIcon } from './icons';

/**
 * Kernpunkt dieser Datei: ein hochgeladenes Bild darf NUR über <img> in die
 * Seite kommen. Hochgeladene SVGs dürfen <script> und onload enthalten; in
 * einem <img> führt der Browser davon nichts aus, inline im DOM schon.
 * Wer EntityIcon umbaut, muss diesen Test bestehen lassen.
 */
describe('Darstellung von Icons', () => {
  test('erkennt und zerlegt Asset-Referenzen', () => {
    expect(isAssetIcon('asset:abc')).toBe(true);
    expect(isAssetIcon('server')).toBe(false);
    expect(isAssetIcon(null)).toBe(false);
    expect(assetIdOf('asset:abc')).toBe('abc');
    expect(assetIconRef('abc')).toBe('asset:abc');
  });

  test('Asset-URL bleibt same-origin und maskiert die ID', () => {
    // Same-origin ist Pflicht: die CSP in frontend/nginx.conf erlaubt
    // img-src nur 'self' und data:.
    expect(assetUrl('abc')).toBe('/api/assets/abc');
    expect(assetUrl('a/b?c')).toBe('/api/assets/a%2Fb%3Fc');
  });

  test('ein hochgeladenes Bild wird als <img> gerendert, nie inline', () => {
    const html = renderToStaticMarkup(<EntityIcon icon="asset:abc" size={16} />);
    expect(html).toContain('<img');
    expect(html).toContain('src="/api/assets/abc"');
    // Kein inline eingebettetes SVG — das wäre der XSS-Weg.
    expect(html).not.toContain('<svg');
  });

  test('ein Katalog-Symbol wird als SVG gerendert', () => {
    const html = renderToStaticMarkup(<EntityIcon icon="server" size={16} />);
    expect(html).toContain('<svg');
    expect(html).not.toContain('<img');
  });

  test('ein unbekannter Symbolname fällt auf das Standard-Symbol zurück', () => {
    // Eigene Kategorien dürfen beliebige Icon-Namen tragen; die UI darf daran
    // nicht scheitern.
    const html = renderToStaticMarkup(<EntityIcon icon="gibt-es-nicht" size={16} />);
    expect(html).toContain('<svg');
  });
});
