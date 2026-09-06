# Datenschutzerklärung

<!--
VORLAGE — nicht ungeprüft übernehmen.

Muster für Betreiber einer ÖFFENTLICHEN Instanz. Alles in [eckigen Klammern]
ausfüllen und das Ergebnis als `data/legal/datenschutz.md` ablegen.

Die technischen Aussagen unten beschreiben den Stand der Software (Konten,
Sessions, Rate-Limiting, keine Tracker). Passe sie an, sobald du deine Instanz
veränderst — etwa durch zusätzliche Analyse-Werkzeuge oder einen anderen
Reverse-Proxy.

Formatierung: Die Texte werden als Markdown gerendert. Für Adressen zwei
Leerzeichen ans Zeilenende setzen, sonst laufen die Zeilen zu einem Absatz
zusammen.

Dies ist keine Rechtsberatung.
-->

## 1. Verantwortlicher

Verantwortlich für die Datenverarbeitung auf dieser Instanz ist:

[Vor- und Nachname bzw. Firma]  
[Straße und Hausnummer]  
[PLZ und Ort]  
[Land]  
E-Mail: [E-Mail-Adresse]

Eine Datenschutzbeauftragte oder ein Datenschutzbeauftragter ist nicht bestellt,
da die Voraussetzungen des Art. 37 DSGVO bzw. § 38 BDSG nicht vorliegen.

## 2. Welche Daten verarbeitet werden

### a) Kontodaten

Zur Registrierung werden **E-Mail-Adresse** und **Passwort** benötigt. Das
Passwort wird ausschließlich als kryptografischer Hash (scrypt mit
zufälligem Salt) gespeichert und ist für uns nicht im Klartext einsehbar.
Zusätzlich speichern wir den Zeitpunkt der Erstellung und der letzten Änderung
des Kontos. Weitere Angaben wie Name, Anschrift oder Telefonnummer werden nicht
erhoben.

*Rechtsgrundlage:* Art. 6 Abs. 1 lit. b DSGVO (Erfüllung des Nutzungsverhältnisses).

### b) Sitzungsverwaltung (Cookie)

Nach der Anmeldung wird ein Cookie mit dem Namen `sid` gesetzt. Es enthält
ausschließlich einen zufällig erzeugten Sitzungsschlüssel — keine
personenbezogenen Inhalte und keine Kennung zur Wiedererkennung über andere
Websites hinweg. Auf dem Server wird lediglich der SHA-256-Hash dieses
Schlüssels zusammen mit Erstellungs- und Ablaufzeitpunkt gespeichert. Das Cookie
ist `HttpOnly`, `SameSite=Lax` und wird nur über HTTPS übertragen. Die Sitzung
läuft nach [30] Tagen ab und verlängert sich bei aktiver Nutzung.

Dieses Cookie ist für den Betrieb des Dienstes unbedingt erforderlich; eine
Einwilligung ist dafür nach § 25 Abs. 2 Nr. 2 TDDDG nicht nötig. Weitere Cookies
setzen wir nicht.

*Rechtsgrundlage:* Art. 6 Abs. 1 lit. b DSGVO.

### c) Von dir eingestellte Inhalte

Der Dienst dient der Dokumentation von IT-Infrastruktur. Gespeichert wird, was
du selbst anlegst: Projekte, Ebenen, Komponenten und Verbindungen mit den von
dir eingetragenen Angaben (etwa Bezeichnungen, IP-Adressen, VLANs,
Betriebssysteme, Hostnamen, URLs, Notizen in Markdown und frei definierbare
Felder). Diese Inhalte sind ausschließlich deinem Konto zugeordnet und für
andere Konten nicht sichtbar.

> **Bitte beachte:** Speichere hier keine Zugangsdaten, Schlüssel oder andere
> Geheimnisse und keine personenbezogenen Daten Dritter, für die du keine
> Rechtsgrundlage hast.

*Rechtsgrundlage:* Art. 6 Abs. 1 lit. b DSGVO.

### d) Server-Protokolle

Beim Abruf des Dienstes fallen technische Protokolldaten an: IP-Adresse,
Datum und Uhrzeit, aufgerufene Ressource, HTTP-Statuscode, übertragene
Datenmenge und die Browserkennung (User-Agent). Sie dienen dem sicheren Betrieb
und der Fehlersuche, werden nicht mit Konten zusammengeführt und nach
spätestens [7] Tagen gelöscht.

