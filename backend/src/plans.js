/**
 * Freemium-Pläne & Limits (zentrale Definition für Backend-Enforcement und UI).
 *
 * - free: 1 Projekt mit maximal 3 Ebenen — dauerhaft kostenlos.
 * - pro:  unbegrenzte Projekte & Ebenen — 2,99 $/€ pro Monat, Abrechnung via Stripe.
 *
 * Die Limits werden serverseitig in store.js durchgesetzt (HTTP 402 + code
 * "plan_limit"), damit sie nicht per API umgangen werden können. Das Upgrade
 * selbst (Stripe Checkout/Webhooks) ist bewusst noch NICHT implementiert —
 * siehe routes/billing.js für den vorbereiteten Integrationspunkt.
 */
import { ApiError } from './validation.js';

export const PLANS = {
  free: {
    id: 'free',
    label: 'Free',
    maxProjects: 1,
    maxViewsPerProject: 3,
  },
  pro: {
    id: 'pro',
    label: 'Pro',
    maxProjects: null, // null = unbegrenzt
    maxViewsPerProject: null,
    priceMonthly: '2,99',
  },
};

/** Plan eines Nutzers lesen (unbekannte Werte fallen sicher auf 'free' zurück). */
export function getUserPlan(db, userId) {
  const row = db.prepare('SELECT plan FROM users WHERE id = ?').get(userId);
  return PLANS[row?.plan] ? row.plan : 'free';
}

/** Limits des Nutzer-Plans (für /auth/me und Enforcement). */
export function getPlanLimits(db, userId) {
  const plan = getUserPlan(db, userId);
  const { maxProjects, maxViewsPerProject } = PLANS[plan];
  return { plan, maxProjects, maxViewsPerProject };
}

/** Fehler mit 402 + maschinenlesbarem Code, damit die UI die Paywall zeigen kann. */
export function planLimitError(message) {
  const err = new ApiError(402, message);
  err.code = 'plan_limit';
  return err;
}

/** Wirft 402, wenn der Nutzer kein weiteres Projekt anlegen darf. */
export function assertCanCreateProject(db, userId, additional = 1) {
  const { plan, maxProjects } = getPlanLimits(db, userId);
  if (maxProjects === null) return;
  const current = db
    .prepare('SELECT count(*) AS c FROM projects WHERE user_id = ?')
    .get(userId).c;
  if (current + additional > maxProjects) {
    throw planLimitError(
      `Der ${PLANS[plan].label}-Plan erlaubt maximal ${maxProjects} Projekt${maxProjects === 1 ? '' : 'e'}. ` +
        'Upgrade auf Pro für unbegrenzte Projekte.'
    );
  }
}

/** Wirft 402, wenn das Projekt keine weitere Ebene aufnehmen darf. */
export function assertCanCreateView(db, userId, projectId, additional = 1) {
  const { plan, maxViewsPerProject } = getPlanLimits(db, userId);
  if (maxViewsPerProject === null) return;
  const current = db
    .prepare('SELECT count(*) AS c FROM views WHERE project_id = ?')
    .get(projectId).c;
  if (current + additional > maxViewsPerProject) {
    throw planLimitError(
      `Der ${PLANS[plan].label}-Plan erlaubt maximal ${maxViewsPerProject} Ebenen pro Projekt. ` +
        'Upgrade auf Pro für unbegrenzte Ebenen.'
    );
  }
}

/**
 * Prüft einen kompletten Import gegen die Plan-Limits (Anzahl Projekte und
 * Ebenen pro Projekt), bevor Daten ersetzt werden.
 */
export function assertImportWithinLimits(db, userId, { projects = [], views = [] }) {
  const { plan, maxProjects, maxViewsPerProject } = getPlanLimits(db, userId);
  if (maxProjects !== null && projects.length > maxProjects) {
    throw planLimitError(
      `Import enthält ${projects.length} Projekte — der ${PLANS[plan].label}-Plan erlaubt maximal ${maxProjects}. ` +
        'Upgrade auf Pro für unbegrenzte Projekte.'
    );
  }
  if (maxViewsPerProject !== null) {
    const perProject = new Map();
    for (const v of views) {
      // Ebenen ohne (gültige) Projekt-Zuordnung landen im Default-Projekt.
      const key = v.projectId ?? '__default__';
      perProject.set(key, (perProject.get(key) ?? 0) + 1);
    }
    // Import ohne explizite Ebenen erzeugt eine Root-Ebene → zählt als 1.
    for (const [, count] of perProject) {
      if (count > maxViewsPerProject) {
        throw planLimitError(
          `Import enthält ein Projekt mit ${count} Ebenen — der ${PLANS[plan].label}-Plan erlaubt maximal ${maxViewsPerProject} Ebenen pro Projekt. ` +
            'Upgrade auf Pro für unbegrenzte Ebenen.'
        );
      }
    }
  }
}
