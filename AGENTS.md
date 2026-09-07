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
{
  "id": "homelab",
  "name": "Mein Homelab",
  "color": "#38bdf8",
  "icon": "boxes",
  "packs": ["infrastructure", "network", "operations"],
  "sortOrder": 0
}
```

- Jedes Projekt gehört **genau einem Nutzer**; du siehst/änderst nur deine eigenen Projekte.
  Bei der Registrierung wird automatisch ein Beispielprojekt „Homelab (Beispiel)" angelegt.
  Ein neues Projekt startet mit einer eigenen Root-Ebene.
- **`packs`** bestimmt, welche Kategorien, Felder und Verbindungsarten dieses Projekt sieht
  (siehe [Domain-Packs](#domain-packs)). Beim Anlegen kann stattdessen `template` gesetzt
  werden — dann kommen die Packs von der Vorlage und ihr Startinhalt wird mit aufgebaut.
  `template` ist eine reine Anlege-Option: ein PATCH ignoriert sie.

#### Domain-Packs

Der Katalog ist in thematische Pakete geteilt. Ein **Kern-Pack** (Anwendung, Datenbank,
Gruppe, Nutzer, Abhängigkeit, Datenfluss, `url`, `owner`, `platform` …) ist immer aktiv;
alles Weitere kommt aus den gewählten Packs:

| id | Inhalt |
|---|---|
| `infrastructure` | Hypervisor, VM, Container, physische Geräte · `os`, `cpu`, `ram`, `disk` |
| `network` | Router, Proxy, VPN, DNS · Protokolle · `ip`, `hostname`, `vlan`, `mac` |
| `security` | Firewall, IDS, SSO, Secrets, Zertifikate · `expiresAt` |
| `operations` | Monitoring, Backup, CI/CD, Cronjobs · `sla` |
| `cloud` | Region, VPC, Managed Service, Bucket, Serverless · `region`, `accountId`, `cost` |
| `kubernetes` | Cluster, Namespace, Workload, Service, Volume · `namespace`, `image`, `replicas` |
| `software` | System, Komponente, API, Queue, Akteur · `repository`, `language` |
| `business` | Prozess, Schritt, Entscheidung, Rolle, Abteilung · `costCenter`, `frequency` |
| `homelab` | Medien, Game-Server, Smart Home, IoT |

Ein Pack abzuwählen **löscht nichts**: Werte zu dessen Feldern bleiben am Node erhalten und
werden weiterhin akzeptiert (die Validierung prüft gegen alle Packs, nicht nur die aktiven).
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
| `icon` | nein | `null` | Eigenes Symbol; `null` = Symbol der Kategorie (siehe [Bilder](#bilder)) |
| `color` | nein | `null` | Eigene Farbe; `null` = Farbe der Kategorie. Erst damit lassen sich Zonen unterscheiden |
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
   `customFields`. Schlüssel matchen nicht (`q=platform` findet nichts). Auf exakte
   Feldwerte filtert die UI clientseitig, siehe `select` im Katalog-Abschnitt.

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
| `GET` | `/projects/:id/catalog` | Katalog **dieses Projekts** (nur seine Packs) |
| `PATCH`/`PUT` | `/projects/:id` | Partielles Update |
| `DELETE` | `/projects/:id` | Kaskadiert auf Ebenen/Nodes/Edges (letztes Projekt: `400`) |

**Projekt mit Vorlage anlegen:**

```http
POST /api/projects
{ "name": "Prod-Cluster", "template": "kubernetes" }
```

Baut Ebenen, Nodes und Kanten der Vorlage auf und übernimmt deren Packs. Ein
mitgesendetes `packs` gewinnt gegenüber der Vorlage. Projekt und Inhalt entstehen in
**einer Transaktion** — läuft der Aufbau in ein Instanz-Limit, bleibt kein halbes Projekt
zurück. Verfügbare Vorlagen: `GET /meta/templates`.

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
→ 200 { "status": "ok", "version": "1.0.0", "time": "2026-07-02T18:00:00.000Z" }
```

`version` kommt aus `/VERSION` (bzw. `APP_VERSION` im Docker-Image).
### Katalog

```
GET /meta/catalog
→ 200 { "categories": [...], "statuses": [...], "edgeKinds": [...], "lineStyles": [...],
        "fields": [...], "packs": [...] }

GET /meta/packs      → 200 { "packs": [ { "id": "network", "label": "Netzwerk", … } ] }
GET /meta/templates  → 200 { "templates": [ { "id": "kubernetes", "packs": [...], … } ] }
```

