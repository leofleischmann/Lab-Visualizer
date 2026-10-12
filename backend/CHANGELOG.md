# Changelog (backend)

Notable changes to the Lab Visualizer backend (API, store, auth).
Format follows [Keep a Changelog](https://keepachangelog.com/), versioning
follows [SemVer](https://semver.org/).

Single source of truth: `backend/VERSION` (must match `backend/package.json`).
The section for the current version becomes the GitHub release notes
(`.github/workflows/release.yml`).

## [Unreleased]

### Added
- **API keys** (`lvk_…`, `Authorization: Bearer`) with `read`/`write` scope and
  optional expiry, managed via `/api/api-keys` (session only). Only the SHA-256
  hash is stored; keys cannot manage the account or other keys.
- **MCP server** at `POST /api/mcp` (Streamable HTTP, stateless, protocol
  2024-11-05 to 2025-11-25) with 19 tools for projects, levels, nodes, edges,
  catalog and auto-layout. API key only; the scope decides the tool list.
- **OpenAPI 3.1** at `GET /api/openapi.json`, request schemas generated from
  the Zod schemas. Tests ensure every route is documented and response shapes
  match.
- `GET /api/auth/me` reports how a request is authenticated (`auth`).
- `DEBUG_LOG=true` prints `[Debug …]` lines.

### Fixed
- Writes from an origin listed in `CORS_ORIGIN` were rejected by the CSRF guard.

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
