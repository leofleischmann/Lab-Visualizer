/**
 * Instanz-Limits (Missbrauchsschutz für öffentlich betriebene Instanzen).
 *
 * Lab Visualizer ist vollständig kostenlos — es gibt keine Pläne, keine Paywall
 * und keine kostenpflichtigen Funktionen. Beim Self-Hosting sind daher
 * standardmäßig ALLE Limits aus (`null` = unbegrenzt).
 *
 * Wer die App öffentlich anbietet, kann pro Instanz Obergrenzen setzen, damit ein
 * einzelnes Konto nicht den Speicher des Servers füllt:
 *
 *   MAX_PROJECTS_PER_USER=5
 *   MAX_VIEWS_PER_PROJECT=20
 *   MAX_NODES_PER_PROJECT=500
 *
 * Die Grenzen werden serverseitig durchgesetzt (HTTP 403 + code "limit_reached"),
 * damit sie nicht per API umgangen werden können. Die UI zeigt daraufhin einen
 * Hinweis mit dem Verweis aufs Self-Hosting.
 */
import { ApiError } from './validation.js';

/**
 * Liest eine Obergrenze aus der Umgebung. Nicht gesetzt, leer, "0" oder
 * "unlimited" bedeuten „unbegrenzt“ und liefern `null`.
 */
function envLimit(name) {
  const raw = process.env[name];
  if (raw === undefined || raw.trim() === '' || raw.trim() === 'unlimited') return null;
  const value = Number(raw);
  if (!Number.isInteger(value) || value < 0) {
    throw new Error(`${name} muss eine nicht-negative ganze Zahl oder "unlimited" sein (ist: "${raw}")`);
  }
  return value === 0 ? null : value;
}

/**
 * Aktuelle Limits der Instanz. Wird bei jedem Aufruf frisch aus der Umgebung
 * gelesen, damit eine Änderung nur einen Container-Neustart braucht.
 * @returns {{maxProjectsPerUser: number|null, maxViewsPerProject: number|null, maxNodesPerProject: number|null}}
 */
export function getInstanceLimits() {
  return {
    maxProjectsPerUser: envLimit('MAX_PROJECTS_PER_USER'),
    maxViewsPerProject: envLimit('MAX_VIEWS_PER_PROJECT'),
    maxNodesPerProject: envLimit('MAX_NODES_PER_PROJECT'),
    maxAssetsPerUser: envLimit('MAX_ASSETS_PER_USER'),
  };
}

/**
 * Groesste erlaubte Bilddatei. Anders als die Limits oben ist das KEINE
 * Plan-Grenze, sondern ein technischer Riegel: der Upload liegt beim Verarbeiten
 * komplett im Speicher, und der Body-Parser (MAX_BODY, Standard 2 MB) muss den
 * base64-Aufschlag von einem Drittel noch tragen. Daher auch beim Self-Hosting
 * ein Standardwert.
 */
export function getMaxAssetBytes() {
  const raw = process.env.MAX_ASSET_BYTES;
  if (raw === undefined || raw.trim() === '') return 1024 * 1024;
  const value = Number(raw);
  if (!Number.isInteger(value) || value <= 0) {
    throw new Error(`MAX_ASSET_BYTES muss eine positive ganze Zahl sein (ist: "${raw}")`);
  }
  return value;
}

/**
 * Prüft beim Start, ob die konfigurierten Limits überhaupt eine Registrierung
 * zulassen — jedes neue Konto bekommt ein Beispielprojekt. Zu enge Werte würden
 * sonst erst beim ersten Registrierungsversuch als 403 auffallen.
 * @throws {Error} bei einer Konfiguration, unter der niemand registrieren kann
 */
export function assertLimitsAllowRegistration(footprint) {
  const { maxProjectsPerUser, maxViewsPerProject, maxNodesPerProject } = getInstanceLimits();
  const checks = [
    ['MAX_PROJECTS_PER_USER', maxProjectsPerUser, footprint.projects, 'Projekte'],
    ['MAX_VIEWS_PER_PROJECT', maxViewsPerProject, footprint.viewsPerProject, 'Ebenen'],
    ['MAX_NODES_PER_PROJECT', maxNodesPerProject, footprint.nodesPerProject, 'Nodes'],
  ];
  for (const [name, limit, needed, what] of checks) {
    if (limit !== null && limit < needed) {
      throw new Error(
        `${name}=${limit} ist zu klein: Das Beispielprojekt jedes neuen Kontos belegt ` +
          `${needed} ${what}. Setze mindestens ${needed} — oder "unlimited" für kein Limit.`
      );
    }
  }
}

/** Fehler mit maschinenlesbarem Code, damit die UI den Limit-Hinweis zeigen kann. */
function limitError(message) {
  const err = new ApiError(403, message);
  err.code = 'limit_reached';
  return err;
}

const plural = (n, one, many) => `${n} ${n === 1 ? one : many}`;

/** Wirft 403, wenn der Nutzer kein weiteres Projekt anlegen darf. */
export function assertCanCreateProject(db, userId, additional = 1) {
  const { maxProjectsPerUser } = getInstanceLimits();
  if (maxProjectsPerUser === null) return;
  const current = db
    .prepare('SELECT count(*) AS c FROM projects WHERE user_id = ?')
    .get(userId).c;
  if (current + additional > maxProjectsPerUser) {
    throw limitError(
      `Diese Instanz erlaubt maximal ${plural(maxProjectsPerUser, 'Projekt', 'Projekte')} pro Konto.`
    );
  }
}

