/**
 * Template-Registry: Startinhalt für neue Projekte.
 *
 * Ein Template beschreibt, womit ein Projekt beginnt — welche Domain-Packs
 * aktiv sind und welche Ebenen/Nodes/Kanten angelegt werden. Damit ist der
 * Einstieg nicht mehr „leere Canvas oder Homelab", sondern die Domäne, in der
 * jemand tatsächlich arbeitet.
 *
 * Ein neues Template = eine Datei hier + ein Eintrag in TEMPLATES. Die Packs
 * eines Templates müssen in backend/src/catalog/index.js existieren; ein Test
 * prüft das, damit ein Template nicht Kategorien setzt, die das Projekt
 * anschliessend gar nicht sieht.
 *
 * Beeinflusst: backend/src/routes/projects.js (POST /projects mit `template`),
 * backend/src/routes/meta.js (GET /meta/templates), backend/src/seed.js
 * (Registrierung), backend/src/limits.js (Startprüfung der Instanz-Limits),
 * frontend/src/components/projects/NewProjectDialog.tsx.
 *
 * WICHTIG — dieses Modul ist bewusst ABHÄNGIGKEITSFREI: es importiert nur die
 * Template-Dateien nebenan, weder store.js noch ein npm-Paket. Das Aufbauen
 * eines Templates (das store.js braucht) steht getrennt in ./apply.js.
 *
 * Grund: frontend/src/lib/catalog.test.ts liest diese Registry über die
 * Paketgrenze, um Icon-Namen gegen das Icon-Mapping der UI abzugleichen. Im
 * CI läuft der Frontend-Job ohne backend/node_modules — ein Import von `zod`
 * & Co. in dieser Kette lässt den Job scheitern. Ein Test in derselben Datei
 * hält die Kette dependency-frei.
 */
import { homelab } from './homelab.js';
import { cloud } from './cloud.js';
import { kubernetes } from './kubernetes.js';
import { software } from './software.js';
import { business } from './business.js';
import { network } from './network.js';

/** Leeres Projekt: nur die Root-Ebene, die jedes Projekt ohnehin bekommt. */
const empty = {
  id: 'empty',
  label: 'Leeres Projekt',
  description: 'Nur eine leere Übersichtsebene — alles selbst aufbauen.',
  icon: 'square-dashed',
  color: '#64748b',
  packs: ['infrastructure', 'network', 'operations'],
  footprint: { views: 1, nodes: 0 },
  build: () => {},
};

/** Reihenfolge = Reihenfolge im Auswahl-Dialog. */
export const TEMPLATES = [empty, homelab, network, cloud, kubernetes, software, business];

const BY_ID = new Map(TEMPLATES.map((t) => [t.id, t]));

export const DEFAULT_TEMPLATE_ID = 'empty';
/** Template, das jedes neu registrierte Konto als Beispiel bekommt. */
export const REGISTRATION_TEMPLATE_ID = 'homelab';

export function getTemplate(id) {
  return BY_ID.get(id) ?? null;
}

/** Templates als Auswahlliste für die UI (ohne die Baufunktion). */
export function listTemplates() {
  return TEMPLATES.map(({ id, label, description, icon, color, packs, footprint }) => ({
    id,
    label,
    description,
    icon,
    color,
    packs,
    footprint,
  }));
}

/**
 * Grösster Fussabdruck über alle Templates. Eine Instanz mit engeren Limits
 * kann nicht jedes Template anlegen — `assertTemplateFitsLimits` fängt das pro
 * Anlegevorgang ab, diese Funktion dient der Diagnose.
 */
export function maxTemplateFootprint() {
  return {
    projects: 1,
    viewsPerProject: Math.max(...TEMPLATES.map((t) => t.footprint.views)),
    nodesPerProject: Math.max(...TEMPLATES.map((t) => t.footprint.nodes)),
  };
}
