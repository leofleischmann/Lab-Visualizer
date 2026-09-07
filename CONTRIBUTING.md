# Mitmachen

Danke fürs Interesse. Issues und Pull Requests sind willkommen — egal ob Bugfix,
neue Node-Kategorie oder Dokumentation.

## Entwicklungsumgebung

Voraussetzung ist **Node ≥ 20**. Backend und Frontend sind getrennte npm-Projekte:

```bash
# Terminal 1 — API auf Port 3000
cd backend && npm install && npm run dev
```

```bash
# Terminal 2 — Vite-Dev-Server auf Port 5173 (proxyt /api ans Backend)
cd frontend && npm install && npm run dev
```

Die SQLite-Datei landet bei dieser Variante in `backend/data/labviz.db` (der
Pfad ist relativ zum Arbeitsverzeichnis; `docker compose` legt sie dagegen in
`./data`). Zum Zurücksetzen einfach löschen — beim nächsten Start wird sie neu
angelegt und jeder neu registrierte Account bekommt wieder das Beispielprojekt.

## Vor einem Pull Request

Genau das prüft auch die CI:

```bash
cd backend && npm test
```

```bash
cd frontend && npm test && npm run build
```

`npm run build` im Frontend führt `tsc --noEmit` mit aus, deckt also den
Typecheck gleich mit ab.

## Version erhöhen (Release)

Backend und Frontend haben **eigene** SemVer-Stände:

| Komponente | Version | Changelog | Image / Git-Tag |
|---|---|---|---|
| Backend | `backend/VERSION` (+ `backend/package.json`) | `backend/CHANGELOG.md` | `lab-visualizer-backend` / `backend-vX.Y.Z` |
| Frontend | `frontend/VERSION` (+ `frontend/package.json`) | `frontend/CHANGELOG.md` | `lab-visualizer-frontend` / `frontend-vX.Y.Z` |

Beim Bump einer Komponente:

1. `…/VERSION` und passende `package.json` anpassen
2. neuen Abschnitt `## [X.Y.Z] - YYYY-MM-DD` **oben** in deren `CHANGELOG.md`
3. Compose-Fallback (`BACKEND_VERSION` bzw. `FRONTEND_VERSION`) und README-Badge anpassen
4. per PR nach `main` mergen

Nur die geänderte `VERSION`-Datei triggert den Release-Workflow für genau
dieses Image. Manual Dispatch erlaubt Backend, Frontend oder beides.

## Worauf ich beim Review achte

- **Tests für neues Verhalten.** Die API-Tests in `backend/test/api.test.js` sind
  die Sicherheitsleine des Projekts — besonders bei allem, was Besitzverhältnisse,
  Ebenen-Invarianten oder Limits berührt. Ein Test, der ohne deinen Fix fehlschlägt,
  ist mehr wert als drei, die immer grün sind.
- **Datenisolation.** Jeder Zugriff läuft über die `userId`. Kommt eine neue Query
  dazu, muss sie den Besitz mitprüfen — fremde IDs liefern `404`, nicht `403`.
- **Kommentare erklären das Warum**, nicht das Was. Der Bestand ist auf Deutsch
  kommentiert; halte dich bitte daran, damit die Codebasis einheitlich bleibt.
- **Keine neuen Abhängigkeiten ohne Grund.** Das Backend kommt mit vier Paketen aus
  und hasht Passwörter mit `node:crypto`. Das ist Absicht.
- **Offline-Fähigkeit.** Keine externen CDNs, Fonts oder Tracker — die App muss in
  einem abgeschotteten Netz laufen.

## Architektur in drei Sätzen

Das Backend ist eine Express-App über SQLite (`better-sqlite3`, synchron). Die
gesamte Geschäftslogik liegt in `backend/src/store.js`; die Dateien unter
`routes/` validieren nur mit Zod und reichen durch. Das Frontend hält seinen
Zustand in einem Zustand-Store (`frontend/src/store/graph.ts`) und spricht
ausschließlich über `frontend/src/api/client.ts` mit der API.

Eine vollständige API-Referenz steht in [AGENTS.md](AGENTS.md).

## Lizenz

Mit dem Einreichen eines Pull Requests stimmst du zu, dass dein Beitrag unter der
[MIT-Lizenz](LICENSE) des Projekts veröffentlicht wird.
