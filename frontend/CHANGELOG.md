# Changelog (frontend)

Notable changes to the Lab Visualizer frontend (UI, canvas, panel).
Format follows [Keep a Changelog](https://keepachangelog.com/), versioning
follows [SemVer](https://semver.org/).

Single source of truth: `frontend/VERSION` (must match `frontend/package.json`).
The section for the current version becomes the GitHub release notes
(`.github/workflows/release.yml`).

## [1.0.0] - 2026-09-07

First versioned frontend release.

### Added
- **Visual editor** (React Flow): zones, auto-align, manual edge routing,
  labels on the line, focus mode and undo/redo.
- **Level UI** with breadcrumb/view bar and drill-down on double-click.
- **Projects** with template picker, domain-pack settings and global search.
- **Deep-dive panel** with catalog-driven fields, custom fields, Markdown notes
  and custom images as node icons.
- **Auth UI**, account management and the read-only view for share links.
- Diagram export (PNG/SVG) and field filters (status, category, select fields).
- Docker image `lab-visualizer-frontend` on GHCR on every version bump.
