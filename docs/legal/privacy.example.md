# Privacy policy

<!--
TEMPLATE — do not adopt unchecked.

A sample for operators of a PUBLIC instance. Fill in everything in [square
brackets] and save the result as `data/legal/privacy.md`.

The technical statements below describe the software as it is (accounts,
sessions, rate limiting, no trackers). Adjust them as soon as you change your
instance — for example by adding analytics or a different reverse proxy.

Formatting: rendered as Markdown. For addresses, end each line with two spaces.

This is not legal advice. The template is written for the GDPR; other
jurisdictions differ.
-->

## 1. Controller

The controller for data processing on this instance is:

[First and last name or company]  
[Street and number]  
[Postal code and city]  
[Country]  
Email: [email address]

No data protection officer has been appointed, as the conditions of Art. 37 GDPR
or § 38 BDSG are not met.

## 2. What data is processed

### a) Account data

Registration requires an **email address** and a **password**. The password is
stored solely as a cryptographic hash (scrypt with a random salt) and is not
readable by us in plain text. We additionally store the account's creation and
last-modification time. No name, address or phone number is collected.

*Legal basis:* Art. 6(1)(b) GDPR (performance of the user relationship).

### b) Session management (cookie)

After signing in, a cookie named `sid` is set. It contains only a randomly
generated session key — no personal content and no identifier for cross-site
recognition. The server stores only the SHA-256 hash of that key together with
creation and expiry times. The cookie is `HttpOnly`, `SameSite=Lax` and is
transmitted over HTTPS only. The session expires after [30] days and is extended
while in use.

This cookie is strictly necessary to operate the service; no consent is required
for it under § 25(2)(2) TDDDG. We set no other cookies.

*Legal basis:* Art. 6(1)(b) GDPR.

### c) Content you enter

The service documents IT infrastructure. We store what you create yourself:
projects, levels, components and connections with the details you enter (labels,
IP addresses, VLANs, operating systems, hostnames, URLs, Markdown notes and
free-form fields). This content is tied to your account only and is not visible
to other accounts.

> **Please note:** do not store credentials, keys or other secrets here, and no
> personal data of third parties for which you have no legal basis.

*Legal basis:* Art. 6(1)(b) GDPR.

### d) Server logs

Accessing the service produces technical log data: IP address, date and time,
requested resource, HTTP status code, amount of data transferred and the user
agent. It serves secure operation and troubleshooting, is not combined with
accounts and is deleted after at most [7] days.

*Legal basis:* Art. 6(1)(f) GDPR (legitimate interest in secure, trouble-free
operation).

### e) Abuse protection

To fend off brute-force attacks and automated bulk requests, the number of
sign-in, registration and write operations per IP address is counted. These
counters live in memory only, are discarded once the time window (a few minutes)
passes and are never persisted.

*Legal basis:* Art. 6(1)(f) GDPR.

## 3. What does not happen

- **No tracking, no analytics, no advertising.**
- **No external resources.** Fonts, scripts and icons are served entirely from
  this instance; no third-party CDN is contacted.
- **No sharing** of your content with third parties beyond what section 4
  describes or the law requires.
- **No automated decision-making** and no profiling under Art. 22 GDPR.

## 4. Hosting and processing

[Describe where the instance runs. Examples:

- Operated on the controller's own hardware.
- Operated at [host], [address]. A data processing agreement under Art. 28 GDPR
  is in place.]

[If a reverse proxy or CDN sits in front, add it here, for example:

Access is routed through Cloudflare (Cloudflare Germany GmbH, Rosental 7,
80331 Munich for Europe; parent company Cloudflare, Inc., USA). Cloudflare
processes connection data including the IP address in order to deliver the
service and protect it from attacks. This is based on a data processing
agreement; transfers to the USA rely on the EU Commission's standard contractual
clauses.]

## 5. Retention

Account data and content are stored for as long as your account exists. If you
delete your account, **all** related data — account, sessions, projects, levels,
components and connections — is removed immediately and completely. Sessions end
at expiry at the latest, log data after the period stated above.

## 6. Your rights

You have the right to:

- **Access** the data stored about you (Art. 15 GDPR)
- **Rectification** of inaccurate data (Art. 16 GDPR)
- **Erasure** (Art. 17 GDPR) — directly in the app via *Account → Delete account*
- **Restriction of processing** (Art. 18 GDPR)
- **Data portability** (Art. 20 GDPR) — the app offers a complete JSON export
- **Object** to processing based on legitimate interests (Art. 21 GDPR)

You may also lodge a complaint with a supervisory authority (Art. 77 GDPR),
either where you live or where the controller is based:
[competent authority with address and website].

## 7. Data security

The connection is TLS-encrypted end to end. Passwords are hashed with a
memory-hard algorithm (scrypt), session keys are stored as hashes only and
verified server-side. State-changing requests are protected against cross-site
request forgery (CSRF).

## 8. Changes to this policy

This privacy policy is updated when the service or the legal situation changes.

Last updated: [month year]
