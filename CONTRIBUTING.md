# Contributing

Issues and pull requests are welcome — bug fix, new node category or docs.

## Development setup

Requires **Node ≥ 20**. Backend and frontend are separate npm projects:

```bash
cd backend && npm install && npm run dev     # API on :3000
```

```bash
cd frontend && npm install && npm run dev    # Vite on :5173, proxies /api
```

The SQLite file lands in `backend/data/labviz.db` here (`docker compose` puts it
in `./data`). Delete it to reset; it is recreated on the next start.

## Before a pull request

Exactly what CI runs:

```bash
cd backend && npm test
```

```bash
cd frontend && npm test && npm run build
```

`npm run build` runs `tsc --noEmit`, so the typecheck is covered.

## What I look for in review

- **Tests for new behavior.** The API tests in `backend/test/api.test.js` are the
  project's safety net, especially around ownership, level invariants and limits.
  A test that fails without your fix is worth more than three that always pass.
- **Data isolation.** Every access goes through `userId`. A new query must check
  ownership — other people's IDs return `404`, not `403`.
- **Comments explain the why**, not the what. The existing code is commented in
  German; please keep it that way so the codebase stays consistent. Everything
  user-facing (UI strings, docs) is English.
- **No new dependencies without a reason.** The backend gets by with four
  packages and hashes passwords with `node:crypto`. That is deliberate.
- **Offline-capable.** No external CDNs, fonts or trackers — the app must run in
  an air-gapped network.

## Architecture in three sentences

The backend is an Express app over SQLite (`better-sqlite3`, synchronous). All
business logic lives in `backend/src/store.js`; the files under `routes/` only
validate with Zod and pass through. The frontend keeps its state in a Zustand
store (`frontend/src/store/graph.ts`) and talks to the API exclusively through
`frontend/src/api/client.ts`.

Full API reference: [AGENTS.md](AGENTS.md).

## Releasing (version bump)

Backend and frontend are versioned independently:

| Component | Version | Changelog | Image / git tag |
|---|---|---|---|
| Backend | `backend/VERSION` (+ `package.json`) | `backend/CHANGELOG.md` | `lab-visualizer-backend` / `backend-vX.Y.Z` |
| Frontend | `frontend/VERSION` (+ `package.json`) | `frontend/CHANGELOG.md` | `lab-visualizer-frontend` / `frontend-vX.Y.Z` |

To bump a component:

1. Update `…/VERSION` and the matching `package.json`
2. Add a `## [X.Y.Z] - YYYY-MM-DD` section at the **top** of its `CHANGELOG.md`
3. Update the compose fallback (`BACKEND_VERSION` / `FRONTEND_VERSION`) and the
   README badge
4. Merge to `main` via pull request

**Only a changed `VERSION` file on `main` publishes an image and deploys.** A
push to `dev` or an ordinary commit on `main` runs CI and nothing else. Manual
dispatch of the release workflow is possible from `main` and can target backend,
frontend or both; a version that already has its git tag is skipped.

## License

By submitting a pull request you agree that your contribution is published under
the project's [MIT license](LICENSE).
