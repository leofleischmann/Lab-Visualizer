import { iconOf } from './catalog';

/**
 * Darstellung eines Icons: entweder ein Symbol aus dem Icon-Mapping oder ein
 * hochgeladenes Bild (`asset:<id>`).
 *
 * SICHERHEIT: Ein Asset wird IMMER über <img src> eingebunden, niemals inline
 * ins DOM. Hochgeladene SVGs dürfen <script> und onload enthalten; in einem
 * <img> führt der Browser davon nichts aus. Wer hier auf inlines SVG umstellt
 * (etwa um die Farbe zu setzen), öffnet ein XSS-Loch.
 *
 * Beeinflusst: backend/src/assets.js (liefert passende Header für den direkten
 * Aufruf der URL), backend/src/routes/assets.js.
 */
const ASSET_PREFIX = 'asset:';

export const isAssetIcon = (icon: string | null | undefined): boolean =>
  !!icon?.startsWith(ASSET_PREFIX);

export const assetIdOf = (icon: string): string => icon.slice(ASSET_PREFIX.length);

export const assetIconRef = (id: string): string => `${ASSET_PREFIX}${id}`;

/** URL, unter der ein Bild ausgeliefert wird. Immer same-origin (siehe CSP). */
export const assetUrl = (id: string): string => `/api/assets/${encodeURIComponent(id)}`;

export function EntityIcon({
  icon,
  size,
  title,
}: {
  icon: string;
  size: number;
  title?: string;
}) {
  if (isAssetIcon(icon)) {
    return (
      <img
        src={assetUrl(assetIdOf(icon))}
        alt=""
        title={title}
        width={size}
        height={size}
        // object-contain: fremde Bilder haben beliebige Seitenverhältnisse und
        // sollen nicht verzerrt werden.
        className="object-contain"
        style={{ width: size, height: size }}
        draggable={false}
      />
    );
  }
  const Icon = iconOf(icon);
  return <Icon size={size} strokeWidth={1.8} />;
}
