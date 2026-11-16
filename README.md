# VibeCheck — Local Security Audit Platform

VibeCheck is a self-service security scanner for freelancers building with AI-generated
("vibe-coded") software. A freelancer adds a project, submits a ZIP or public repository,
reviews automated findings, tracks fixes, and re-scans to verify changes. Scan reports
are available directly and clearly distinguish automated results from human-reviewed
audits.

**This is a local-first development and validation tool.** It runs on one developer
machine. There is no cloud deployment, no payment provider, and no external account
required.

---

## Quick start

```bash
# 1. Install dependencies
npm install

# 2. Create the local database (once)
createdb vibecheck

# 3. Copy the local config template
cp .env.local.example .env.local
# Edit .env.local if your PostgreSQL URL differs from the default.

# 4. Create the schema
npm run db:push

# 5. (Optional) Seed demo data — tenants, scans, delivered reports
npm run db:seed

# 6. Start the app
npm run dev
# → http://localhost:3000
```

Open `http://localhost:3000`. In the default open-access mode no login is required —
every page resolves to a single local operator identity.

### Updating an existing local database

Installing or updating npm packages does not update PostgreSQL. After pulling code
that changes `src/db/schema.ts`, stop the dev server and synchronize the local
development database before restarting:

```bash
npm run db:push
npm run dev
```

Make sure `db:push` and the app use the same `DATABASE_URL`. For databases managed
through the checked-in migration history, use `npm run db:migrate` instead.

---

## Configuration

Copy `.env.local.example` to `.env.local`. The defaults work out of the box for a
standard local PostgreSQL install. Key variables:

| Variable | Default | Purpose |
| --- | --- | --- |
| `DATABASE_URL` | `postgres://localhost:5432/vibecheck` | Local PostgreSQL connection |
| `SESSION_SECRET` | (dev default) | Must be 32+ chars; change before any shared deployment |
| `APP_URL` | `http://localhost:3000` | Used in internal links |
| `SCAN_EXECUTION` | `inline` | `inline` = scan in-process; `worker` = separate worker process |
| `OSV_OFFLINE` | `0` | `1` = use bundled advisory set (no internet required) |
| `SEMGREP_ENABLED` | `0` | `1` = run the optional pinned local Semgrep backend |
| `OPEN_ACCESS` | `1` | `1` = no login; `0` = use seeded accounts |
| `BILLING_MODE` | `free` | `free` = no invoices; `simulated` = test-mode billing flow |
| `SOLO_MODE` | `1` | `1` = freelancer self-service; `0` = staff-reviewed service workflow |
| `DATA_DIR` | `.data` | Local directory for source snapshots |
| `SOURCE_RETENTION_DAYS` | `30` | Days before source snapshots are eligible for purge |

---

## Running the scan worker (optional)

By default (`SCAN_EXECUTION=inline`) scans run inside the Next.js process. This is
correct for local development.

To test the worker queue separately:

```bash
# Terminal 1 — app
SCAN_EXECUTION=worker npm run dev

# Terminal 2 — worker
npm run worker
```

The worker polls the database for queued scans, runs them, and writes results back.
Stale scans (worker disappeared mid-scan) are automatically requeued after the lease
expires (10 minutes).

---

## GitHub push scanning

The scanner is not universal: its current source rules are strongest for JavaScript /
TypeScript and Python, with selected rules for other languages. Dependency checks
currently cover npm and pinned Python `requirements*.txt` files. Scans are bounded
to 2,500 files, 30 MB total, and 1 MB per ordinary file; oversized repositories may
be partial. Static findings are leads to validate, not proof of exploitability. OWASP
labels use the OWASP Top 10:2025 awareness taxonomy where applicable; they do not
represent ASVS verification or certification.

### ASVS requirement references

