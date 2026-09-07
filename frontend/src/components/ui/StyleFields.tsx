import { useState } from 'react';
import { Field } from '../panel/controls';
import { IconPicker } from '../panel/IconPicker';
import { EntityIcon } from '../../lib/icons';
import { ColorPicker } from './ColorPicker';

/**
 * Symbol und Farbe eines Objekts wählen.
 *
 * Projekte und Ebenen tragen `color` und `icon` schon lange in der Datenbank,
 * wurden aber nirgends angezeigt oder gesetzt — tote Felder. Diese Komponente
 * macht sie bedienbar und teilt sich die Auswahl mit dem Node-Panel.
 *
 * Genutzt von: projects/ProjectSettingsDialog.tsx, views/ViewStyleDialog.tsx.
 */
export function StyleFields({
  icon,
  color,
  fallbackIcon,
  onIconChange,
  onColorChange,
  colorDefaultLabel,
}: {
  icon: string | null;
  color: string | null;
  fallbackIcon: string;
  onIconChange: (icon: string | null) => void;
  onColorChange: (color: string | null) => void;
  colorDefaultLabel?: string;
}) {
  const [picking, setPicking] = useState(false);

  return (
    <div className="grid gap-3 sm:grid-cols-[auto_1fr]">
      <Field label="Icon">
        <button
          type="button"
          onClick={() => setPicking(true)}
          className="flex h-[34px] w-[34px] items-center justify-center rounded-md border border-slate-700 bg-slate-900 transition-colors hover:border-sky-500"
          style={{ color: color ?? undefined }}
          title="Choose icon"
        >
          <EntityIcon icon={icon ?? fallbackIcon} size={16} />
        </button>
      </Field>
      <Field label="Color">
        <div className="flex h-[34px] items-center">
          <ColorPicker value={color} onChange={onColorChange} defaultLabel={colorDefaultLabel} />
        </div>
      </Field>

      {picking && (
        <IconPicker
          value={icon}
          fallbackIcon={fallbackIcon}
          onChange={onIconChange}
          onClose={() => setPicking(false)}
          defaultLabel="Default icon"
        />
      )}
    </div>
  );
}
