# Lab Visualizer — API for AI agents

REST API reference for automated clients (scripts, monitoring, AI agents).
Human-readable project info: [README.md](README.md).
**If docs and code disagree, the code in `backend/src/` wins.**

Lab Visualizer documents infrastructure as a graph: **nodes** (servers,
containers, services, zones) and **edges** (connections). The UI and this API
share the same database — every UI action is reproducible over the API.

## Protocol

Base URL `http://localhost:8080/api` (Docker) or `http://localhost:3000/api`
(backend direct). All paths below are relative to `/api`.

- **Format** JSON (`Content-Type: application/json`); success without a body is
  `204 No Content`.
- **Auth** required for every data endpoint, scoped to the signed-in user.
  Public: `/health`, `/meta/catalog`, `/meta/legal`, `/auth/*`.
- **CORS** off by default (same-origin through the proxy); opt in via `CORS_ORIGIN`.
- **Body limit** 2 MB per request; `POST /graph/import` accepts 20 MB.
- **IDs** `^[A-Za-z0-9_.:-]{1,64}$` — readable IDs like `nginx` or `db-primary`
  are recommended, because they make later updates scriptable.
- **Timestamps** ISO 8601 (`createdAt`, `updatedAt`).

### Authentication

Server-side sessions over an `HttpOnly` cookie (`sid`). Sign in once, keep the
cookie, send it with every request:

```bash
curl -c cookies.txt -X POST http://localhost:8080/api/auth/login \
  -H 'Content-Type: application/json' \
  -d '{ "email": "you@example.com", "password": "your-password" }'

curl -b cookies.txt http://localhost:8080/api/graph
```

State-changing requests from a browser need an `Origin` header matching the host
(CSRF protection); cookie-based CLI clients such as `curl` are unaffected.

### Errors

```json
{ "error": "Short message", "details": [{ "path": "field", "message": "…" }] }
```

| Status | Meaning |
|---|---|
| `400` | Validation / invalid reference |
| `401` | Not signed in (missing or expired session) |
| `403` | CSRF (wrong origin) **or** instance limit reached (`code: "limit_reached"`) |
| `404` | Not found **or owned by another user** |
| `409` | ID already exists |
| `413` | Request body too large |
| `429` | Too many login/registration attempts **or** write rate limit exceeded |
| `500` | Internal server error |

### Instance limits

No limit applies by default. A public instance may cap projects, levels and
nodes per account. The effective values are in `GET /auth/me` under `limits`
(`null` = unlimited). They are enforced on `POST /projects`, `/views`, `/nodes`
and `/graph/import` (imports fully checked before anything is written). Hitting
one returns `403` with `code: "limit_reached"` — surface it, do not retry.
Writes are additionally throttled per IP (`RATE_LIMIT_WRITES_PER_MIN`, default
600/min) → `429` with `Retry-After`.

---

## Data model

Hierarchy: **project → levels (tree) → nodes/edges**.

### Project

Completely separate workspaces. Each belongs to exactly one user.

```json
{ "id": "homelab", "name": "My Homelab", "color": "#38bdf8", "icon": "boxes",
  "packs": ["infrastructure", "network", "operations"], "sortOrder": 0 }
```

`packs` decides which categories, fields and edge kinds this project sees. On
create you may pass `template` instead — the packs then come from the template
and its starter content is built too. `template` is a create-only option; PATCH
ignores it. Deleting a project cascades to its levels, nodes and edges; the last
project cannot be deleted.

#### Domain packs

A **core pack** (application, database, group, user, dependency, data flow,
`url`, `owner`, `platform` …) is always active. Everything else comes from the
selected packs:

