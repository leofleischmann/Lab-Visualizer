# Changelog (Backend)

Alle nennenswerten Änderungen am Lab-Visualizer-Backend (API, Store, Auth).

Format angelehnt an [Keep a Changelog](https://keepachangelog.com/).
Versionierung nach [SemVer](https://semver.org/).

Single source of truth: `backend/VERSION` (muss zu `backend/package.json` passen).
Der Abschnitt zur aktuellen Version wird beim Backend-Release als
GitHub-Release-Notes übernommen (`.github/workflows/release.yml`).

## [1.0.0] - 2026-09-07

Erster versionierter Backend-Release.

### Added
- **Accounts und Mehrbenutzer** mit Registrierung, Login, Passwort ändern und
  Konto löschen. Row-Level-Isolation über `userId`.
- **Projekte, Ebenen, Nodes und Edges** inkl. Domain-Packs, Katalog und
  Startvorlagen.
- **Read-only-Freigabelinks**, Asset-Uploads und Graph-Export/Import
  (Replace und Merge).
- **REST-API** mit Session-Auth, CSRF-Schutz und optionalen Instanz-Limits.
- Auto-Align (`POST /graph/layout`) und Seed-Beispielprojekt bei Registrierung.
- Docker-Image `lab-visualizer-backend` auf GHCR bei Versions-Bump.
- Öffentlicher Health-Check mit Backend-Version: `GET /api/health`.
