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
- **Auth:** keine (selbst gehostet, kein Token/API-Key)
- **CORS:** aktiv
- **Body-Limit:** 20 MB
- **IDs:** `^[A-Za-z0-9_.:-]{1,64}$` — sprechende IDs wie `nginx` oder `proxmox-host` empfohlen
- **Zeitstempel:** ISO 8601 (`createdAt`, `updatedAt`)

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
| `404` | Node/Edge/Route nicht gefunden |
| `409` | ID existiert bereits |
| `413` | Request-Body zu groß |
| `500` | Interner Serverfehler |

Erfolg ohne Body: `204 No Content` (DELETE).

---

## Datenmodell

### View (Ebene)

Ebenen gliedern die Infrastruktur in eine **Drill-down-Hierarchie** (C4-artig): eine
Übersichts-Ebene zeigt grobe Bausteine, ein Node kann in eine eigene **Detail-Ebene**
verlinken. Jeder Node/jede Edge gehört zu **genau einer** Ebene.

```json
{
  "id": "server-intern",
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
  "status": "running",
  "parentId": "proxmox-zone",
  "viewId": "server-intern",
  "linkedViewId": null,
  "position": { "x": 120, "y": 80 },
  "width": null,
  "height": null,
  "ip": "192.168.2.104",
  "vlan": "10",
  "os": "Debian 12",
  "hostname": "nginx.lan",
  "url": "https://example.com",
  "notes": "# Markdown\nFreitext-Dokumentation (GFM).",
  "customFields": { "LXC-ID": "118", "Stack": "nginx:alpine" },
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
| `ip`, `vlan`, `os`, `hostname`, `url` | nein | `null` | Typisierte Infrastruktur-Felder |
| `notes` | nein | `""` | Markdown (max. 200 KB) |
| `customFields` | nein | `{}` | Key-Value, max. 100 Keys, Werte max. 4000 Zeichen |

**Status-Werte:** `running` | `stopped` | `planned` | `maintenance` | `error` | `unknown`

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

Export enthält **alle** Ebenen, Nodes und Edges:
`{ "version": 2, "exportedAt": "…", "views": [], "nodes": [], "edges": [] }`

---

## Wichtige Regeln für Agenten

1. **Parent-Positionen:** Kinder speichern `position` **relativ zum Parent** (React-Flow-Konvention).
   Absolute Position = Summe aller Parent-Positionen in der Kette.

2. **Reihenfolge bei Import:** In `nodes` muss jeder Parent **vor** seinen Kindern stehen.

3. **Zonen:** `category: "group"` + `width`/`height` für Gruppierungsrahmen.
   Kinder via `parentId` zuweisen.

4. **Node löschen:** Verbundene Edges werden mitgelöscht.
   Kinder werden an den Großeltern-Node gehängt; Positionen werden angepasst (kein Sprung auf der Canvas).

5. **Parent-Zyklen:** Werden abgelehnt (`400`).

6. **Graph-Import:** `POST /graph/import` mit `mode: "replace"` **löscht alle** bestehenden Nodes/Edges und ersetzt sie.

7. **PATCH vs. PUT:** Beide partielles Update (nur gesendete Felder ändern sich).
   `customFields` wird bei PATCH **ersetzt**, nicht gemerged.

8. **Suche `GET /nodes?q=`:** Durchsucht `name`, `ip`, `hostname`, `url`, `os` — **nicht** `customFields`.

9. **Ebenen (Views):** Jeder Node/jede Edge gehört zu genau einer Ebene (`viewId`). Kanten
   verbinden nur Nodes **derselben** Ebene. Ebenen-übergreifende Bezüge werden über
   `node.linkedViewId` (Drill-down) modelliert, nicht über Kanten. Auto-Align (`/graph/layout`)
   wirkt nur auf die angegebene `viewId`. Import: `views` mit Parents **vor** Kindern.

---

## Endpunkte

### Ebenen (Views)

| Methode | Pfad | Beschreibung |
|---|---|---|
| `GET` | `/views` | Alle Ebenen (flach; Hierarchie über `parentId`) |
| `POST` | `/views` | Ebene anlegen → `201` |
| `GET` | `/views/:id` | Einzelne Ebene |
| `PATCH`/`PUT` | `/views/:id` | Partielles Update |
| `DELETE` | `/views/:id` | Kaskadiert auf Unterebenen + Nodes/Edges (letzte Ebene: `400`) |

### Health

```
GET /health
→ 200 { "status": "ok", "time": "2026-07-02T18:00:00.000Z" }
```

### Katalog

```
GET /meta/catalog
→ 200 { "categories": [...], "statuses": [...], "edgeKinds": [...], "lineStyles": [...] }
```

Kategorien und Edge-Kinds sind **Referenzwerte** — beliebige Strings sind erlaubt.
Unbekannte Kategorien werden in der UI mit Fallback-Icon gerendert.

### Graph

| Methode | Pfad | Beschreibung |
|---|---|---|
| `GET` | `/graph?viewId=` | Graph **einer Ebene** (Default: Root) |
| `GET` | `/graph/export` | Backup-JSON (alle Ebenen; `version`, `exportedAt`) |
| `POST` | `/graph/import` | Graph inkl. Ebenen ersetzen |
| `POST` | `/graph/layout` | Auto-Align einer Ebene (`viewId` im Body) |

**Import-Body:**

```json
{
  "mode": "replace",
  "views": [ /* View mit id, Parents zuerst */ ],
  "nodes": [ /* Node mit id + viewId */ ],
  "edges": [ /* Edge */ ]
}
```

**Antwort:** `{ "views": 3, "nodes": 42, "edges": 17 }` (`views` fehlt → alles in Root-Ebene)

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
| `GET` | `/nodes?q=&category=&status=` | Liste / Suche / Filter |
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
    { "id": "proxmox-zone", "x": 0, "y": 0, "width": 600, "height": 400 }
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
  "status": "running",
  "ip": "192.168.2.50",
  "hostname": "postgres.lan",
  "customFields": { "Port": "5432", "Version": "16" }
}
```