| id | Contents |
|---|---|
| `infrastructure` | Hypervisor, VM, container, physical devices · `os`, `cpu`, `ram`, `disk` |
| `network` | Router, proxy, VPN, DNS · protocols · `ip`, `hostname`, `vlan`, `mac` |
| `security` | Firewall, IDS, SSO, secrets, certificates · `expiresAt` |
| `operations` | Monitoring, backup, CI/CD, cron jobs · `sla` |
| `cloud` | Region, VPC, managed service, bucket, serverless · `region`, `accountId`, `cost` |
| `kubernetes` | Cluster, namespace, workload, service, volume · `namespace`, `image`, `replicas` |
| `software` | System, component, API, queue, actor · `repository`, `language` |
| `business` | Process, step, decision, role, department · `costCenter`, `frequency` |
| `homelab` | Media, game servers, smart home, IoT |

Turning a pack off **deletes nothing**: values for its fields stay on the node
and are still accepted — validation runs against all packs, not just the active
ones.

### View (level)

Levels split a project into a drill-down hierarchy (C4-style). Every node and
edge belongs to exactly one level.

```json
{ "id": "server-internal", "projectId": "homelab", "name": "Server internals",
  "parentId": null, "description": "", "color": "#38bdf8", "icon": "layers",
  "sortOrder": 0 }
```

| Field | Required | Default | Description |
|---|---|---|---|
| `id` | no (POST) | UUID | Stable ID |
| `projectId` | no | default project | Inherited from `parentId` when set |
| `name` | yes | — | Display name |
| `parentId` | no | `null` | Parent level; `null` = root |
| `description`, `color`, `icon`, `sortOrder` | no | — | UI metadata |

There is always at least one level (a root "Overview" is created automatically).
Nodes and edges without a `viewId` land in the first root level. Deleting a level
cascades to its sub-levels including their nodes and edges; the last level of a
project cannot be deleted.

### Node

```json
{
  "id": "nginx", "name": "nginx Reverse Proxy", "category": "reverse-proxy",
  "status": "active", "parentId": "host-zone", "viewId": "server-internal",
  "linkedViewId": null, "position": { "x": 120, "y": 80 },
  "width": null, "height": null, "icon": null, "color": null,
  "fields": { "ip": "192.168.2.104", "os": "Debian 12", "platform": "Proxmox VE" },
  "notes": "# Markdown\nFree-form documentation (GFM).",
  "customFields": { "Container ID": "118" },
  "createdAt": "2026-07-02T18:00:00.000Z", "updatedAt": "2026-07-02T18:00:00.000Z"
}
```

