# Changelog (backend)

Notable changes to the Lab Visualizer backend (API, store, auth).
Format follows [Keep a Changelog](https://keepachangelog.com/), versioning
follows [SemVer](https://semver.org/).

Single source of truth: `backend/VERSION` (must match `backend/package.json`).
The section for the current version becomes the GitHub release notes
(`.github/workflows/release.yml`).

## [1.0.0] - 2026-09-07

First versioned backend release.

### Added
- **Accounts and multi-user** with registration, login, password change and
  account deletion. Row-level isolation via `userId`.
- **Projects, levels, nodes and edges** including domain packs, catalog and
  starter templates.
- **Read-only share links**, asset uploads and graph export/import
  (replace and merge).
- **REST API** with session auth, CSRF protection and optional instance limits.
- Auto-align (`POST /graph/layout`) and a seeded example project on registration.
- Docker image `lab-visualizer-backend` on GHCR on every version bump.
- Public health check including the backend version: `GET /api/health`.