Findings with supported CWE metadata include candidate OWASP ASVS 5.0.0 requirement
IDs. The references are derived from OWASP's archived CWE crosswalk and its official
mapping from the pre-release identifiers to stable 5.0.0 IDs. Unmapped CWEs stay
unmapped rather than receiving guessed requirements. These links are advisory
references only; they do not indicate that a requirement was assessed, satisfied, or
certified. See the [ASVS 5.0.0 source and mappings](https://github.com/OWASP/ASVS/tree/v5.0.0_release/5.0).

### Optional Semgrep backend

The scanner includes a small VibeCheck-authored Semgrep ruleset for JavaScript /
TypeScript and Python taint patterns. It is disabled by default and does not fetch
Semgrep Community Rules or other remote rules. In a Node.js scanner environment,
install the pinned CLI and opt in:

```bash
python -m pip install -r scanner-requirements.txt
SEMGREP_ENABLED=1 npm run dev
```

The same environment setting applies to the scan worker. The backend checks the CLI
version and reports a warning instead of running with a different version or when
Semgrep is unavailable. Metrics are disabled; the CLI scans a temporary copy of the
collected source, which is removed after the scan. Semgrep findings are normalized
with CWE and OWASP metadata, redacted, and deduplicated against built-in findings.
Do not enable it in Cloudflare/edge deployments or any runtime that cannot spawn
the pinned local CLI; use a Node.js scanner worker instead. A Semgrep warning means
that part of the scan did not complete and must not be interpreted as a clean result.

Community rules were evaluated locally only; they are not shipped or fetched by the
application. The tested registry YAML snapshots are identified by SHA-256 (downloaded
content must match these hashes to reproduce this run):

- Semgrep CLI `1.185.0`
- `p/secrets`: `d1afb323ed493cf9d3ee5044447b989debf033b2b7cc8208662a81b8c162c66a`
- `p/owasp-top-ten`: `59f969f78c0405fcce4ad00d6c24a73b736defb3ae34f6c92a168465cd8d1cbd`

On `benchmarks/vulnerable-app`, the pinned packs produced 12 raw matches with no
analysis errors. VibeCheck's normalizer and location/CWE deduper retained 4 new
finding rows beside the 53 built-in findings; two Python SQL matches describe the
same injection, so the distinct additional issues were a mutable GitHub Actions
tag, Python SQL injection, and unescaped remote response content returned as HTML.
Semgrep's defaults skipped `vendor/acme-widget`; `p/secrets` found only the JWT
secret already detected by VibeCheck. This fixture result is a regression exercise,
not an accuracy, recall, or coverage benchmark.

The same pinned packs were also evaluated against OWASP Juice Shop `v20.4.0`
(`266448aba68cd8ba5915f526a128da4fa7bc3f9f`). Semgrep scanned 1,218 targets and
reported 45 matches; after CWE/location deduplication against 246 built-in findings,
39 additional finding rows remained (32 production-classified and 7 vendor-classified
rows). These are finding rows, not 39 manually confirmed, distinct vulnerabilities.
The scan reported 53 non-fatal parse warnings (24 under `data/static/codefixes/`,
21 workflow files, and 8 HTML templates), skipped 8 default-excluded paths, and omitted two
files larger than 1 MB. The previously skipped `vendor/acme-widget` fixture was
also scanned explicitly; its two files produced no community-rule findings. Keep
these Semgrep-maintained packs out of VibeCheck's SaaS runtime: the
[Semgrep Rules License v1.0](https://semgrep.dev/legal/rules-license) permits
internal business use but does not allow distributing the rules or making them
available as a service. Their evaluation was local only; the scanner continues to
use VibeCheck-authored rules on the Semgrep engine. Reconsider the maintained packs
only with separate written commercial permission. Third-party rule packs require
their own license and quality review.

A separate built-in-only scan of the same Juice Shop revision scanned 1,137 files
and produced 246 findings; 198 (80.5%) received at least one ASVS reference, across
8 distinct requirement IDs. On the internal vulnerable fixture, 23 of 53 findings
(43.4%) received a reference. These are corpus-specific reference-attachment rates,
not ASVS verification coverage or a claim about typical production scans; the rate
depends on the finding mix. The fixture's 10 dependency and 2 license findings had
no ASVS references.

The repository includes a GitHub Actions workflow (`.github/workflows/ci.yml`) that
runs typecheck, tests, scanner benchmarks, and the production build on pushes and
pull requests.

For connected project repositories, GitHub push webhooks refresh and scan the exact
commit, then publish a **VibeCheck Security Scan** check result. Each project chooses
one policy when it is created:

1. **Report only** — show findings, but pass the GitHub check.
2. **Block critical/high** — fail the check if any critical or high finding exists.
3. **Block any finding** — fail the check if any finding exists.

For policies 2 and 3, truncated scans or scanner/advisory warnings also fail the
check rather than presenting an incomplete result as a clean pass.

To configure the integration:

1. Create a GitHub App in GitHub **Settings → Developer settings → GitHub Apps**.
2. Set its webhook URL to `https://YOUR_VIBECHECK_HOST/api/webhooks/github` and
   generate a webhook secret. Subscribe to the **Push** event.
3. Grant repository permissions **Contents: Read-only** and **Checks: Read & write**.
   The App uses installation-scoped access tokens; do not use or paste a personal
   access token into VibeCheck.
4. Generate the App's private key. Configure `GITHUB_APP_ID`,
   `GITHUB_APP_PRIVATE_KEY`, and `GITHUB_WEBHOOK_SECRET` as deployment secrets, then
   apply the database migration with `npm run db:migrate` and restart/redeploy
   VibeCheck. Do not commit the private key or webhook secret.
5. Install the App on each GitHub account or organization and select the repositories
   it may access. Private repositories are cloned only when the App installation has
   access to that repository.
6. In VibeCheck, create a project using its GitHub HTTPS URL and select a push scan
   policy. Connect each repository once per App installation; existing projects
   created before App installation must be created again to associate them with the
   installation. GitLab push webhooks are not supported.
7. For policies 2 or 3 to block merges, enable **VibeCheck Security Scan** as a
   required check in the repository's branch protection/ruleset. Without that GitHub
   rule, a failed check is reported but does not prevent merging.

Webhook deliveries are signature-verified and de-duplicated. `SCAN_EXECUTION=worker`
is recommended for deployed environments; keep `npm run worker` running so queued
push scans are processed. Webhook delivery is near-real-time, not instantaneous:
GitHub receives an acceptance response, then the app clones, scans, and publishes the
check asynchronously.

---

## Using Docker for the database

A local-only Docker Compose file is provided. It binds PostgreSQL to `127.0.0.1` only.

```bash
# Start only the database
docker compose -f docker-compose.local.yml up -d db

# Then run the app normally
npm run db:push && npm run dev
```

---

## Seeded demo accounts

Run `npm run db:seed` to populate demo tenants, scans, and delivered reports.
Accounts are only used when `OPEN_ACCESS=0`.

| Role | Email | Password | Sees |
| --- | --- | --- | --- |
| Analyst | `analyst@vibecheck.dev` | `Analyst123!` | Review queue, triage desk, ruleset |
| Developer | `developer@vibecheck.dev` | `Client123!` | Delivered project, remediation tracker |
| Developer 2 | `developer2@vibecheck.dev` | `Client123!` | Live review queue project |
| Admin | `admin@vibecheck.dev` | `Admin123!` | All engagements, clients, audit log |

These credentials are **local development only**. Never use them in any shared or
production environment.

---

## Verification

```bash
npm run typecheck        # TypeScript strict check — must produce no errors
npm test                 # Tests: scanner, GitHub integration, review gate, and local behaviors
npm run scan:benchmark   # Exercises built-in checks against local fixtures; not an accuracy or recall benchmark
```

---

## Health check

The local health screen is available at `/admin/health` (requires the app to be running
and the database to be reachable). It checks:

- PostgreSQL connectivity
- Scan worker heartbeat (if `SCAN_EXECUTION=worker`)
- Detection engine rule count
- Source storage write access

The JSON API is at `/api/status`.

---

## Reset

```bash
# Drop and recreate the database
dropdb vibecheck && createdb vibecheck
npm run db:push
npm run db:seed   # optional

# Delete all source snapshots
rm -rf .data/sources
```

---

## Source retention

Source snapshots are stored under `.data/sources/` and retained for re-scans.
Run the purge job to delete snapshots older than `SOURCE_RETENTION_DAYS`:

```bash
npm run purge:sources
# Force-purge monitoring engagements too:
npm run purge:sources -- --all
```

---

## Troubleshooting

**`DATABASE_URL` connection refused**
Ensure PostgreSQL is running: `pg_isready -d vibecheck`. If using Docker:
`docker compose -f docker-compose.local.yml up -d db`.

**`column ... does not exist`**
The database schema is behind the code, or the app and schema command are using
different databases. Stop the dev server, confirm both use the same `DATABASE_URL`,
run `npm run db:push` for the local development database, then restart the app.

**`npm run db:push` fails with "relation already exists"**
The schema is already applied. Run `npm run db:push` again — Drizzle is idempotent.

**Scan stays in SCANNING / QUEUED forever**
If `SCAN_EXECUTION=worker`, the worker is not running. Start it: `npm run worker`.
Stale scans are requeued automatically after the lease expires (10 minutes).

**`npm run db:seed` fails with "duplicate key"**
The database already has seed data. Reset first:
`dropdb vibecheck && createdb vibecheck && npm run db:push`.

**Worker exits immediately**
Check that `DATABASE_URL` is set and the database is reachable. The worker validates
configuration at startup and exits with a non-zero code if required variables are missing.

**`npm run typecheck` fails after editing**
Run `npm run typecheck` before committing. The CI gate requires zero TypeScript errors.

---

## Freelancer workflow

1. Open **My projects** (`/portal`) and choose **New scan**.
2. Name the project and upload a ZIP, use a public repository URL, or choose the demo fixture.
3. The scan runs inline or is picked up by the configured worker.
4. Open the generated report and review potential findings, evidence, and suggested fixes. VibeCheck detects likely languages, frameworks, data layers, and infrastructure from source extensions and project manifests; it displays both the supplied and detected stack when available.
5. Download or copy the report-specific **AI patch prompt** from the report. Give it to the coding assistant operating in your project repository. The prompt asks the assistant to verify each finding before making a minimal fix, add tests, and report what it could not safely resolve.
6. Review the AI's code changes yourself, run your project tests, and mark findings as fixed in VibeCheck.
7. Re-scan the project to compare results and verify whether issues remain.

The scanner combines static pattern rules, credential signatures, dependency/advisory checks, and license checks. It is not the "best" or a complete security analysis: it does not execute the app, perform penetration testing, or prove that authentication and authorization are correct end-to-end. Treat findings as leads to validate, and a clean scan as limited evidence rather than a security guarantee.

Set `SOLO_MODE=0` to use the legacy audit-service flow instead. In that mode, analysts
triage findings, sign off, and finalize reports before clients can access them.

---

## Key security behaviors (enforced in code, not just UI)

- **Review gate:** when `SOLO_MODE=0`, `canFinalizeReport()` in `src/lib/review.ts`
  blocks finalization unless a scan succeeded, every finding has an analyst decision,
  the review is signed off, and the report is a draft. Finalized reports are immutable.
- **Self-service reports:** when `SOLO_MODE=1`, successful scans automatically publish an
  immutable report marked as automated and not human-reviewed.
- **Tenant isolation:** every engagement/report query is scoped by `orgId` server-side.
  Developers receive 404 for other workspaces' data and drafts.
- **Secret redaction:** every finding snippet passes through `src/lib/scan/redact.ts`.
  Raw credentials are never stored or shown.
- **Retention boundary:** `purgeSource()` refuses any path outside `.data/sources/`.
- **Archive safety:** ZIP extraction enforces size, file count, path traversal, and
  symlink guards before any byte is written to disk.
- **No code execution:** scanned project code is never executed. The engine reads files
  as text only.

---