| Field | Required | Default | Description |
|---|---|---|---|
| `id` | no (POST) | UUID | Stable ID for script updates |
| `name` | yes | — | Display name (1–200 chars) |
| `category` | no | `generic` | Any string, see catalog |
| `status` | no | `unknown` | `active`\|`inactive`\|`planned`\|`maintenance`\|`error`\|`unknown` |
| `parentId` | no | `null` | Zone/group; use `category: "group"` for visual zones |
| `viewId` | no | first root level | Level the node belongs to |
| `linkedViewId` | no | `null` | Drill-down portal: linked detail level |
| `position` | no | `{x:0,y:0}` | Canvas position (see parent rule) |
| `width`, `height` | no | `null` | Zones only |
| `icon` | no | `null` | Own symbol; `null` = category icon. See [Images](#images) |
| `color` | no | `null` | Own color; `null` = category color |
| `fields` | no | `{}` | Typed fields; keys and types from the catalog |
| `notes` | no | `""` | Markdown, max 200 KB |
| `customFields` | no | `{}` | Free-form key/value, max 100 keys, values max 4000 chars |

**`fields` vs `customFields`** — `fields` holds the catalog-defined fields (label,
type, group, server-side validation). `customFields` is the escape hatch for
everything the catalog does not know; there the key *is* the label.

All values are **strings**, including `number` and `date` types. An empty string
means "not set" and is never rejected. Validation by type:

| Type | Rule |
|---|---|
| `number` | must parse as a number (`"16"`, not `"lots"`) |
| `date` | `YYYY-MM-DD` |
| `url` | needs a scheme (`https://…`) |
| `select` | one of `options` |
| `text` | max 4000 chars |

Unknown keys in `fields` are **accepted and stored**, not rejected — otherwise
importing a project whose field definitions this instance does not know would
fail.

> **Product neutrality:** categories describe building blocks, not vendors. A
> Proxmox, ESXi or Hyper-V host is `category: "hypervisor"` with
> `fields.platform: "Proxmox VE"` — not one category per product.

> Status is **manual / API-driven**. There is no ping or health check.

### Edge

```json
{
  "id": "e-nginx-app", "sourceId": "nginx", "targetId": "web-app",
  "viewId": "server-internal", "label": "HTTP :80", "kind": "http",
  "lineStyle": "solid", "animated": false, "notes": "",
  "routing": { "mode": "auto", "waypoints": [], "labelT": null },
  "customFields": {}
}
```

| Field | Required | Default |
|---|---|---|
| `sourceId`, `targetId` | yes | — |
| `viewId` | no | level of the source (**source and target must share a level**) |
| `label` | no | `""` |
| `kind` | no | `generic` |
| `lineStyle` | no | `solid` (`solid`\|`dashed`\|`dotted`) |
| `animated` | no | `false` |
| `notes`, `customFields` | no | as for nodes |
| `routing` | no | `{ mode: "auto", waypoints: [], labelT?: 0..1 }` |

`routing.mode` is `auto` or `manual`; `waypoints` are absolute canvas points (the
UI re-docks them orthogonally when nodes move); `labelT` places the label on the
line (0 = source, 1 = target, default 0.5). **Auto-layout resets `routing` on
every edge** — manual waypoints refer to old positions and would be worthless.

---

## Rules that matter for agents

1. **Parent positions** — children store `position` **relative to their parent**
   (React Flow convention). Absolute position = sum of the parent chain.
2. **Import order** — in `nodes`, every parent must come **before** its children;
   likewise `views` before their sub-levels, and `projects` first.
3. **Zones** — `category: "group"` plus `width`/`height`; assign children via
   `parentId`. Parent and child must be on the same level; without a `viewId` a
   child inherits its parent's level. Moving a node to another level detaches a
   parent left behind (its position becomes absolute).
4. **Deleting a node** removes its edges and re-parents its children to the
   grandparent, adjusting positions so nothing jumps on the canvas.
5. **Parent cycles** are rejected with `400`.
6. **Import modes** — `mode: "replace"` deletes **all** of the user's data and
   replaces it. `mode: "merge"` adds the payload additively with fresh IDs
   (references rewritten), leaving existing data untouched — this is how exported
   projects move between accounts.
7. **PATCH and PUT** are both partial updates. `fields` and `customFields` are
   **replaced wholesale**, not merged — send the complete object to change one
   entry.
8. **Search `GET /nodes?q=`** matches `name` and all **values** in `fields` and
   `customFields`. Keys do not match (`q=platform` finds nothing).
9. **Edges are intra-level.** This also holds for `PATCH /edges/:id`; an edge's
   `viewId` always follows its endpoints. Cross-level relationships are modeled
   with `node.linkedViewId`, not with edges. A level whose subtree covers *all*
   levels of the project cannot be deleted (`400`).

---

## Endpoints

### Auth

| Method | Path | Description |
|---|---|---|
| `POST` | `/auth/register` | `{email, password}` → `201`, seeds an example project, sets the cookie |
| `POST` | `/auth/login` | `{email, password}` → `200`, sets the cookie |
| `POST` | `/auth/logout` | → `204` |
| `GET` | `/auth/me` | Current user plus the instance `limits` |
| `POST` | `/auth/password` | `{currentPassword, newPassword}` → `204`, ends other sessions |
| `DELETE` | `/auth/account` | `{password}` → `204`, deletes all data |

### Projects and levels

| Method | Path | Description |
|---|---|---|
| `GET`/`POST` | `/projects` | List / create (→ `201`, with an empty root level) |
| `GET`/`PATCH`/`PUT`/`DELETE` | `/projects/:id` | Read / partial update / cascade delete |
| `GET` | `/projects/:id/catalog` | Catalog of **this project** (its packs only) |
| `GET`/`POST` | `/views?projectId=` | Levels of a project (flat, hierarchy via `parentId`) / create |
| `GET`/`PATCH`/`PUT`/`DELETE` | `/views/:id` | Read / partial update / cascade delete |

Creating a project from a template:

```http
POST /api/projects
{ "name": "Prod cluster", "template": "kubernetes" }
```

Builds the template's levels, nodes and edges and adopts its packs (an explicit
`packs` wins). Project and content are created in **one transaction**, so hitting
an instance limit mid-build leaves no half project behind.

