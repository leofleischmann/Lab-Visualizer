# Changelog

Alle nennenswerten Änderungen an Lab Visualizer.

Format angelehnt an [Keep a Changelog](https://keepachangelog.com/).
Versionierung nach [SemVer](https://semver.org/).

Der Abschnitt zur aktuellen Version in `/VERSION` wird beim Release
automatisch als GitHub-Release-Notes übernommen
(siehe `.github/workflows/release.yml`).

## [1.0.0] - 2026-09-07

Erster versionierter Release. Homelab-, Cloud- und Software-Infrastruktur
als Graph dokumentieren: Accounts, Projekte mit Vorlagen, Domain-Packs,
Ebenen mit Drill-down, visueller Editor und REST-API.

### Added
- **Accounts und Mehrbenutzer** mit Registrierung, Login, Passwort ändern und
  Konto löschen. Jeder Nutzer sieht nur die eigenen Projekte.
- **Projekte mit Startvorlagen** (Homelab, Netzwerk, Cloud, Kubernetes,
  Software, Business) und **Domain-Packs** für passende Kategorien, Felder und
  Verbindungsarten.
- **Ebenen (Views)** mit Drill-down: Nodes verlinken in Detailebenen,
  Navigation per Breadcrumb.
- **Visueller Editor** (React Flow): Zonen, Auto-Align, manuelles Kanten-Routing,
  Labels auf der Linie, Fokus-Modus und Undo/Redo.
- **Deep-Dive-Panel** mit kataloggetriebenen Feldern, Custom Fields und
  Markdown-Notizen (inkl. eigener Bilder als Node-Icons).
- **Read-only-Freigabelinks** für ein Projekt ohne Konto beim Empfänger.
- **Export/Import** (Replace und Merge) inkl. geteilter Projekte zwischen Konten.
- **REST-API** mit Session-Auth; Doku für Agenten in `AGENTS.md`.
- **Docker-Images** auf GHCR bei Versions-Bump (`lab-visualizer-backend` /
  `lab-visualizer-frontend`), getaggt mit SemVer und `latest`.
- Öffentlicher Health-Check mit App-Version: `GET /api/health`.
