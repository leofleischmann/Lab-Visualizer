# 🕸️ Lab Visualizer

Ein selbst gehostetes **Network Infrastructure Documentation Tool**: Homelab-Infrastruktur
visuell pflegen und dokumentieren — mit interaktiver Canvas (React Flow), Deep-Dive-Panel
(Markdown-Notizen + Custom Fields) und einer sauberen REST-API für Automatisierung.

![Stack](https://img.shields.io/badge/Stack-React%20%2B%20Express%20%2B%20SQLite-38bdf8)

## Features

- **Accounts & Mehrbenutzer** — Registrierung und Login per E-Mail/Passwort. Jede Person
  sieht und bearbeitet **nur ihre eigenen Projekte** — vollständig voneinander isoliert.
  Passwörter werden mit scrypt gehasht, Sessions laufen über HttpOnly-Cookies (server-seitig
  in SQLite, sofort widerrufbar). Siehe [Sicherheit](#sicherheit).
- **Projekte** — komplett getrennte Arbeitsbereiche (z. B. „Homelab”, „Arbeit”). Jedes Projekt
  hat eigene Ebenen, Nodes und Verbindungen; der Umschalter in der Kopfzeile wechselt zwischen
  ihnen. Anlegen, umbenennen, löschen (kaskadiert).
- **Globale Suche** — durchsucht alle Ebenen des aktiven Projekts; ein Klick auf einen Treffer
  springt in die richtige Ebene und selektiert den Node.
- **Undo / Redo** — für alle Canvas-Änderungen (Node/Verbindung anlegen, löschen, verschieben,
  bearbeiten, Kantenverlauf) inkl. Tastenkürzel (Strg/Cmd+Z, Umschalt für Wiederholen).
- **Ebenen (Drill-down-Hierarchie)** — Infrastruktur in Abstraktionsebenen gliedern statt alles
  auf eine Fläche zu quetschen. Ein Node der Übersicht (z. B. „Mein Server“) verlinkt in eine
  eigene **Detailebene** mit seinem internen Routing; **Doppelklick** zoomt hinein (wie im
  C4-Modell). Navigation per **Breadcrumb** und Ebenen-Baum. Jede Ebene ist eine eigene,
  fokussierte Canvas — Kanten verbinden nur Nodes derselben Ebene.
- **Visueller Editor** — Nodes (Server, LXCs, VMs, Dienste, Cloud-Komponenten) frei auf der
  Canvas platzieren, per Drag & Drop aus der Palette erstellen und mit Verbindungen (Edges)
  verknüpfen. Zonen/Gruppen (z. B. „Proxmox“, „Cloudflare Edge“) fassen Nodes zusammen und
  bewegen ihre Kinder mit. Ausrichtungshilfen (Snap-Lines) beim Verschieben.
- **Kanten-Routing wie in bpmn.io** — Verbindungen docken automatisch an der besten
  Node-Seite an und weichen Hindernissen aus. Linien lassen sich direkt greifen und
  orthogonal verlegen: Doppelklick auf die Linie fügt Eckpunkte ein (Doppelklick auf einen
  Eckpunkt entfernt ihn), das Docking wird beim Verschieben von Nodes automatisch repariert.
  Beschriftungen sitzen immer **auf** der Linie und werden per Drag entlang des Pfads verschoben.
- **Übersichtlich auch bei 50+ vernetzten Nodes** — **Fokus-Modus**: Hover oder Klick auf einen
  Node hebt ihn samt Nachbarn und verbindenden Kanten hervor und dimmt den Rest, sodass sich
  Zusammenhänge sofort ablesen lassen. **Semantisches Zoomen** blendet Kanten-Labels in der
  Gesamtübersicht aus und beim Hineinzoomen wieder ein. Rendering bleibt flüssig (60 fps beim
  Verschieben), da Kanten nur bei Bewegung ihrer eigenen Endknoten neu berechnet werden.
- **Deep-Dive Panel** — Klick auf Node oder Verbindung öffnet den Drawer: typisierte Felder
  (IP, VLAN, OS, Hostname, URL, Status), **Markdown-Notizen** mit Live-Vorschau (GFM-Tabellen,
  Listen, Code) und ein **Key-Value-System (Custom Fields)** für alles, was nicht in starre
  Spalten passt („Cloudflare Access Policy“, „Portainer Agent Port“, …).
- **API-First** — jede UI-Aktion läuft über die REST-API; alles lässt sich skripten.
- **KI-Agenten:** vollständige API-Doku in [AGENTS.md](AGENTS.md)
- **Suche** — filtert live über Name, IP, Hostname, URL, OS und Custom Fields.
- **Export / Import** — kompletter Graph als JSON (Backup, Versionierung, Automatisierung).
- **Offline-fähig** — keine externen CDNs/Fonts; läuft komplett lokal auf dem eigenen Host.

## Schnellstart

```bash
docker compose up -d --build
```

→ Web-UI: **http://localhost:8080** · API (über Frontend-Proxy): **http://localhost:8080/api**

Beim ersten Aufruf **registrierst du ein Konto** (E-Mail + Passwort). Jeder **neu
registrierte Nutzer** erhält automatisch ein Best-Practice-Beispielprojekt
**„Homelab (Beispiel)"**: eine dreistufige Drill-down-Infrastruktur (Übersicht
*Internet → Cloudflare → Router → Proxmox → NAS*, Detailebene *Proxmox intern* mit
Reverse-Proxy/SSO/DB, Detailebene *nginx Routing*) — so ist sofort ein sinnvolles
Beispiel zum Erkunden da statt einer leeren Canvas.

> ⚠️ **HTTPS in Produktion:** Läuft die Instanz öffentlich (z. B. hinter einem
> Cloudflare-Tunnel), unbedingt über **HTTPS** ausliefern und `COOKIE_SECURE=true`
> setzen, damit Session-Cookies nur verschlüsselt übertragen werden.

Die SQLite-Datenbank liegt in `./data/labviz.db` — **Backup = Datei/Ordner kopieren**
(dank WAL-Modus am besten den ganzen `data/`-Ordner oder via
`sqlite3 data/labviz.db ".backup backup.db"`).

### Entwicklung (ohne Docker)

```bash
# Backend (Port 3000)
cd backend && npm install && npm run dev

# Frontend (Port 5173, proxied /api → :3000)
cd frontend && npm install && npm run dev

# Tests
cd backend && npm test
```

## Architektur

```
┌───────────────┐     /api (Proxy)      ┌────────────────┐        ┌─────────────┐
│   Frontend    │ ────────────────────▶ │    Backend     │ ─────▶ │   SQLite    │
│ React + Vite  │                       │ Express (Node) │        │ ./data/*.db │
│ React Flow    │                       │ REST-API + Zod │        └─────────────┘
│ nginx (:8080) │                       │     (:3000)    │
└───────────────┘                       └────────────────┘
```

- **Frontend:** React 18 + TypeScript, [React Flow](https://reactflow.dev) (Canvas),
  Zustand (State), Tailwind CSS 4, react-markdown (GFM). Ausgeliefert über nginx,
  das `/api` an das Backend weiterreicht.
- **Backend:** Node.js 22 + Express, better-sqlite3 (synchron, schnell, eine Datei),
  Zod-Validierung. Kein ORM — das Schema ist bewusst klein.
- **Datenmodell:** feste Kern-Felder + `customFields` (JSON Key-Value) pro Node/Edge.
  Kategorien/Status/Verbindungsarten kommen aus einem zentralen Katalog
  (`backend/src/catalog.js`) und sind über `/api/meta/catalog` abfragbar —
  neue Kategorien = ein Eintrag dort. Der Katalog deckt das ganze Homelab-Spektrum ab:
  **Infrastruktur** (Proxmox, VM, LXC, VPS, Router), **Dienste** (Docker, Datenbanken,
  Monitoring, Medien, Game-Server, KI/LLM), **Netzwerk** (Reverse Proxy, Tunnel, VPN,
  DNS, Switch/AP), **Security** (Firewall/WAF, IDS/IPS, Auth/Zero Trust, Secrets,
  Zertifikate), **CI/CD & Automatisierung** (CI-Runner wie GitHub Actions, Git/GitOps,
  Cronjobs), **Storage & Backup** (NAS, Backup, Sync), **Smart Home & IoT** sowie
  **Externes** (Cloud-Dienste, E-Mail, Domains, Benachrichtigungen).
- **Eigene Kategorien:** Die API akzeptiert beliebige Kategorie-Strings, und im
  Drawer gibt es „Eigene Kategorie …“ — unbekannte Kategorien werden mit
  Fallback-Icon/-Farbe gerendert. Nichts ist auf den Katalog beschränkt.

## REST-API

Alle Endpunkte liefern/erwarten JSON. Basis-URL im Compose-Setup:
`http://localhost:8080/api` (oder Backend direkt auf `:3000`, wenn freigegeben).

**Authentifizierung:** Bis auf `/api/health`, `/api/meta/catalog` und `/api/auth/*`
erfordern **alle** Endpunkte eine Anmeldung (Session-Cookie `sid`). Ohne gültige Session
antwortet die API mit `401`. Alle Daten-Endpunkte sind **auf den angemeldeten Nutzer
beschränkt** — fremde IDs verhalten sich wie „nicht vorhanden" (`404`).

| Methode | Pfad | Beschreibung |
|---|---|---|
| `POST` | `/api/auth/register` | Konto anlegen (`{email, password}`), seedet ein Beispielprojekt, setzt Cookie |
| `POST` | `/api/auth/login` | Anmelden (`{email, password}`), setzt Session-Cookie |
| `POST` | `/api/auth/logout` | Session serverseitig beenden |
| `GET` | `/api/auth/me` | Aktueller Nutzer (`401`, wenn nicht angemeldet) |
| `GET` | `/api/health` | Healthcheck (öffentlich) |
| `GET` | `/api/meta/catalog` | Kategorien, Status, Verbindungsarten, Linienstile (öffentlich) |
| `GET` | `/api/graph` | Kompletter Graph (`{nodes, edges}`) |
| `GET` | `/api/graph/export` | JSON-Dump (Download) |
| `POST` | `/api/graph/import` | Graph ersetzen (`{mode:"replace", nodes, edges}`) |
| `GET` | `/api/nodes?q=&category=&status=` | Nodes suchen/filtern |
| `POST` | `/api/nodes` | Node anlegen (optional mit eigener `id`) |
| `GET/PATCH/PUT/DELETE` | `/api/nodes/:id` | Node lesen / ändern / löschen |
| `POST` | `/api/nodes/positions` | Bulk-Positionsupdate (`{positions:[{id,x,y,width?,height?}]}`) |
| `GET` | `/api/edges?nodeId=` | Verbindungen (optional je Node) |
| `POST` | `/api/edges` | Verbindung anlegen (`{sourceId, targetId, …}`) |
| `GET/PATCH/PUT/DELETE` | `/api/edges/:id` | Verbindung lesen / ändern / löschen |

### Beispiele

```bash
# Zuerst anmelden und das Session-Cookie in einem Cookie-Jar ablegen …
curl -c cookies.txt -X POST http://localhost:8080/api/auth/login \
  -H 'Content-Type: application/json' \
  -d '{ "email": "du@example.com", "password": "dein-passwort" }'
# … dann das Cookie bei jedem weiteren Request mitschicken (-b cookies.txt).

# Node per Skript anlegen (mit sprechender ID für spätere Updates)
curl -b cookies.txt -X POST http://localhost:8080/api/nodes \
  -H 'Content-Type: application/json' \
  -d '{
    "id": "nginx",
    "name": "nginx Reverse Proxy",
    "category": "reverse-proxy",
    "status": "running",
    "ip": "192.168.2.104",
    "customFields": { "LXC": "118", "Stack": "nginx:alpine + CrowdSec" }
  }'

# Status aus einem Monitoring-Skript heraus aktualisieren
curl -b cookies.txt -X PATCH http://localhost:8080/api/nodes/nginx \
  -H 'Content-Type: application/json' \
  -d '{ "status": "error" }'

# Verbindung anlegen
curl -b cookies.txt -X POST http://localhost:8080/api/edges \
  -H 'Content-Type: application/json' \
  -d '{ "sourceId": "cloudflared", "targetId": "nginx", "kind": "http", "label": "HTTP :80" }'

# Backup per API (nur die eigenen Daten)
curl -s -b cookies.txt http://localhost:8080/api/graph/export > backup.json
```

**Node-Felder:** `name` (Pflicht), `category`, `status`
(`running|stopped|planned|error|unknown`), `parentId` (Zone/Gruppe), `position{x,y}`,
`width/height` (Zonen), `ip`, `vlan`, `os`, `hostname`, `url`, `notes` (Markdown),
`customFields` (String→String).
**Edge-Felder:** `sourceId`, `targetId` (Pflicht), `label`, `kind`, `lineStyle`
(`solid|dashed|dotted`), `animated`, `notes`, `customFields`.

**Positionen:** Kind-Nodes einer Zone speichern ihre Position **relativ zum Parent**
(React-Flow-Konvention). Beim Löschen einer Zone werden Kinder automatisch an den
Großeltern-Knoten übergeben, ohne optisch zu springen.

## Produktion (hinter Cloudflare)

Der öffentliche Zugriff läuft über **HTTPS via Cloudflare** (Tunnel → nginx → Backend).
Damit das sauber und sicher funktioniert:

- **Secure-Cookies** sind dank `NODE_ENV=production` (im Backend-Image) automatisch aktiv —
  Session-Cookies werden nur über HTTPS übertragen. (Override: `COOKIE_SECURE`.)
- **Sicherheits-Header** liefert nginx mit: `Content-Security-Policy` (nur same-origin, keine
  externen Quellen), `Strict-Transport-Security` (HSTS), `X-Frame-Options: DENY`,
  `X-Content-Type-Options: nosniff`, `Referrer-Policy`, `Permissions-Policy`.
- **Echte Client-IP:** nginx reicht `CF-Connecting-IP` durch; das Rate-Limit greift damit
  pro echtem Client statt pro Cloudflare-Edge.
- **CSRF/CORS:** `SameSite=Lax` + Origin-Prüfung; CORS ist aus (same-origin über den Proxy).
- **Startreihenfolge:** Das Frontend startet erst, wenn das Backend laut Healthcheck bereit ist.
- **Konfiguration:** Werte über eine `.env` setzen (Vorlage: [`.env.example`](.env.example)).
  Die Datei wird **nicht** eingecheckt und nicht mit deployt.

Empfohlen zusätzlich **in Cloudflare**: „Always Use HTTPS", HSTS aktivieren, und die
Origin nur über den Tunnel erreichbar halten (kein offener Direktzugriff auf Port 8080/3000),
damit `CF-Connecting-IP` vertrauenswürdig bleibt.

> Läufst du die Prod-Images ausnahmsweise lokal über `http://localhost:8080`, setze
> `COOKIE_SECURE=false`, sonst sendet der Browser das Session-Cookie nicht.

## Sicherheit

- **Passwörter** werden mit **scrypt** (memory-hard, `node:crypto`) und pro-Nutzer-Salt
  gehasht; Verifikation in konstanter Zeit. Keine externen Krypto-Abhängigkeiten.
- **Sessions** liegen serverseitig in SQLite; das Cookie enthält nur ein 256-bit-Zufalls­
  token, in der DB steht ausschließlich dessen SHA-256-Hash. Cookie-Flags: `HttpOnly`,
  `SameSite=Lax`, `Secure` (bei HTTPS). Logout beendet die Session serverseitig sofort.
- **Datenisolation:** Jedes Projekt gehört einem Nutzer; Ebenen/Nodes/Kanten erben den
  Besitz. Jeder Zugriff wird geprüft — fremde IDs liefern `404`.
- **CSRF:** Bei zustandsändernden Requests wird der `Origin`-Header gegen den Host geprüft.
- **Brute-Force:** Login/Registrierung sind pro IP rate-limitiert; Login-Fehler sind
  generisch (keine Nutzer-Enumeration).
- **CORS** ist standardmäßig aus (Frontend & API sind same-origin über den Proxy); nur bei
  gesetztem `CORS_ORIGIN` wird ein Cross-Origin mit Credentials erlaubt.

## Konfiguration

| Variable | Default | Beschreibung |
|---|---|---|
| `PORT` | `3000` | Backend-Port |
| `DATA_DIR` | `./data` (`/data` im Container) | Ablageort der SQLite-DB |
| `DB_FILE` | `$DATA_DIR/labviz.db` | Expliziter DB-Pfad |
| `NODE_ENV` | `production` (im Image) | In Produktion sind Secure-Cookies automatisch aktiv. |
| `COOKIE_SECURE` | _auto_ | `true`/`false` erzwingt das Secure-Flag. Default: in Produktion `true`, lokal (http) automatisch aus. |
| `SESSION_TTL_DAYS` | `30` | Gültigkeitsdauer einer Session (mit Sliding-Renewal) |
| `ALLOW_REGISTRATION` | `true` | Auf `false` sperrt die Selbst-Registrierung |
| `CORS_ORIGIN` | _(leer)_ | Kommagetrennte Origin(s) für Cross-Origin-Zugriff mit Credentials |

## Projektstruktur

```
├── docker-compose.yml
├── backend/
│   ├── src/
│   │   ├── server.js         # Bootstrap
│   │   ├── app.js            # Express-App, Auth-Middleware, Fehler-Handling
│   │   ├── auth.js           # Passwort-Hashing (scrypt), Sessions, requireAuth, CSRF, Rate-Limit
│   │   ├── db.js             # SQLite-Schema (users, sessions, projects.user_id …)
│   │   ├── store.js          # CRUD, Import/Export, Row-Level-Autorisierung
│   │   ├── seed.js           # Beispielprojekt je Nutzer (bei Registrierung)
│   │   ├── validation.js     # Zod-Schemas (inkl. register/login)
│   │   ├── catalog.js        # Kategorien / Status / Edge-Arten
│   │   └── routes/           # auth, projects, views, nodes, edges, graph, meta
│   └── test/api.test.js      # API-Tests inkl. Auth & Isolation (node --test)
└── frontend/
    └── src/
        ├── store/graph.ts    # Zustand-Store (Canvas ⇄ API)
        ├── store/auth.ts     # Auth-Zustand (Login/Registrierung/Session)
        ├── components/auth    # AuthScreen (Login/Registrieren)
        ├── components/canvas # Nodes, Zonen, Edges, Canvas
        ├── components/panel  # Drawer, Formulare, Markdown, Custom Fields
        └── lib/catalog.ts    # Icons/Farben, Suche
```