### Nodes and edges

| Method | Path | Description |
|---|---|---|
| `GET` | `/nodes?q=&category=&status=&viewId=&projectId=` | List / search / filter (`projectId` searches all levels) |
| `POST` | `/nodes` | Create → `201` |
| `GET`/`PATCH`/`PUT`/`DELETE` | `/nodes/:id` | Read / partial update / delete (`204`) |
| `POST` | `/nodes/positions` | Bulk positions → `{ "updated": 2 }` |
| `GET` | `/edges?nodeId=&viewId=&projectId=` | Same filters as `/nodes` |
| `POST` | `/edges` | Create → `201` |
| `GET`/`PATCH`/`PUT`/`DELETE` | `/edges/:id` | Read / partial update / delete (`204`) |

```json
{ "positions": [ { "id": "nginx", "x": 100, "y": 200 },
                 { "id": "host-zone", "x": 0, "y": 0, "width": 600, "height": 400 } ] }
```

### Graph

| Method | Path | Description |
|---|---|---|
| `GET` | `/graph?viewId=` | Graph of **one level** (default: root) → `{ viewId, nodes, edges }` |
| `GET` | `/graph/export?projectId=` | Backup JSON (everything, or a single project to share) |
| `POST` | `/graph/import` | Replace or merge |
| `POST` | `/graph/layout` | Auto-align one level |

Export shape: `{ "version": 3, "exportedAt": "…", "projects": [], "views": [],
"nodes": [], "edges": [], "assets": [] }`. Exporting one project carries only the
images that project uses; a full backup carries the whole library.

```json
{ "mode": "replace", "projects": [], "views": [], "nodes": [], "edges": [], "assets": [] }
```

Import responds `{ "projects": 2, "views": 3, "nodes": 42, "edges": 17 }`. Missing
`projects`/`views` means everything lands in the default project and root level.

Layout body `{ "viewId": "server-internal", "maxCols": 5 }` (both optional)
arranges that level deterministically — layers along the edges with barycenter
sorting, zones with internal edges flowing left to right — and answers
`{ "updated": 42 }`.

### Catalog

```
GET /meta/catalog    → { categories, statuses, edgeKinds, lineStyles, fields, packs }
GET /meta/packs      → { packs: [ { id: "network", label: "Network", … } ] }
GET /meta/templates  → { templates: [ { id: "kubernetes", packs: [...], … } ] }
```

`/meta/catalog` returns the **complete** catalog across all packs — the reference
when no specific project is in view. For a project use
`GET /projects/:id/catalog`; only its categories and fields appear in the UI.

A `fields` entry looks like:

```json
{ "key": "ram", "label": "Memory", "type": "number", "group": "System", "unit": "GB" }
```

Optional keys: `mono`, `showOnNode` (value appears on the canvas), `wide`,
`placeholder`, `options` (for `select`), `unit` (for `number`). Every `select`
field automatically becomes a UI filter alongside status and category — filtering
happens client-side; the server filters via `GET /nodes?category=&status=`.

Categories and edge kinds are **reference values** — any string is allowed, and
unknown categories render with a fallback icon. Statuses are a **closed enum**;
an unknown value is rejected with `400`.

### Share links (read-only)

One link makes **exactly one project** readable without an account.

| Method | Path | Description |
|---|---|---|
| `GET`/`POST` | `/projects/:id/shares` | List (without tokens) / create `{ label?, expiresAt? }` → `201` **with** `token` |
| `DELETE` | `/projects/:id/shares/:shareId` | Revoke |
| `GET` | `/share/:token` | **No auth:** project, levels, nodes, edges, catalog |
| `GET` | `/share/:token/assets/:id` | **No auth:** an image used by this project |