`/meta/catalog` liefert den **vollständigen** Katalog über alle Packs — die Referenz, wenn
du kein konkretes Projekt im Blick hast. Für ein Projekt nimm `GET /projects/:id/catalog`;
nur dessen Kategorien und Felder erscheinen dort auch in der UI.

`fields` beschreibt die typisierten Node-Felder. Ein Eintrag sieht so aus:

```json
{ "key": "ram", "label": "Arbeitsspeicher", "type": "number", "group": "System", "unit": "GB" }
```

Optional: `mono` (Monospace), `showOnNode` (Wert erscheint auf der Canvas), `wide`
(volle Panel-Breite), `placeholder`, `options` (bei `select`), `unit` (bei `number`).

Jedes Feld vom Typ `select` wird in der UI automatisch zu einem Filter (neben Status und
Kategorie). Wer ein Feld filterbar machen will, gibt ihm also `type: "select"` mit
`options` — es braucht dafür keinen weiteren Eintrag. Gefiltert wird rein im Client, es
gibt keinen zusätzlichen Endpunkt; serverseitig filtern `GET /nodes?category=&status=`.
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

### Freigabelinks (read-only)

Ein Link macht **genau ein Projekt** ohne Konto lesbar.

| Methode | Pfad | Beschreibung |
|---|---|---|
| `GET` | `/projects/:id/shares` | Links des Projekts (ohne Token) |
| `POST` | `/projects/:id/shares` | `{ label?, expiresAt? }` → `201` **mit** `token` |
| `DELETE` | `/projects/:id/shares/:shareId` | Widerrufen |
| `GET` | `/share/:token` | **Ohne Anmeldung:** Projekt, Ebenen, Nodes, Kanten, Katalog |
| `GET` | `/share/:token/assets/:id` | **Ohne Anmeldung:** Bild dieses Projekts |

- Das Klartext-**Token gibt es genau einmal**, in der Antwort auf `POST`. Gespeichert
  wird nur sein sha256-Hash (wie bei den Sitzungen). Ein verlorener Link lässt sich
  nicht wiederherstellen, nur ersetzen.
- `GET /share/:token` liefert **alle Ebenen auf einmal**, damit der Betrachter ohne
  weitere Anfragen durch die Drill-down-Hierarchie navigieren kann.
- Die Antwort enthält **nichts über den Besitzer** und keine anderen Projekte.
- Bilder sind nur abrufbar, wenn dieses Projekt sie auch benutzt — sonst wäre ein
  Link ein Leseschlüssel für die ganze Bildbibliothek des Kontos.
- Unbekannt, abgelaufen oder widerrufen ergibt jeweils **404**, nicht 403: die
  Antwort soll nicht verraten, ob ein Token je gültig war.
- Über diesen Weg lässt sich **nichts ändern**: der Router bietet nur GET.
- Ein Projekt zu löschen entfernt seine Links mit.

### Bilder

Hochgeladene Bilder dienen als eigenes Node-Symbol und als Bild in Notizen.

| Methode | Pfad | Beschreibung |
|---|---|---|
| `GET` | `/assets` | Bibliothek des Kontos (nur Metadaten) |
| `POST` | `/assets` | `{ name, dataUrl }` → `201` mit den Metadaten |
| `GET` | `/assets/:id` | Liefert die Bytes aus |
| `DELETE` | `/assets/:id` | Löscht das Bild → `{ clearedNodes }` |

```http
POST /api/assets
{ "name": "nextcloud.svg", "dataUrl": "data:image/svg+xml;base64,PHN2Zy4uLg==" }
```

- **Der Typ wird an den Magic Bytes erkannt**, nicht am `Content-Type` im Data-URL.
  Ein als `image/png` deklariertes SVG wird als SVG gespeichert und behandelt.
  Erlaubt: PNG, JPEG, WebP, SVG. Alles andere → `400`.
- Grenzen: `MAX_ASSET_BYTES` (Standard 1 MB) → `413`, `MAX_ASSETS_PER_USER` → `403`
  mit `code: "limit_reached"`.
- **Referenziert** wird ein Bild an zwei Stellen: als `node.icon` in der Form
  `asset:<id>` und in `node.notes` als Markdown-Bild mit der URL `/api/assets/<id>`.
  Beide Formen werden beim Projekt-Export eingesammelt und beim Merge-Import auf die
  neu vergebenen IDs umgeschrieben.
- Ein Bild zu **löschen** setzt `icon` aller Nodes zurück, die es nutzen — es bleibt
  keine tote Referenz stehen.
- Bilder sind **unveränderlich** (nur anlegen, lesen, löschen) und werden mit
  `Cache-Control: immutable` sowie einem `ETag` ausgeliefert.
