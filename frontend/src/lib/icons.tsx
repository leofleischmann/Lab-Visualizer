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

/**
 * Basis-URL für Bilder. Im Normalbetrieb `/api/assets`; in der Leseansicht
 * eines Freigabelinks `/api/share/<token>/assets`, weil der Betrachter kein
 * Konto hat. Modulweit statt als Prop, damit nicht jede Icon-Darstellung den
 * Token durchreichen muss — er ist pro Seitenaufruf ohnehin konstant.
 *
 * Gesetzt von: components/share/SharedApp.tsx (beim Start der Leseansicht).
 */
let assetBase = '/api/assets';

export function setAssetBase(base: string): void {
  assetBase = base;
}

/** URL, unter der ein Bild ausgeliefert wird. Immer same-origin (siehe CSP). */
export const assetUrl = (id: string): string => `${assetBase}/${encodeURIComponent(id)}`;

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