### 2. Monitoring-Status aktualisieren

```http
PATCH /api/nodes/postgres
Content-Type: application/json

{ "status": "error" }
```

Gültige Status: `running`, `stopped`, `planned`, `maintenance`, `error`, `unknown`.

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
# Backup
curl -s http://localhost:8080/api/graph/export -o backup.json

# Restore (ersetzt alles!)
curl -X POST http://localhost:8080/api/graph/import \
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
| `proxmox-host`, `vm`, `lxc`, `router`, `vps` | Infrastruktur |
| `docker-stack`, `docker-container`, `database`, `web-app`, `monitoring` | Dienste |
| `reverse-proxy`, `tunnel`, `vpn`, `dns` | Netzwerk |
| `firewall`, `auth`, `secrets` | Security |
| `ci-runner`, `git-repo`, `automation` | CI/CD |
| `storage`, `backup` | Storage |
| `cloud-service`, `domain`, `internet` | Extern |
| `group` | Zone/Gruppierung |

### Edge-Kinds (Auszug)

`http`, `https`, `tcp`, `udp`, `ssh`, `tunnel`, `vpn`, `dns`, `mail`, `monitoring`, `backup`, `ci`, `dependency`, `generic`

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
| Verfügbare Kategorien | `GET /meta/catalog` |
| API erreichbar? | `GET /health` |

---

## Quellcode-Referenz

| Datei | Inhalt |
|---|---|
| `backend/src/validation.js` | Zod-Schemas, Limits |
| `backend/src/layout.js` | Auto-Layout-Algorithmus |
| `backend/src/store.js` | CRUD, Import, Parent-Logik |
| `backend/src/catalog.js` | Kategorien, Status, Edge-Kinds |
| `backend/src/routes/*.js` | Route-Definitionen |
| `frontend/src/api/types.ts` | TypeScript-Typen (Frontend) |

Bei Abweichungen zwischen Doku und Code gilt der **Code** in `backend/src/`.