- Ausgeliefert wird mit `X-Content-Type-Options: nosniff` und einer eigenen
  `Content-Security-Policy`, damit ein direkt aufgerufenes SVG nichts ausführen kann.
  Externe Bild-URLs sind bewusst nicht vorgesehen.

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
  "edges": [ /* Edge */ ],
  "assets": [ /* { id, name, dataUrl } — siehe Bilder */ ]
}
```

`GET /graph/export?projectId=` führt nur die Bilder mit, die dieses Projekt auch
benutzt; der Backup-Export (ohne `projectId`) nimmt die ganze Bibliothek.

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
| `GET` | `/edges?nodeId=&viewId=&projectId=` | Alle Edges, gleiche Filter wie `/nodes` |
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

Vollständige Liste: `GET /meta/catalog` (alle Packs) bzw. `GET /projects/:id/catalog`
(nur die eines Projekts). Nach Pack gruppiert — welche davon sichtbar sind, entscheidet
`project.packs`, siehe [Domain-Packs](#domain-packs).

### Node-Kategorien (Auszug)

| Pack | ids |
|---|---|
| *Kern* (immer aktiv) | `generic`, `group`, `web-app`, `native-service`, `database`, `storage`, `client`, `internet`, `cloud-service`, `domain`, `email` |
| `infrastructure` | `hypervisor`, `vm`, `system-container`, `physical-device`, `vps`, `docker-stack`, `docker-container` |
| `network` | `router`, `wifi-ap`, `reverse-proxy`, `tunnel`, `vpn`, `dns` |
| `security` | `firewall`, `ids`, `auth`, `secrets`, `certificate` |
| `operations` | `monitoring`, `backup`, `file-share`, `ci-runner`, `git-repo`, `automation` |
| `cloud` | `cloud-region`, `cloud-network`, `managed-service`, `object-storage`, `serverless`, `load-balancer` |
| `kubernetes` | `k8s-cluster`, `k8s-namespace`, `k8s-workload`, `k8s-service`, `k8s-ingress`, `k8s-volume` |
| `software` | `software-system`, `component`, `api-endpoint`, `message-queue`, `external-system`, `actor`, `ai-service` |
| `business` | `process`, `process-step`, `decision`, `document`, `role`, `department`, `business-system` |
| `homelab` | `media`, `game-server`, `smart-home`, `iot-device` |

### Edge-Kinds

| Pack | ids |
|---|---|
| *Kern* | `generic`, `dependency`, `data-flow`, `control`, `api` |
| `network` | `http`, `https`, `tcp`, `udp`, `dns`, `tunnel`, `vpn`, `mail` |
| `infrastructure` | `ssh` |
| `operations` | `monitoring`, `backup`, `ci` |
| `software` | `event` |
| `business` | `process-flow`, `responsibility` |

### Node-Felder

| Pack | keys |
|---|---|
| *Kern* | `url`, `owner`, `environment`, `criticality`, `platform`, `version`, `location`, `reviewedAt` |
| `infrastructure` | `os`, `cpu`, `ram`, `disk` |
| `network` | `ip`, `hostname`, `vlan`, `mac` |
| `security` | `expiresAt` |
| `operations` | `sla` |
| `cloud` | `region`, `accountId`, `resourceId`, `cost` |
| `kubernetes` | `namespace`, `image`, `replicas` |
| `software` | `repository`, `language` |
| `business` | `costCenter`, `frequency` |

### Vorlagen

`empty` · `homelab` · `network` · `cloud` · `kubernetes` · `software` · `business`
(`GET /meta/templates` liefert Beschreibung, Packs und Grösse jeder Vorlage.)

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
| Alle Kategorien, Status, Edge-Kinds & Felder | `GET /meta/catalog` |
| Was ein bestimmtes Projekt sieht | `GET /projects/:id/catalog` |
| Verfügbare Packs / Vorlagen | `GET /meta/packs` · `GET /meta/templates` |
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
| `backend/src/catalog/` | Kern + Domain-Packs (Kategorien, Edge-Kinds, Felddefinitionen) |
| `backend/src/templates/` | Startvorlagen für neue Projekte |
| `backend/src/assets.js` | Bild-Typ-Erkennung und Auslieferungs-Header |
| `backend/src/share.js` | Freigabe-Token, Hashing und Ablauf |
| `backend/src/routes/*.js` | Route-Definitionen (inkl. `auth.js`) |
| `frontend/src/api/types.ts` | TypeScript-Typen (Frontend) |
| `frontend/src/lib/catalog.ts` | Katalogzugriff im Client: Felder, Badges, Filterdefinitionen |

Bei Abweichungen zwischen Doku und Code gilt der **Code** in `backend/src/`.
