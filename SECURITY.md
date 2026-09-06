# Sicherheit

Lab Visualizer speichert Infrastruktur-Dokumentation — IP-Adressen, Hostnames,
Netzwerktopologien und freie Notizen. Sicherheitslücken wiegen hier also schwerer
als bei einem gewöhnlichen CRUD-Tool. Meldungen sind sehr willkommen.

## Schwachstelle melden

**Bitte kein öffentliches Issue eröffnen.** Nutze stattdessen einen dieser Wege:

1. **GitHub Security Advisory** (bevorzugt) — im Reiter *Security* des Repos auf
   [*Report a vulnerability*](https://github.com/leofleischmann/Lab-Visualizer/security/advisories/new).
   Die Meldung ist nur für Maintainer sichtbar.
2. Alternativ eine private Nachricht an den Maintainer über GitHub.

Hilfreich sind: betroffene Version bzw. Commit, eine Beschreibung des Angriffs­
szenarios, und — falls vorhanden — Schritte zum Nachstellen.

Ich melde mich in der Regel innerhalb von **7 Tagen** zurück. Da dies ein
Freizeitprojekt ist, kann es gelegentlich länger dauern; eine Erinnerung ist dann
völlig in Ordnung.

## Was in den Geltungsbereich fällt

- Umgehung der Authentifizierung oder der Session-Behandlung
- Zugriff auf Daten anderer Konten (die Datenisolation ist eine Kernzusage)
- Injection (SQL, XSS über Node-Felder, Markdown-Notizen oder Custom Fields)
- CSRF, Session-Fixation, Rechteausweitung
- Umgehung der serverseitigen Instanz-Limits

## Was nicht in den Geltungsbereich fällt

- Fehlende Rate-Limits auf lesenden Endpunkten (bewusste Entscheidung)
- Angriffe, die bereits Zugriff auf den Host oder die SQLite-Datei voraussetzen
- Ergebnisse automatischer Scanner ohne nachvollziehbares Angriffsszenario
- Schwächen in Instanzen, die entgegen der README ohne HTTPS betrieben werden

## Betrieb absichern

Wer eine eigene Instanz betreibt, sollte die README-Abschnitte
[Sicherheit](README.md#sicherheit) und [Instanz-Limits](README.md#instanz-limits)
gelesen haben. Die wichtigsten Punkte:

- **Immer über HTTPS ausliefern** und `COOKIE_SECURE=true` setzen.
- `ALLOW_REGISTRATION=false`, wenn die Instanz nur dir gehört.
- Für öffentliche Instanzen Obergrenzen setzen (`MAX_PROJECTS_PER_USER`,
  `MAX_VIEWS_PER_PROJECT`, `MAX_NODES_PER_PROJECT`).
- Die SQLite-Datei unter `data/` regelmäßig sichern — sie enthält alle Konten.
