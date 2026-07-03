# 🕸️ Lab Visualizer

Ein selbst gehostetes **Network Infrastructure Documentation Tool**: Homelab-Infrastruktur
visuell pflegen und dokumentieren — mit interaktiver Canvas (React Flow), Deep-Dive-Panel
(Markdown-Notizen + Custom Fields) und einer sauberen REST-API für Automatisierung.

![Stack](https://img.shields.io/badge/Stack-React%20%2B%20Express%20%2B%20SQLite-38bdf8)

## Features

- **Projekte** — komplett getrennte Arbeitsbereiche (z. B. „Homelab“, „Arbeit“). Jedes Projekt
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

| Methode | Pfad | Beschreibung |
|---|---|---|
| `GET` | `/api/health` | Healthcheck |
| `GET` | `/api/meta/catalog` | Kategorien, Status, Verbindungsarten, Linienstile |
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
# Node per Skript anlegen (mit sprechender ID für spätere Updates)
curl -X POST http://localhost:8080/api/nodes \
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
curl -X PATCH http://localhost:8080/api/nodes/nginx \
  -H 'Content-Type: application/json' \
  -d '{ "status": "error" }'

# Verbindung anlegen
curl -X POST http://localhost:8080/api/edges \
  -H 'Content-Type: application/json' \
  -d '{ "sourceId": "cloudflared", "targetId": "nginx", "kind": "http", "label": "HTTP :80" }'

# Backup per API
curl -s http://localhost:8080/api/graph/export > backup.json
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

## Konfiguration

| Variable | Default | Beschreibung |
|---|---|---|
| `PORT` | `3000` | Backend-Port |
| `DATA_DIR` | `./data` (`/data` im Container) | Ablageort der SQLite-DB |
| `DB_FILE` | `$DATA_DIR/labviz.db` | Expliziter DB-Pfad |

## Projektstruktur

```
├── docker-compose.yml
├── backend/
│   ├── src/
│   │   ├── server.js         # Bootstrap
│   │   ├── app.js            # Express-App, Fehler-Handling
│   │   ├── db.js             # SQLite-Schema
│   │   ├── store.js          # CRUD, Import/Export, Parent-Logik
│   │   ├── validation.js     # Zod-Schemas
│   │   └── catalog.js        # Kategorien / Status / Edge-Arten
│   └── test/api.test.js      # API-Tests (node --test)
└── frontend/
    └── src/
        ├── store/graph.ts    # Zustand-Store (Canvas ⇄ API)
        ├── components/canvas # Nodes, Zonen, Edges, Canvas
        ├── components/panel  # Drawer, Formulare, Markdown, Custom Fields
        └── lib/catalog.ts    # Icons/Farben, Suche
```
