# Security

Lab Visualizer stores infrastructure documentation — IP addresses, hostnames,
network topologies and free-form notes. Vulnerabilities weigh more here than in
an ordinary CRUD tool, so reports are very welcome.

## Reporting a vulnerability

**Please do not open a public issue.** Use one of these instead:

1. **GitHub Security Advisory** (preferred) — *Security* tab →
   [*Report a vulnerability*](https://github.com/leofleischmann/Lab-Visualizer/security/advisories/new).
   Only maintainers can see it.
2. A private message to the maintainer on GitHub.

Helpful: affected version or commit, a description of the attack scenario and,
if you have them, steps to reproduce.

I usually reply within **7 days**. This is a hobby project, so it can
occasionally take longer — a reminder is perfectly fine.

## In scope

- Bypassing authentication or session handling
- Reading data from other accounts (isolation is a core promise)
- Injection (SQL, XSS via node fields, Markdown notes or custom fields)
- CSRF, session fixation, privilege escalation
- Bypassing the server-side instance limits

## Out of scope

- Missing rate limits on read endpoints (deliberate)
- Attacks that already require access to the host or the SQLite file
- Scanner output without a plausible attack scenario
- Weaknesses in instances run without HTTPS, against the README's advice

## Hardening an instance

Read the [Security](README.md#security) and
[Instance limits](README.md#instance-limits) sections of the README. The
essentials:

- **Always serve over HTTPS** and set `COOKIE_SECURE=true`.
- Set `ALLOW_REGISTRATION=false` if the instance is yours alone.
- Set caps on public instances (`MAX_PROJECTS_PER_USER`,
  `MAX_VIEWS_PER_PROJECT`, `MAX_NODES_PER_PROJECT`).
- Back up `data/` regularly — it holds every account.
