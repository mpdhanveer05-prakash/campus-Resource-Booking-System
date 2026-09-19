# Deployment

Three separately deployable services behind one HTTPS origin: a static frontend,
the Express API, and a private PostgreSQL.

```
Browser ──HTTPS──> nginx ──/api──> Express API ──> PostgreSQL (private)
                     └──static──> built React assets
```

Keeping both the pages and `/api` on **one origin** is what allows the host-only
session cookie to travel with API requests without any CORS configuration.

## What is published

| Service | Public? | Port |
|---|---|---|
| web (nginx) | Yes | 80 → redirects to 443, 443 serves |
| api (Express) | No | 4000, internal network only |
| db (PostgreSQL) | **No** | 5432, internal network only, no host mapping |

The database has no `ports:` entry at all, so it is unreachable from the host or
the internet.

## Release sequence

1. **Build and test.**
   ```bash
   cd server && npm ci && npm run lint && npm test
   cd ../client && npm ci && npm run build
   ```
   The production frontend is the contents of `client/dist`, served by nginx.
   The Vite dev server is never used in production.

2. **Provision PostgreSQL** with a persistent volume and restricted network
   access. Use separate migration and runtime credentials, and follow the
   provider's TLS requirements.

3. **Back up any existing database** before migrating.

4. **Run migrations once, as a release job.** In `infra/compose.prod.yml` this is
   the `migrate` service: a one-shot container that exits, with the API gated on
   `service_completed_successfully`. Replicas never race to migrate, and nothing
   is auto-created at runtime.

5. **Start the API** with runtime secrets, `NODE_ENV=production`, the exact
   `APP_ORIGIN`, and proxy trust enabled only for the known topology.

6. **Serve the frontend** through the HTTPS proxy, forwarding `/api` to Express.
   SPA fallback applies to frontend routes only.

7. **Create the initial administrator** through the controlled command:
   ```bash
   docker compose -f infra/compose.prod.yml -p crbs-prod exec \
     -e SEED_ADMIN_EMAIL=... -e SEED_ADMIN_PASSWORD=... \
     api node scripts/create-admin.js
   ```
   It refuses to change an account that already exists. Never publish demo
   credentials, and never run the development seed in production.

8. **Verify** readiness, cookie flags, CSRF, role permissions, the booking
   conflict, cancellation, page refresh and persistence — over HTTPS.

## Running the production stack locally

```bash
cp infra/.env.example infra/.env.prod   # then set real values
docker compose -f infra/compose.prod.yml --env-file infra/.env.prod -p crbs-prod up -d --build
```

For local verification only, generate a self-signed certificate into `infra/tls`:

```bash
docker run --rm -v "$PWD/infra/tls:/certs" alpine/openssl req -x509 -nodes \
  -newkey rsa:2048 -days 365 -keyout /certs/dev.key -out /certs/dev.crt \
  -subj "/CN=localhost" -addext "subjectAltName=DNS:localhost,IP:127.0.0.1"
```

Replace these with real certificates in any real deployment. If your platform
terminates TLS upstream, drop the 443 block and ensure the platform forwards
`X-Forwarded-Proto: https`.

## Why HTTPS is required, not optional

In production the session cookie is issued with `Secure`. Express refuses to send
a Secure cookie over a connection it does not consider secure, which it
determines from `X-Forwarded-Proto` when `trust proxy` is enabled. Over plain
HTTP **no session cookie is issued at all and login cannot work**. This is
correct behaviour, not a misconfiguration — it is why the HTTP server block
redirects to HTTPS rather than serving a site whose login is broken.

Verified cookie on the deployed stack:

```
Set-Cookie: crbs.sid=...; Path=/; Expires=...; HttpOnly; Secure; SameSite=Lax
```

Host-only (no `Domain`), HttpOnly, Secure, SameSite=Lax, finite expiry.

## Environment

| Variable | Notes |
|---|---|
| `NODE_ENV` | `production` |
| `PORT` | 4000 |
| `DATABASE_URL` | Runtime account. Least privilege: no schema rights |
| `MIGRATION_DATABASE_URL` | Schema owner. Supplied to the migration job only |
| `SESSION_SECRET` | Long random value. Rotating it invalidates all sessions |
| `APP_ORIGIN` | Exact public HTTPS origin, used for CSRF Origin validation |
| `LOG_LEVEL` | `info` |

Supply all secrets at runtime, from the platform's secret manager. Never bake
them into an image.

## Rollback

Application rollback is redeploying the previous image tag.

**Rolling back the frontend or API does not undo a migration.** Database changes
need their own compatibility and rollback plan. Prefer additive, backwards
compatible migrations so the previous application version still runs against the
new schema. `npm run db:migrate:down` steps back exactly one migration and is
destructive — take a backup first.

## Backups

- Schedule regular `pg_dump` backups of the database volume.
- Rehearse a restore into a scratch database and confirm the application starts
  against it. A backup that has never been restored is not a backup.
- Retain prior application images so a rollback does not require a rebuild.

## Operational notes

- **Graceful shutdown.** `SIGTERM` stops accepting connections, lets in-flight
  requests finish, then closes the pool, with a 10 second hard limit so a stuck
  connection cannot block a deploy.
- **Health probes.** `/api/health/live` for liveness (no dependencies, reachable
  over HTTP for load balancer probes); `/api/health/ready` for readiness, which
  returns 503 when the database is unreachable and leaks no detail.
- **Rate limiting is in-memory** and therefore per-instance. Running more than
  one API replica requires a shared store or gateway-level control; otherwise the
  effective limit multiplies by the replica count.
- **Logs** are structured JSON with cookies, passwords, tokens and authorization
  headers redacted. Ship them to your platform's log store and set retention.

## Verified on the local production stack

| Check | Result |
|---|---|
| HTTP redirects to HTTPS | 301 |
| Frontend served over HTTPS | 200 |
| Cookie flags | `HttpOnly; Secure; SameSite=Lax`, host-only |
| Admin login, resource create, slot publish | Works |
| Student register with `role: ADMIN` | Created as STUDENT |
| Student book → conflict → cancel | 201, `SLOT_ALREADY_BOOKED`, CANCELLED |
| Student calls admin API | 403 |
| Direct visit to `/my-bookings` | Serves the app shell |
| Unknown `/api` route | JSON 404, not HTML |
| Database reachable from host | No host port mapping |
| Full stack restart | Users, bookings and resources all retained |

## Requires real hosting to verify

- Behaviour behind a production load balancer and a real certificate chain.
- Backup and restore rehearsal against the hosted database.
- Multi-replica behaviour, including shared rate limiting.