/** Wirft 403, wenn der Nutzer kein weiteres Bild hochladen darf. */
export function assertCanCreateAsset(db, userId) {
  const { maxAssetsPerUser } = getInstanceLimits();
  if (maxAssetsPerUser === null) return;
  const current = db.prepare('SELECT count(*) AS c FROM assets WHERE user_id = ?').get(userId).c;
  if (current + 1 > maxAssetsPerUser) {
    throw limitError(
      `Diese Instanz erlaubt maximal ${plural(maxAssetsPerUser, 'Bild', 'Bilder')} pro Konto.`
    );
  }
}

/** Wirft 403, wenn das Projekt keine weitere Ebene aufnehmen darf. */
export function assertCanCreateView(db, projectId, additional = 1) {
  const { maxViewsPerProject } = getInstanceLimits();
  if (maxViewsPerProject === null) return;
  const current = db
    .prepare('SELECT count(*) AS c FROM views WHERE project_id = ?')
    .get(projectId).c;
  if (current + additional > maxViewsPerProject) {
    throw limitError(
      `Diese Instanz erlaubt maximal ${plural(maxViewsPerProject, 'Ebene', 'Ebenen')} pro Projekt.`
    );
  }
}

/**
 * Wirft 403, wenn das Projekt der Ebene keine weiteren Nodes aufnehmen darf.
 * Nodes hängen über ihre Ebene am Projekt.
 */
export function assertCanCreateNode(db, viewId, additional = 1) {
  const { maxNodesPerProject } = getInstanceLimits();
  if (maxNodesPerProject === null) return;
  const projectId = db.prepare('SELECT project_id FROM views WHERE id = ?').get(viewId)?.project_id;
  if (!projectId) return; // Ebene ohne Projekt → nichts zu begrenzen
  const current = db
    .prepare('SELECT count(*) AS c FROM nodes n JOIN views v ON v.id = n.view_id WHERE v.project_id = ?')
    .get(projectId).c;
  if (current + additional > maxNodesPerProject) {
    throw limitError(
      `Diese Instanz erlaubt maximal ${plural(maxNodesPerProject, 'Node', 'Nodes')} pro Projekt.`
    );
  }
}

/**
 * Prüft VOR dem Anlegen, ob ein Template unter den Instanz-Limits überhaupt
 * Platz hat. Ohne diese Vorprüfung würde der Aufbau mitten im Template auf ein
 * Limit laufen; die Transaktion in routes/projects.js macht das zwar rückgängig,
 * aber die Fehlermeldung wäre für den Nutzer nicht nachvollziehbar.
 */
export function assertTemplateFitsLimits(template) {
  const { maxViewsPerProject, maxNodesPerProject } = getInstanceLimits();
  const checks = [
    [maxViewsPerProject, template.footprint.views, 'Ebene', 'Ebenen'],
    [maxNodesPerProject, template.footprint.nodes, 'Node', 'Nodes'],
  ];
  for (const [limit, needed, one, many] of checks) {
    if (limit !== null && limit < needed) {
      throw limitError(
        `Die Vorlage „${template.label}" braucht ${plural(needed, one, many)} — diese Instanz ` +
          `erlaubt maximal ${plural(limit, one, many)} pro Projekt.`
      );
    }
  }
}

/**
 * Prüft einen kompletten Import gegen die Instanz-Limits (Projekte, Ebenen und
 * Nodes pro Projekt), bevor Daten geschrieben werden.
 */
export function assertImportWithinLimits(db, userId, { projects = [], views = [], nodes = [] }) {
  const { maxProjectsPerUser, maxViewsPerProject, maxNodesPerProject } = getInstanceLimits();

  if (maxProjectsPerUser !== null && projects.length > maxProjectsPerUser) {
    throw limitError(
      `Der Import enthält ${projects.length} Projekte — diese Instanz erlaubt maximal ` +
        `${plural(maxProjectsPerUser, 'Projekt', 'Projekte')} pro Konto.`
    );
  }

  if (maxViewsPerProject !== null) {
    // Ebenen ohne (gültige) Projekt-Zuordnung landen im Default-Projekt.
    const perProject = new Map();
    for (const v of views) {
      const key = v.projectId ?? '__default__';
      perProject.set(key, (perProject.get(key) ?? 0) + 1);
    }
    for (const [, count] of perProject) {
      if (count > maxViewsPerProject) {
        throw limitError(
          `Der Import enthält ein Projekt mit ${count} Ebenen — diese Instanz erlaubt maximal ` +
            `${plural(maxViewsPerProject, 'Ebene', 'Ebenen')} pro Projekt.`
        );
      }
    }
  }

  if (maxNodesPerProject !== null && nodes.length) {
    // Node → Ebene → Projekt auflösen; unbekannte Ebenen zählen zum Default-Projekt.
    const viewProject = new Map(views.map((v) => [v.id, v.projectId ?? '__default__']));
    const perProject = new Map();
    for (const n of nodes) {
      const key = viewProject.get(n.viewId) ?? '__default__';
      perProject.set(key, (perProject.get(key) ?? 0) + 1);
    }
    for (const [, count] of perProject) {
      if (count > maxNodesPerProject) {
        throw limitError(
          `Der Import enthält ein Projekt mit ${count} Nodes — diese Instanz erlaubt maximal ` +
            `${plural(maxNodesPerProject, 'Node', 'Nodes')} pro Projekt.`
        );
      }
    }
  }
}
