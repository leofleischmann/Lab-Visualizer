# Lab Visualizer – API für KI-Agenten

Diese Datei beschreibt die REST-API für automatisierte Clients (Skripte, Monitoring, KI-Agenten).
Menschenlesbare Projektinfos: [README.md](README.md).

## Zweck

Lab Visualizer dokumentiert Homelab-/Netzwerk-Infrastruktur als Graph:

- **Nodes** = Server, Container, Dienste, Zonen/Gruppen, …
- **Edges** = Verbindungen zwischen Nodes (HTTP, VPN, Monitoring, …)

Die Web-UI und diese API greifen auf dieselbe SQLite-Datenbank zu. Jede UI-Aktion ist per API reproduzierbar.

## Basis-URL

| Umgebung | Base URL |
|---|---|
| Docker (Standard) | `http://localhost:8080/api` |
| Backend direkt | `http://localhost:3000/api` |
| Produktion | `http://<host>:8080/api` (Port aus `docker-compose.yml`) |

Alle Pfade unten sind relativ zu `/api`.

## Protokoll

- **Format:** JSON (`Content-Type: application/json`)
- **Auth:** **Anmeldung erforderlich** (Session-Cookie). Alle Daten-Endpunkte setzen eine
  gültige Session voraus und sind **auf den angemeldeten Nutzer beschränkt** — siehe
  [Authentifizierung](#authentifizierung). Öffentlich ohne Login: `/api/health`,
  `/api/meta/catalog`, `/api/meta/legal`, `/api/auth/*`.
- **CORS:** standardmäßig aus (same-origin über den Proxy); optional via `CORS_ORIGIN`
- **Body-Limit:** 2 MB je Request; nur `POST /graph/import` nimmt 20 MB (beides per Env änderbar)
- **IDs:** `^[A-Za-z0-9_.:-]{1,64}$` — sprechende IDs wie `nginx` oder `db-primary` empfohlen
- **Zeitstempel:** ISO 8601 (`createdAt`, `updatedAt`)

### Authentifizierung

Die API nutzt **serverseitige Sessions** über ein `HttpOnly`-Cookie (`sid`). Ein Skript
meldet sich einmal an, speichert das Cookie und schickt es bei jedem weiteren Request mit:

```bash
# Anmelden (oder /api/auth/register für ein neues Konto) und Cookie speichern
curl -c cookies.txt -X POST http://localhost:8080/api/auth/login \
  -H 'Content-Type: application/json' \
  -d '{ "email": "du@example.com", "password": "dein-passwort" }'

# Cookie bei jedem Daten-Request mitsenden
curl -b cookies.txt http://localhost:8080/api/graph
```

Auth-Endpunkte: `POST /api/auth/register` (`{email, password}`, legt Konto an + seedet ein
Beispielprojekt), `POST /api/auth/login`, `POST /api/auth/logout`, `GET /api/auth/me`
(inkl. `limits` der Instanz), `POST /api/auth/password` (`{currentPassword, newPassword}`,
beendet alle anderen Sessions), `DELETE /api/auth/account` (`{password}`, löscht alle Daten).
Zustandsändernde Requests aus dem Browser müssen einen zum Host passenden `Origin`-Header
tragen (CSRF-Schutz); Cookie-basierte CLI-Clients wie `curl` sind davon nicht betroffen.

### Fehlerantworten

```json
{
  "error": "Kurze Fehlermeldung",
  "details": [{ "path": "feldname", "message": "…" }]
}
```

| Status | Bedeutung |
|---|---|
| `400` | Validierung / ungültige Referenz |
| `401` | Nicht angemeldet (fehlende/abgelaufene Session) |
| `403` | CSRF-Schutz (unpassender Origin) **oder** Instanz-Limit erreicht (`code: "limit_reached"`) |
| `404` | Node/Edge/Route nicht gefunden **oder gehört einem anderen Nutzer** |
| `409` | ID existiert bereits |
| `413` | Request-Body zu groß |
| `429` | Zu viele Login-/Registrierungsversuche **oder** Schreib-Rate-Limit überschritten |
| `500` | Interner Serverfehler |

### Instanz-Limits

Das Projekt ist vollständig kostenlos; es gibt keine Pläne und keine Bezahlfunktionen.
**Standardmäßig gilt kein Limit.** Öffentlich betriebene Instanzen können jedoch
Obergrenzen per Umgebungsvariable setzen (`MAX_PROJECTS_PER_USER`,
`MAX_VIEWS_PER_PROJECT`, `MAX_NODES_PER_PROJECT`).

Die geltenden Werte stehen in `GET /api/auth/me` unter `limits` — `null` bedeutet
unbegrenzt:

```json
{
  "user": { "id": "…", "email": "du@example.com" },
  "limits": { "maxProjectsPerUser": null, "maxViewsPerProject": null, "maxNodesPerProject": null }
}
```

Geprüft wird serverseitig bei `POST /projects`, `POST /views`, `POST /nodes` und
`POST /graph/import` (der Import vollständig vorab, bevor etwas geschrieben wird).
Eine erreichte Grenze liefert `403` mit `code: "limit_reached"` — ein Client sollte
darauf mit einem Hinweis reagieren, nicht mit einem Retry.

Schreibende Requests sind zusätzlich pro IP gedrosselt
(`RATE_LIMIT_WRITES_PER_MIN`, Default 600/min, `0` = aus) → `429` mit `Retry-After`.

Erfolg ohne Body: `204 No Content` (DELETE, Logout).

---

## Datenmodell

### Project (Projekt)

Projekte sind **komplett getrennte Arbeitsbereiche** (z. B. „Homelab", „Arbeit"). Jede Ebene
gehört zu genau einem Projekt; beim Arbeiten sieht man nur die Ebenen/Nodes des aktiven
Projekts. Hierarchie: **Projekt → Ebenen (Baum) → Nodes/Edges**.

```json
{ "id": "homelab", "name": "Mein Homelab", "color": "#38bdf8", "icon": "boxes", "sortOrder": 0 }
```

- Jedes Projekt gehört **genau einem Nutzer**; du siehst/änderst nur deine eigenen Projekte.
  Bei der Registrierung wird automatisch ein Beispielprojekt „Homelab (Beispiel)" angelegt.
  Ein neues Projekt startet mit einer eigenen Root-Ebene.
- Ein Projekt löschen **kaskadiert** auf alle Ebenen/Nodes/Edges; das **letzte** Projekt
  bleibt erhalten.

### View (Ebene)

Ebenen gliedern ein Projekt in eine **Drill-down-Hierarchie** (C4-artig): eine
Übersichts-Ebene zeigt grobe Bausteine, ein Node kann in eine eigene **Detail-Ebene**
verlinken. Jeder Node/jede Edge gehört zu **genau einer** Ebene.

```json
{
  "id": "server-intern",
  "projectId": "homelab",
  "name": "Server-Intern",
  "parentId": null,
  "description": "",
  "color": "#38bdf8",
  "icon": "layers",
  "sortOrder": 0,
  "createdAt": "…",
  "updatedAt": "…"
}
```

| Feld | Pflicht | Default | Beschreibung |
|---|---|---|---|
| `id` | nein (POST) | UUID | Stabile ID |
| `projectId` | nein | Default-Projekt | Projekt der Ebene (erbt bei `parentId` vom Parent) |
| `name` | ja | — | Anzeigename |
| `parentId` | nein | `null` | Eltern-Ebene (Baum); `null` = Root-Ebene |
| `description`, `color`, `icon`, `sortOrder` | nein | — | Metadaten für die UI |

- Es existiert **immer mindestens eine** Ebene (Root „Übersicht" wird automatisch angelegt).
- Neue Nodes/Edges ohne `viewId` landen in der ersten Root-Ebene.
- Eine Ebene löschen **kaskadiert** auf Unterebenen inkl. deren Nodes/Edges; die **letzte**
  Ebene kann nicht gelöscht werden.

### Node

```json
{
  "id": "nginx",
  "name": "nginx Reverse Proxy",
  "category": "reverse-proxy",
  "status": "active",
  "parentId": "host-zone",
  "viewId": "server-intern",
  "linkedViewId": null,
  "position": { "x": 120, "y": 80 },
  "width": null,
  "height": null,
  "fields": {
    "ip": "192.168.2.104",
    "vlan": "10",
    "os": "Debian 12",
    "hostname": "nginx.lan",
    "url": "https://example.com",
    "platform": "Proxmox VE"
  },
  "notes": "# Markdown\nFreitext-Dokumentation (GFM).",
  "customFields": { "Container-ID": "118", "Stack": "nginx:alpine" },
  "createdAt": "2026-07-02T18:00:00.000Z",
  "updatedAt": "2026-07-02T18:00:00.000Z"
}
```

| Feld | Pflicht | Default | Beschreibung |
|---|---|---|---|
| `id` | nein (POST) | UUID | Stabile ID für Updates via Skript |
| `name` | ja | — | Anzeigename (1–200 Zeichen) |
| `category` | nein | `generic` | Kategorie-String (beliebig, siehe Katalog) |
| `status` | nein | `unknown` | Siehe Status-Werte |
| `parentId` | nein | `null` | Zone/Gruppe; `category: "group"` für visuelle Zonen |
| `viewId` | nein | erste Root-Ebene | Ebene, zu der der Node gehört |
| `linkedViewId` | nein | `null` | Drill-down-Portal: verlinkte Detail-Ebene (Doppelklick öffnet sie) |
| `position` | nein | `{x:0,y:0}` | Canvas-Position (siehe Parent-Regel) |
| `width`, `height` | nein | `null` | Nur für Zonen (`category: "group"`) |
| `fields` | nein | `{}` | Typisierte Felder; Schlüssel & Typen aus `GET /meta/catalog` |
| `notes` | nein | `""` | Markdown (max. 200 KB) |
| `customFields` | nein | `{}` | Freiform-Key-Value, max. 100 Keys, Werte max. 4000 Zeichen |

**Status-Werte:** `active` | `inactive` | `planned` | `maintenance` | `error` | `unknown`

#### `fields` vs. `customFields`

`fields` enthält die **im Katalog definierten** Felder (`GET /meta/catalog` → `fields`):
sie haben Label, Typ, Gruppe und werden serverseitig geprüft. `customFields` ist der
Freiform-Ausweg für alles, was der Katalog nicht kennt — dort ist der Schlüssel selbst
das Label.

Alle Werte sind **Strings**, auch bei `type: "number"` und `type: "date"`. Ein leerer
String bedeutet „nicht gesetzt" und wird nie abgelehnt. Validiert wird nach Typ:

| Typ | Regel |
|---|---|
| `number` | muss als Zahl parsebar sein (`"16"`, nicht `"viel"`) |
| `date` | `JJJJ-MM-TT` |
| `url` | braucht ein Schema (`https://…`) |
| `select` | einer der Werte aus `options` |
| `text` | max. 4000 Zeichen |

Unbekannte Schlüssel in `fields` werden **akzeptiert und gespeichert**, nicht abgelehnt —
sonst würde der Import eines Projekts scheitern, dessen Felddefinition diese Instanz
nicht kennt.

> **Produktneutralität:** Kategorien beschreiben Bausteine, keine Hersteller. Ein
> Proxmox-, ESXi- oder Hyper-V-Host ist `category: "hypervisor"` mit
> `fields.platform: "Proxmox VE"` — nicht eine eigene Kategorie pro Produkt.

> Status ist **manuell/API-gesteuert**. Es gibt keinen Ping oder Health-Check.

### Edge

```json
{
  "id": "e-nginx-app",
  "sourceId": "nginx",
  "targetId": "web-app",
  "viewId": "server-intern",
  "label": "HTTP :80",
  "kind": "http",
  "lineStyle": "solid",
  "animated": false,
  "notes": "",
  "routing": { "mode": "auto", "waypoints": [], "labelT": null },
  "customFields": {},
  "createdAt": "2026-07-02T18:00:00.000Z",
  "updatedAt": "2026-07-02T18:00:00.000Z"
}
```

| Feld | Pflicht | Default |
|---|---|---|
| `sourceId`, `targetId` | ja | — |
| `viewId` | nein | Ebene der Quelle | Ebene der Kante (**Quelle & Ziel müssen dieselbe Ebene haben**) |
| `label` | nein | `""` |
| `kind` | nein | `generic` |
| `lineStyle` | nein | `solid` |
| `animated` | nein | `false` |
| `notes`, `customFields` | nein | wie Node |
| `routing` | nein | `{ mode: "auto", waypoints: [], labelT?: 0..1 }` — manueller Kantenverlauf + Label-Anker |

**routing.mode:** `auto` (automatisch) | `manual` (Waypoints aus UI/API).
**routing.waypoints:** absolute Canvas-Punkte; das Andocken an den Nodes wird von der UI automatisch repariert (orthogonal), auch wenn Nodes später verschoben werden.
**routing.labelT:** Position des Labels **auf** der Linie (0 = Quelle, 1 = Ziel, Default 0.5).
**Auto-Layout (`POST /graph/layout`) setzt `routing` aller Edges zurück** — manuelle Waypoints beziehen sich auf alte Positionen und wären danach wertlos.

**lineStyle:** `solid` | `dashed` | `dotted`

### Graph

`GET /graph?viewId=…` liefert **nur die Nodes/Edges einer Ebene** (ohne `viewId`: Root-Ebene):

```json
{ "viewId": "…", "nodes": [ /* Node[] */ ], "edges": [ /* Edge[] */ ] }
```

Export enthält **alle** Projekte, Ebenen, Nodes und Edges:
`{ "version": 3, "exportedAt": "…", "projects": [], "views": [], "nodes": [], "edges": [] }`

---

## Wichtige Regeln für Agenten

1. **Parent-Positionen:** Kinder speichern `position` **relativ zum Parent** (React-Flow-Konvention).
   Absolute Position = Summe aller Parent-Positionen in der Kette.

2. **Reihenfolge bei Import:** In `nodes` muss jeder Parent **vor** seinen Kindern stehen.

3. **Zonen:** `category: "group"` + `width`/`height` für Gruppierungsrahmen.
   Kinder via `parentId` zuweisen. **Parent und Kind müssen in derselben Ebene liegen**;
   ohne `viewId` erbt ein Kind die Ebene seines Parents. Wechselt ein Node per PATCH die
   Ebene, wird ein zurückbleibender Parent automatisch gelöst (Position wird absolut).

4. **Node löschen:** Verbundene Edges werden mitgelöscht.
   Kinder werden an den Großeltern-Node gehängt; Positionen werden angepasst (kein Sprung auf der Canvas).

5. **Parent-Zyklen:** Werden abgelehnt (`400`).

6. **Graph-Import:** `POST /graph/import` mit `mode: "replace"` **löscht alle** bestehenden
   Daten des Nutzers und ersetzt sie. `mode: "merge"` fügt den Payload **additiv** hinzu:
   alle IDs werden neu vergeben (Referenzen werden umgeschrieben), Bestehendes bleibt
   unangetastet — so lassen sich exportierte Projekte zwischen Konten teilen.

7. **PATCH vs. PUT:** Beide partielles Update (nur gesendete Felder ändern sich).
   `fields` und `customFields` werden bei PATCH **als Ganzes ersetzt**, nicht gemerged —
   wer ein einzelnes Feld ändern will, sendet das komplette Objekt mit.

8. **Suche `GET /nodes?q=`:** Durchsucht `name` sowie alle **Werte** aus `fields` und
   `customFields`. Schlüssel matchen nicht (`q=platform` findet nichts).

9. **Ebenen (Views):** Jeder Node/jede Edge gehört zu genau einer Ebene (`viewId`). Kanten
   verbinden nur Nodes **derselben** Ebene — das gilt auch für `PATCH /edges/:id`
   (Endpunkt-Wechsel); die `viewId` einer Kante folgt immer ihren Endknoten.
   Ebenen-übergreifende Bezüge werden über `node.linkedViewId` (Drill-down) modelliert,
   nicht über Kanten. Auto-Align (`/graph/layout`) wirkt nur auf die angegebene `viewId`.
   Import: `views` mit Parents **vor** Kindern. Eine Ebene, deren Unterbaum **alle**
   Ebenen des Projekts umfasst, kann nicht gelöscht werden (`400`).

10. **Projekte:** Oberste Ebene, komplett getrennt. `GET /views?projectId=` und
    `GET /nodes?projectId=` (globale Suche) scopen auf ein Projekt. Import: `projects` zuerst.

---

## Endpunkte

### Projekte

| Methode | Pfad | Beschreibung |
|---|---|---|
| `GET` | `/projects` | Alle Projekte |
| `POST` | `/projects` | Projekt (inkl. leerer Root-Ebene) anlegen → `201` |
| `GET` | `/projects/:id` | Einzelnes Projekt |
| `PATCH`/`PUT` | `/projects/:id` | Partielles Update |
| `DELETE` | `/projects/:id` | Kaskadiert auf Ebenen/Nodes/Edges (letztes Projekt: `400`) |

### Ebenen (Views)

| Methode | Pfad | Beschreibung |
|---|---|---|
| `GET` | `/views?projectId=` | Ebenen (eines Projekts; flach, Hierarchie über `parentId`) |
| `POST` | `/views` | Ebene anlegen → `201` |
| `GET` | `/views/:id` | Einzelne Ebene |
| `PATCH`/`PUT` | `/views/:id` | Partielles Update |
| `DELETE` | `/views/:id` | Kaskadiert auf Unterebenen + Nodes/Edges (letzte Ebene des Projekts: `400`) |

### Auth

| Methode | Pfad | Beschreibung |
|---|---|---|
| `POST` | `/auth/register` | Konto anlegen (`{email, password}`), seedet Beispielprojekt, setzt Cookie → `201` |
| `POST` | `/auth/login` | Anmelden (`{email, password}`), setzt Cookie → `200` |
| `POST` | `/auth/logout` | Session beenden → `204` |
| `GET` | `/auth/me` | Aktueller Nutzer inkl. `limits` der Instanz (`401`, wenn nicht angemeldet) |
| `POST` | `/auth/password` | Passwort ändern (`{currentPassword, newPassword}`) → `204`, beendet andere Sessions |
| `DELETE` | `/auth/account` | Konto + alle Daten löschen (`{password}`) → `204` |

### Health

```
GET /health   (öffentlich, kein Login nötig)
→ 200 { "status": "ok", "time": "2026-07-02T18:00:00.000Z" }
```

### Katalog

```
GET /meta/catalog
→ 200 { "categories": [...], "statuses": [...], "edgeKinds": [...], "lineStyles": [...], "fields": [...] }
```

`fields` beschreibt die typisierten Node-Felder. Ein Eintrag sieht so aus:

```json
{ "key": "ram", "label": "Arbeitsspeicher", "type": "number", "group": "System", "unit": "GB" }
```

Optional: `mono` (Monospace), `showOnNode` (Wert erscheint auf der Canvas), `wide`
(volle Panel-Breite), `placeholder`, `options` (bei `select`), `unit` (bei `number`).
```

### Rechtstexte

Impressum und Datenschutzerklärung werden pro Instanz unter `$DATA_DIR/legal/`
hinterlegt und sind ohne Anmeldung abrufbar. Ein leeres Array bedeutet, dass die
Instanz keine Texte veröffentlicht (Normalfall beim Self-Hosting).

```
GET /meta/legal
→ 200 { "documents": [ { "id": "impressum", "title": "Impressum", "markdown": "# Impressum…" } ] }
```

Kategorien und Edge-Kinds sind **Referenzwerte** — beliebige Strings sind erlaubt.
Unbekannte Kategorien werden in der UI mit Fallback-Icon gerendert. Status dagegen sind
ein **geschlossenes Enum**; ein unbekannter Wert wird mit 400 abgelehnt.

### Graph

| Methode | Pfad | Beschreibung |
|---|---|---|
| `GET` | `/graph?viewId=` | Graph **einer Ebene** (Default: Root) |
| `GET` | `/graph/export?projectId=` | Backup-JSON (alle Projekte — oder nur eines, zum Teilen) |
| `POST` | `/graph/import` | Graph ersetzen (`mode:"replace"`) oder additiv anfügen (`mode:"merge"`) |
| `POST` | `/graph/layout` | Auto-Align einer Ebene (`viewId` im Body) |

**Import-Body:**

```json
{
  "mode": "replace",
  "projects": [ /* Project mit id */ ],
  "views": [ /* View mit id + projectId, Parents zuerst */ ],
  "nodes": [ /* Node mit id + viewId */ ],
  "edges": [ /* Edge */ ]
}
```

**Antwort:** `{ "projects": 2, "views": 3, "nodes": 42, "edges": 17 }`
(`projects`/`views` fehlen → alles in Default-Projekt/Root-Ebene)

**Layout-Body (optional):**

```json
{ "viewId": "server-intern", "maxCols": 5 }
```

Ordnet die Nodes **der angegebenen Ebene** (Default: Root) deterministisch an:
- Schichten entlang der Kanten + Barycenter-Sortierung
- **Zonen mit internen Kanten:** Spaltenfluss links→rechts (z.B. DNS → Tunnel → WAF)
- Mehr Zellenabstand für lesbare Labels und weniger Überlappung

**Antwort:** `{ "updated": 42 }`

### Nodes

| Methode | Pfad | Beschreibung |
|---|---|---|
| `GET` | `/nodes?q=&category=&status=&viewId=&projectId=` | Liste / Suche / Filter (`projectId` = globale Suche über alle Ebenen) |
| `POST` | `/nodes` | Anlegen → `201` |
| `GET` | `/nodes/:id` | Einzelner Node |
| `PATCH` | `/nodes/:id` | Partielles Update |
| `PUT` | `/nodes/:id` | Partielles Update (gleich wie PATCH) |
| `DELETE` | `/nodes/:id` | Löschen → `204` |
| `POST` | `/nodes/positions` | Bulk-Positionsupdate |

**POST /nodes/positions:**

```json
{
  "positions": [
    { "id": "nginx", "x": 100, "y": 200 },
    { "id": "host-zone", "x": 0, "y": 0, "width": 600, "height": 400 }
  ]
}
```

**Antwort:** `{ "updated": 2 }`

### Edges

| Methode | Pfad | Beschreibung |
|---|---|---|
| `GET` | `/edges?nodeId=` | Alle Edges, optional gefiltert nach Node |
| `POST` | `/edges` | Anlegen → `201` |
| `GET` | `/edges/:id` | Einzelne Edge |
| `PATCH` | `/edges/:id` | Partielles Update |
| `PUT` | `/edges/:id` | Partielles Update |
| `DELETE` | `/edges/:id` | Löschen → `204` |

---

## Typische Agent-Workflows

### 1. Infrastruktur-Node anlegen

```http
POST /api/nodes
Content-Type: application/json

{
  "id": "postgres",
  "name": "PostgreSQL",
  "category": "database",
  "status": "active",
  "fields": { "ip": "192.168.2.50", "hostname": "postgres.lan", "version": "16", "ram": "8" },
  "customFields": { "Port": "5432" }
}
```

### 2. Monitoring-Status aktualisieren

```http
PATCH /api/nodes/postgres
Content-Type: application/json

{ "status": "error" }
```

Gültige Status: `active`, `inactive`, `planned`, `maintenance`, `error`, `unknown`.

### 3. Verbindung dokumentieren

```http
POST /api/edges
Content-Type: application/json

{
  "id": "e-app-db",
  "sourceId": "web-app",
  "targetId": "postgres",
  "kind": "tcp",
  "label": "PostgreSQL :5432",
  "lineStyle": "dashed"
}
```

### 4. Zone mit Kindern anlegen

```http
POST /api/nodes
{ "id": "homelab", "name": "Homelab", "category": "group", "position": {"x":0,"y":0}, "width": 800, "height": 600 }

POST /api/nodes
{ "id": "nginx", "name": "nginx", "category": "reverse-proxy", "parentId": "homelab", "position": {"x": 40, "y": 60} }
```

### 5. Backup & Restore

```bash
# (einmalig anmelden → cookies.txt, siehe „Authentifizierung")

# Backup (nur die eigenen Daten)
curl -s -b cookies.txt http://localhost:8080/api/graph/export -o backup.json

# Restore (ersetzt die eigenen Daten!)
curl -b cookies.txt -X POST http://localhost:8080/api/graph/import \
  -H 'Content-Type: application/json' \
  -d @backup.json
```

Import-Body muss `mode: "replace"` enthalten (Export-JSON hat kein `mode` → manuell ergänzen oder wrappen).

### 6. Graph lesen und diffen

```http
GET /api/graph
```

Empfohlen für Agenten, die den Gesamtzustand analysieren oder synchronisieren sollen.

### 7. Alles löschen

```http
POST /api/graph/import
Content-Type: application/json

{ "mode": "replace", "nodes": [], "edges": [] }
```

### 8. Nach API-Import anordnen

```http
POST /api/graph/layout
Content-Type: application/json

{ "maxCols": 5 }
```

Empfohlen direkt nach Bulk-Import oder wenn viele Nodes bei (0,0) liegen.

---

## Katalog-Referenz (häufige Werte)

Vollständige Liste: `GET /meta/catalog`.

### Node-Kategorien (Auszug)

| id | Gruppe |
|---|---|
| `hypervisor`, `vm`, `system-container`, `physical-device`, `router`, `vps` | Infrastruktur |
| `docker-stack`, `docker-container`, `database`, `web-app`, `monitoring` | Dienste |
| `reverse-proxy`, `tunnel`, `vpn`, `dns` | Netzwerk |
| `firewall`, `auth`, `secrets` | Security |
| `ci-runner`, `git-repo`, `automation` | CI/CD |
| `storage`, `backup` | Storage |
| `cloud-service`, `domain`, `internet` | Extern |
| `group` | Zone/Gruppierung |

### Edge-Kinds (Auszug)

| Gruppe | ids |
|---|---|
| Allgemein | `generic`, `dependency`, `data-flow`, `control`, `api` |
| Netzwerk | `http`, `https`, `tcp`, `udp`, `ssh`, `tunnel`, `vpn`, `dns`, `mail` |
| Betrieb | `monitoring`, `backup`, `ci` |

### Node-Felder (Auszug)

| Gruppe | keys |
|---|---|
| Allgemein | `url`, `owner`, `environment`, `criticality` |
| Netzwerk | `ip`, `hostname`, `vlan`, `mac` |
| System | `platform`, `os`, `version`, `cpu`, `ram`, `disk` |
| Betrieb | `location`, `reviewedAt` |

---

## Entscheidungshilfe: welcher Endpunkt?

| Ziel | Endpunkt |
|---|---|
| Einzelnes Feld ändern | `PATCH /nodes/:id` oder `PATCH /edges/:id` |
| Neues Gerät/Dienst | `POST /nodes` |
| Verbindung dokumentieren | `POST /edges` |
| Gesamtzustand lesen | `GET /graph` |
| Migration / Sync | `GET /graph/export` + `POST /graph/import` |
| Nur Positionen (Layout) | `POST /nodes/positions` |
| Auto-Align (gesamter Graph) | `POST /graph/layout` |
| Verfügbare Kategorien, Status, Edge-Kinds & Felder | `GET /meta/catalog` |
| API erreichbar? | `GET /health` |

---

## Quellcode-Referenz

| Datei | Inhalt |
|---|---|
| `backend/src/auth.js` | Passwort-Hashing (scrypt), Sessions, `requireAuth`, CSRF, Rate-Limit |
| `backend/src/limits.js` | Optionale Instanz-Limits (Standard: unbegrenzt) + Enforcement |
| `backend/src/validation.js` | Zod-Schemas, Limits (inkl. `register`/`login`) |
| `backend/src/layout.js` | Auto-Layout-Algorithmus |
| `backend/src/store.js` | CRUD, Import, Parent-Logik, Row-Level-Autorisierung |
| `backend/src/catalog.js` | Kategorien, Status, Edge-Kinds, Felddefinitionen |
| `backend/src/routes/*.js` | Route-Definitionen (inkl. `auth.js`) |
| `frontend/src/api/types.ts` | TypeScript-Typen (Frontend) |

Bei Abweichungen zwischen Doku und Code gilt der **Code** in `backend/src/`.
