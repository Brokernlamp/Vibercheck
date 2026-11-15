# Production deployment

This stack runs VibeCheck on one Docker host: Postgres, the Next.js app, a
dedicated scan worker, one-shot migrations, and Caddy for TLS. It is sized for a
small audit team, not a multi-region deployment.

```
Internet ── Caddy :443 ── app :3000 ── Postgres
                              │
                              └── sources volume ── worker
```

The app never runs scans in production. Intake writes a `QUEUED` scan; the worker
claims it with a lease, heartbeats while it runs, and a stale lease is requeued up
to three attempts. `/api/ready` fails when the worker heartbeat disappears.

## 1. Prerequisites

- A Linux host with 2+ vCPU, 4 GB RAM, and 40+ GB disk.
- Docker Engine with Compose v2.
- A DNS `A`/`AAAA` record for the audit hostname pointing at the host.
- Ports 80 and 443 reachable; SSH restricted to your addresses.
- A [Resend](https://resend.com) account with a verified sending domain.

Do **not** expose port 3000 publicly. Compose binds it to loopback for debugging
only; Caddy reaches it over the internal network.

## 2. Configure

```bash
cd /opt
git clone <this-repository> vibecheck
cd vibecheck

cp .env.production.example .env.production
chmod 600 .env.production
```

Edit `.env.production`:

- `POSTGRES_PASSWORD`: long random value. Use the same value inside
  `DATABASE_URL`.
- `SESSION_SECRET`: `openssl rand -base64 48`. Keep it stable. It signs sessions,
  hashes IPs, and encrypts MFA secrets; rotating it invalidates MFA enrollments.
- `APP_URL`: `https://audit.example.com`.
- `APP_DOMAIN`: `audit.example.com` (Caddy uses this for ACME).
- `MAIL_FROM`: an address on the Resend-verified domain.
- `RESEND_API_KEY`: create a sending-only key in Resend → API Keys.
- Keep `BILLING_MODE=free`, `DEMO_MODE=0`, `ALLOW_SAMPLE_SOURCE=0`,
  `SCAN_EXECUTION=worker`, `TRUST_PROXY=1`.

Verify the domain in Resend and publish its SPF/DKIM records before relying on
password resets or invitations. Gmail/Yahoo bulk-sender rules also expect DMARC
on the sending domain.

## 3. First deploy

```bash
docker compose build
docker compose up -d
docker compose --profile proxy up -d caddy
docker compose ps
curl -fsS https://audit.example.com/api/health
curl -fsS https://audit.example.com/api/ready
```

`migrate` runs once and must exit 0 before the app or worker starts. New
deployments use `drizzle/0000_*.sql`; do not run `db:push` against production.

Create the first operator account:

```bash
docker compose run --rm \
  -e ADMIN_EMAIL=you@example.com \
  -e ADMIN_NAME="Your Name" \
  migrate npx tsx scripts/create-admin.ts
```

The command prints a generated temporary password once if `ADMIN_PASSWORD` is not
supplied. Sign in, then enroll an authenticator at **Security & sessions**. With
`REQUIRE_STAFF_MFA=1`, admin and analyst pages redirect to enrollment until MFA is
on.

Create the first client tenant and invite its users from **Admin → Clients**.
There is no public signup by design.

## 4. Daily operations

```bash
docker compose ps
docker compose logs -f --tail=100 app worker
docker compose exec app node -e "fetch('http://127.0.0.1:3000/api/ready').then(r=>r.text()).then(console.log)"
```

Use an external uptime monitor on `/api/ready` (database + worker heartbeat) and
`/api/health` (process liveness). Alert on:

- `/api/ready` non-200 for 2 minutes.
- Worker heartbeat older than 60 seconds.
- Postgres volume above 75% capacity.
- Repeated `scan.lease_exhausted` or `email.failed` log events.

Logs are JSON lines on stdout, rotated by Docker (10 MB × 5). Ship them to your
log platform if you need retention beyond that; do not log request bodies or
secrets.

### Source retention

Run the retention job nightly. It skips continuous-monitoring engagements and
deletes snapshots outside `SOURCE_RETENTION_DAYS`:

```bash
docker compose run --rm migrate npx tsx scripts/purge-sources.ts
```

Example cron:

```cron
15 3 * * * cd /opt/vibecheck && docker compose run --rm migrate npx tsx scripts/purge-sources.ts >> /var/log/vibecheck-retention.log 2>&1
```

### Backups

```bash
install -m 700 deploy/backup.sh /usr/local/bin/vibecheck-backup
```

Cron example:

```cron
30 2 * * * cd /opt/vibecheck && ./deploy/backup.sh >> /var/log/vibecheck-backup.log 2>&1
```

Backups land in `./backups` as compressed Postgres custom-format dumps plus
SHA-256 files. Copy them off-host (encrypted object storage or a backup server);
a backup on the same disk is not a backup. Retention defaults to 14 days.

Restore drill (quarterly, on a separate host or database):

```bash
docker compose stop app worker
docker compose exec -T db sh -c \
  'dropdb -U "$POSTGRES_USER" --if-exists vibecheck_restore && createdb -U "$POSTGRES_USER" vibecheck_restore'
docker compose exec -T db sh -c \
  'pg_restore -U "$POSTGRES_USER" -d vibecheck_restore --clean --if-exists' \
  < backups/vibecheck-YYYYMMDDTHHMMSSZ.dump
```

Verify row counts and that the latest finalized report payload is readable before
declaring the drill successful.

## 5. Updating

```bash
cd /opt/vibecheck
./deploy/backup.sh
git pull
docker compose build
docker compose up -d
docker compose --profile proxy up -d caddy
docker compose ps
curl -fsS https://audit.example.com/api/ready
```

The `migrate` service applies new migrations before app/worker start. If a
migration fails, the app stays on the previous container; inspect
`docker compose logs migrate` and restore from backup if needed.

## 6. Security checklist

- [ ] `.env.production` is `0600`, owned by the deploy user, never committed.
- [ ] Only 22/80/443 are open; app port 3000 is bound to loopback.
- [ ] SSH keys only; password authentication disabled.
- [ ] Host and Docker updates applied monthly.
- [ ] `REQUIRE_STAFF_MFA=1`; every staff account has an authenticator.
- [ ] Resend domain shows verified with SPF/DKIM/DMARC.
- [ ] Backups copied off-host and a restore drill is recorded.
- [ ] Retention cron is running and `source.purged` audit events appear.
- [ ] Uptime monitor covers `/api/ready` and the worker heartbeat.
- [ ] Terms, privacy notice, and DPA reviewed by counsel before real clients.
- [ ] Incident response contact and rotation procedure documented.

## 7. Known limitations

- **Single-node.** Source snapshots live on one Docker volume. Moving to
  multi-node requires object storage and a shared queue (the lease model already
  supports multiple workers).
- **Repository coverage.** Public GitHub/GitLab repositories are supported. Private
  GitHub repositories require a configured GitHub App with a scoped installation;
  private GitLab repositories are not supported.
- **Static analysis only.** No dynamic testing, exploit verification, IaC, or
  malware sandboxing. The analyst review gate is mandatory because of this.
- **Dependency data has two sources.** Online scans query OSV; offline scans use
  the bundled advisory set in `src/lib/scan/advisories.ts`, which is not a live
  OSV/NVD feed.
- **No scheduled scans or deployment automation yet.** GitHub push webhooks publish
  security checks, but scheduled scans and automatic deployment of VibeCheck itself
  are not configured.
- **Payments are off.** `BILLING_MODE=free` skips checkout and invoices; the
  simulated flow remains for later.
- **Email depends on Resend.** Check delivery logs during onboarding; no inbound
  email or bounce webhooks are processed.
- **Local source storage is not encrypted by the application.** Use full-disk
  encryption or an encrypted volume on the host, restrict the Docker volume, and
  rely on retention. Object storage with per-tenant encryption is the next step.
