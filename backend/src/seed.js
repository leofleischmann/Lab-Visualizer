/**
 * Beispiel-Projekt für einen NEU registrierten Nutzer.
 *
 * Der Inhalt liegt nicht mehr hier, sondern als Template unter
 * backend/src/templates/ — dieselbe Vorlage, die auch im Auswahl-Dialog für
 * neue Projekte steht. Dieses Modul legt nur fest, WELCHES Template ein frisch
 * registriertes Konto bekommt.
 *
 * Wird bei der Registrierung genau einmal pro Nutzer aufgerufen; das Projekt
 * gehört diesem Nutzer (Besitz wird über project.user_id vererbt).
 *
 * Beeinflusst: backend/src/routes/auth.js (Registrierung),
 * backend/src/limits.js (Startprüfung: die Instanz-Limits müssen das
 * Beispielprojekt zulassen, sonst kann sich niemand registrieren).
 */
import * as store from './store.js';
import { applyTemplate, getTemplate, REGISTRATION_TEMPLATE_ID } from './templates/index.js';

const registrationTemplate = getTemplate(REGISTRATION_TEMPLATE_ID);

/**
 * Ressourcen, die das Beispielprojekt belegt. Eine Instanz, deren Limits
 * darunter liegen, könnte niemanden mehr registrieren — `createApp` prüft das
 * beim Start (siehe limits.js). Wird direkt aus dem Template abgeleitet und
 * kann daher nicht davon abdriften.
 */
export const SEED_FOOTPRINT = {
  projects: 1,
  viewsPerProject: registrationTemplate.footprint.views,
  nodesPerProject: registrationTemplate.footprint.nodes,
};

export function seedExampleForUser(db, userId) {
  const project = store.createProject(db, userId, {
    name: `${registrationTemplate.label} (Beispiel)`,
    color: registrationTemplate.color,
    icon: registrationTemplate.icon,
    packs: registrationTemplate.packs,
  });
  applyTemplate(db, userId, project, REGISTRATION_TEMPLATE_ID);
  return project;
}