*Rechtsgrundlage:* Art. 6 Abs. 1 lit. f DSGVO (berechtigtes Interesse am
sicheren und störungsfreien Betrieb).

### e) Schutz vor Missbrauch

Zur Abwehr von Brute-Force-Angriffen und automatisierten Massenanfragen wird die
Anzahl der Anmelde-, Registrierungs- und Schreibvorgänge je IP-Adresse gezählt.
Diese Zähler liegen ausschließlich im Arbeitsspeicher, werden nach Ablauf des
jeweiligen Zeitfensters (wenige Minuten) verworfen und nicht dauerhaft
gespeichert.

*Rechtsgrundlage:* Art. 6 Abs. 1 lit. f DSGVO.

## 3. Was nicht stattfindet

- **Kein Tracking, keine Analyse, keine Werbung.** Es sind keine Analyse- oder
  Werbedienste eingebunden.
- **Keine externen Ressourcen.** Schriftarten, Skripte und Symbole werden
  vollständig vom Server dieser Instanz ausgeliefert; es werden keine
  Content-Delivery-Netzwerke Dritter aufgerufen.
- **Keine Weitergabe** deiner Inhalte an Dritte, außer soweit unter Punkt 4
  beschrieben oder gesetzlich vorgeschrieben.
- **Keine automatisierte Entscheidungsfindung** und kein Profiling nach
  Art. 22 DSGVO.

## 4. Hosting und Auftragsverarbeitung

[Beschreibe hier, wo die Instanz läuft. Beispiele:

- Betrieb auf eigener Hardware am Standort des Verantwortlichen.
- Betrieb bei [Hoster], [Anschrift]. Mit dem Anbieter besteht ein Vertrag zur
  Auftragsverarbeitung nach Art. 28 DSGVO.]

[Falls ein Reverse-Proxy oder CDN vorgeschaltet ist, hier ergänzen, zum Beispiel:

Der Zugriff erfolgt über Cloudflare (Cloudflare Germany GmbH, Rosental 7,
80331 München, für Europa; Muttergesellschaft Cloudflare, Inc., USA). Cloudflare
verarbeitet dabei Verbindungsdaten einschließlich der IP-Adresse, um den Dienst
auszuliefern und vor Angriffen zu schützen. Grundlage ist ein Vertrag zur
Auftragsverarbeitung; für Übermittlungen in die USA gelten die
Standardvertragsklauseln der EU-Kommission.]

## 5. Speicherdauer

Kontodaten und Inhalte werden gespeichert, solange dein Konto besteht. Löschst du
dein Konto, werden **alle** zugehörigen Daten — Konto, Sitzungen, Projekte,
Ebenen, Komponenten und Verbindungen — unmittelbar und vollständig entfernt.
Sitzungen enden spätestens mit ihrem Ablauf, Protokolldaten nach der oben
genannten Frist.

## 6. Deine Rechte

Dir stehen gegenüber dem Verantwortlichen folgende Rechte zu:

- **Auskunft** über die zu dir gespeicherten Daten (Art. 15 DSGVO)
- **Berichtigung** unrichtiger Daten (Art. 16 DSGVO)
- **Löschung** (Art. 17 DSGVO) — direkt in der Anwendung über
  *Konto → Konto löschen*
- **Einschränkung der Verarbeitung** (Art. 18 DSGVO)
- **Datenübertragbarkeit** (Art. 20 DSGVO) — die Anwendung bietet dafür einen
  vollständigen Export deiner Daten als JSON-Datei an
- **Widerspruch** gegen Verarbeitungen auf Grundlage berechtigter Interessen
  (Art. 21 DSGVO)

Außerdem kannst du dich bei einer Datenschutz-Aufsichtsbehörde beschweren
(Art. 77 DSGVO). Zuständig ist die Behörde deines Aufenthaltsorts oder die des
Verantwortlichen: [zuständige Aufsichtsbehörde mit Anschrift und Website].

## 7. Datensicherheit

Die Verbindung ist durchgängig mit TLS verschlüsselt. Passwörter werden mit
einem speicherintensiven Verfahren (scrypt) gehasht, Sitzungsschlüssel nur als
Hash gespeichert und serverseitig geprüft. Zustandsändernde Anfragen sind gegen
websiteübergreifende Anfragefälschung (CSRF) abgesichert.

## 8. Änderungen dieser Erklärung

Diese Datenschutzerklärung wird angepasst, wenn sich der Dienst oder die
Rechtslage ändert.

Stand: [Monat Jahr]
