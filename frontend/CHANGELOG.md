# Changelog (Frontend)

Alle nennenswerten Änderungen am Lab-Visualizer-Frontend (UI, Canvas, Panel).

Format angelehnt an [Keep a Changelog](https://keepachangelog.com/).
Versionierung nach [SemVer](https://semver.org/).

Single source of truth: `frontend/VERSION` (muss zu `frontend/package.json` passen).
Der Abschnitt zur aktuellen Version wird beim Frontend-Release als
GitHub-Release-Notes übernommen (`.github/workflows/release.yml`).

## [1.0.0] - 2026-09-07

Erster versionierter Frontend-Release.

### Added
- **Visueller Editor** (React Flow): Zonen, Auto-Align, manuelles Kanten-Routing,
  Labels auf der Linie, Fokus-Modus und Undo/Redo.
- **Ebenen-UI** mit Breadcrumb/ViewBar und Drill-down per Doppelklick.
- **Projekte** inkl. Vorlagenwahl, Domain-Pack-Einstellungen und globaler Suche.
- **Deep-Dive-Panel** mit kataloggetriebenen Feldern, Custom Fields,
  Markdown-Notizen und eigenen Bildern als Node-Icons.
- **Auth-UI**, Kontoverwaltung und Leseansicht für Freigabelinks.
- Diagramm-Export (PNG/SVG) und Feldfilter (Status, Kategorie, Select-Felder).
- Docker-Image `lab-visualizer-frontend` auf GHCR bei Versions-Bump.