- The plaintext token is returned **exactly once**, in the `POST` response; only
  its sha256 hash is stored. A lost link can be replaced, not recovered.
- `GET /share/:token` returns **all levels at once**, so the viewer can navigate
  the drill-down hierarchy without further requests.
- The response contains nothing about the owner and no other projects. Images are
  only reachable if this project uses them.
- Unknown, expired or revoked all return **404**, not 403 — the response must not
  reveal whether a token was ever valid.
- Nothing can be changed through this path: the router only offers GET. Deleting
  a project removes its links.

### Images

Uploaded images serve as a node's own icon and as images in notes.

| Method | Path | Description |
|---|---|---|
| `GET`/`POST` | `/assets` | Library metadata / upload `{ name, dataUrl }` → `201` |
| `GET`/`DELETE` | `/assets/:id` | Serve the bytes / delete → `{ clearedNodes }` |

- **The type comes from the magic bytes**, not the data URL's declared MIME type.
  Allowed: PNG, JPEG, WebP, SVG. Anything else → `400`.
- Limits: `MAX_ASSET_BYTES` (default 1 MB) → `413`; `MAX_ASSETS_PER_USER` → `403`
  with `code: "limit_reached"`.
- An image is referenced as `node.icon` in the form `asset:<id>` and in
  `node.notes` as Markdown with the URL `/api/assets/<id>`. Both forms are
  collected on project export and rewritten to the new IDs on merge import.
- Deleting an image resets `icon` on every node using it — no dead references.
- Images are immutable (create, read, delete) and served with
  `Cache-Control: immutable`, an `ETag`, `nosniff` and their own CSP so a
  directly opened SVG cannot execute anything.

### Health and legal texts

```
GET /health      → { "status": "ok", "version": "1.0.0", "time": "…" }
GET /meta/legal  → { "documents": [ { "id": "impressum", "title": "Legal notice", "markdown": "…" } ] }
```

`version` is the **backend** version from `backend/VERSION`; the frontend has its
own in `frontend/VERSION`. Legal texts are per instance under `$DATA_DIR/legal/`
and readable without signing in; an empty array means this instance publishes
none (the normal case when self-hosting).

---

## Common workflows

```http
### Create an infrastructure node
POST /api/nodes
{ "id": "postgres", "name": "PostgreSQL", "category": "database", "status": "active",
  "fields": { "ip": "192.168.2.50", "hostname": "postgres.lan", "version": "16", "ram": "8" },
  "customFields": { "Port": "5432" } }

### Update status from monitoring
PATCH /api/nodes/postgres
{ "status": "error" }

### Document a connection
POST /api/edges
{ "id": "e-app-db", "sourceId": "web-app", "targetId": "postgres",
  "kind": "tcp", "label": "PostgreSQL :5432", "lineStyle": "dashed" }

### Zone with children (zone first!)
POST /api/nodes
{ "id": "homelab", "name": "Homelab", "category": "group",
  "position": {"x":0,"y":0}, "width": 800, "height": 600 }
POST /api/nodes
{ "id": "nginx", "name": "nginx", "category": "reverse-proxy",
  "parentId": "homelab", "position": {"x": 40, "y": 60} }

### Wipe everything
POST /api/graph/import
{ "mode": "replace", "nodes": [], "edges": [] }

### Tidy up after a bulk import
POST /api/graph/layout
{ "maxCols": 5 }
```

Backup and restore (sign in first, see [Authentication](#authentication)):

```bash
curl -s -b cookies.txt http://localhost:8080/api/graph/export -o backup.json

# Restore — replaces your data! The export has no `mode`, so add it.
curl -b cookies.txt -X POST http://localhost:8080/api/graph/import \
  -H 'Content-Type: application/json' -d @backup.json
```

## Which endpoint?

| Goal | Endpoint |
|---|---|
| Change a single field | `PATCH /nodes/:id` or `PATCH /edges/:id` |
| New device or service | `POST /nodes` |
| Document a connection | `POST /edges` |
| Read the whole state | `GET /graph` |
| Migration / sync | `GET /graph/export` + `POST /graph/import` |
| Positions only | `POST /nodes/positions` |
| Auto-align a level | `POST /graph/layout` |
| All categories, statuses, edge kinds, fields | `GET /meta/catalog` |
| What one project sees | `GET /projects/:id/catalog` |
| Available packs / templates | `GET /meta/packs` · `GET /meta/templates` |
| Is the API up? | `GET /health` |

## Catalog reference

Full list: `GET /meta/catalog`. Which of these are visible depends on
`project.packs`.

**Node categories** — *core (always on):* `generic`, `group`, `web-app`,
`native-service`, `database`, `storage`, `client`, `internet`, `cloud-service`,
`domain`, `email`, `notification` · `infrastructure`: `hypervisor`, `vm`,
`system-container`, `physical-device`, `vps`, `docker-stack`, `docker-container`
· `network`: `router`, `wifi-ap`, `reverse-proxy`, `tunnel`, `vpn`, `dns` ·
`security`: `firewall`, `ids`, `auth`, `secrets`, `certificate` · `operations`:
`monitoring`, `backup`, `file-share`, `ci-runner`, `git-repo`, `automation` ·
`cloud`: `cloud-region`, `cloud-network`, `managed-service`, `object-storage`,
`serverless`, `load-balancer` · `kubernetes`: `k8s-cluster`, `k8s-namespace`,
`k8s-workload`, `k8s-service`, `k8s-ingress`, `k8s-volume` · `software`:
`software-system`, `component`, `api-endpoint`, `message-queue`,
`external-system`, `actor`, `ai-service` · `business`: `process`,
`process-step`, `decision`, `document`, `role`, `department`, `business-system` ·
`homelab`: `media`, `game-server`, `smart-home`, `iot-device`

**Edge kinds** — *core:* `generic`, `dependency`, `data-flow`, `control`, `api` ·
`network`: `http`, `https`, `tcp`, `udp`, `dns`, `tunnel`, `vpn`, `mail` ·
`infrastructure`: `ssh` · `operations`: `monitoring`, `backup`, `ci` ·
`software`: `event` · `business`: `process-flow`, `responsibility`

**Node fields** — *core:* `url`, `owner`, `environment`, `criticality`,
`platform`, `version`, `location`, `reviewedAt` · `infrastructure`: `os`, `cpu`,
`ram`, `disk` · `network`: `ip`, `hostname`, `vlan`, `mac` · `security`:
`expiresAt` · `operations`: `sla` · `cloud`: `region`, `accountId`,
`resourceId`, `cost` · `kubernetes`: `namespace`, `image`, `replicas` ·
`software`: `repository`, `language` · `business`: `costCenter`, `frequency`

**Templates** — `empty` · `homelab` · `network` · `cloud` · `kubernetes` ·
`software` · `business`

## Source map

| File | Contents |
|---|---|
| `backend/src/store.js` | CRUD, import, parent logic, row-level authorization |
| `backend/src/auth.js` | Password hashing (scrypt), sessions, `requireAuth`, CSRF, rate limit |
| `backend/src/validation.js` | Zod schemas including `register`/`login` |
| `backend/src/limits.js` | Optional instance limits and their enforcement |
| `backend/src/layout.js` | Auto-layout algorithm |
| `backend/src/catalog/` | Core plus domain packs (categories, edge kinds, fields) |
| `backend/src/templates/` | Starter templates for new projects |
| `backend/src/assets.js` | Image type detection and serving headers |
| `backend/src/share.js` | Share tokens, hashing and expiry |
| `backend/src/routes/*.js` | Route definitions |
| `frontend/src/api/types.ts` | TypeScript types |
| `frontend/src/lib/catalog.ts` | Client-side catalog access: fields, badges, filters |
