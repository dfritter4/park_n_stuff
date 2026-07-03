# Park N Stuff

A parking reservation proof-of-concept: customers browse parking lots on a
map, reserve a spot, and pay with a (mocked) card, with server-quoted,
time-of-day-aware pricing; admins manage lots, pricing rules and capacity
overrides, reservations and customers, and view revenue/occupancy analytics
including a weekly heatmap, week-over-week and lot-over-lot comparisons, an
occupancy forecast, and a declined-payments report. Built as an
npm-workspaces monorepo with a clean-architecture Express API and two
independent Vite/React single-page apps.

## Phase 2 features

- **Rule-based pricing & server quotes** — lots can define hourly-rate rules
  keyed on day type (weekday/weekend/all) and an hour-of-day window (UTC);
  `GET /api/lots/:id/quote` returns the server-authoritative cost for a
  window, and the customer reserve flow calls it (debounced) so the price
  shown always matches what gets charged.
- **Capacity overrides** — admins can temporarily close off a number of
  spaces at a lot (maintenance, events, etc.); availability and the
  reservation capacity gate both account for active overrides.
- **Admin reservation management** — filterable/paginated reservation list
  (lot, status, date range, search, "active now"), a detail view with
  customer and payment info, cancel (refunds all succeeded payments), extend
  (re-prices the delta window and re-checks capacity), and a per-lot
  "in lot now" view.
- **Admin customer management** — searchable/paginated customer list with
  reservation counts and lifetime spend (succeeded payments only), a detail
  view with reservation history, and flag/unflag with a reason; a flagged
  customer's email is blocked from creating new reservations.
- **Analytics upgrades** — a 7×24 occupancy heatmap, this-week-vs-last-week
  and lot-vs-lot comparisons, a next-7-days occupancy forecast, and a
  declined-payments report (count/amount by day plus recent attempts).
- **Customer app visual polish** — a cohesive design system (type scale,
  color palette, spacing/radii/shadows), refined lot cards, form and payment
  styling, a celebratory confirmation receipt, and loading skeletons.

## Architecture

### Monorepo map

```
packages/
  shared/         Zod request/response contracts shared by the API and both frontends (ESM, published as @parking/shared)
  api/             Express + TypeScript API (ESM)
  customer-web/    Customer-facing SPA (Vite + React) — browse lots, reserve, pay
  admin-web/       Admin SPA (Vite + React) — manage lots, view analytics, export CSV
```

`@parking/shared` defines the Zod schemas for every request/response body.
Both the API and the two frontends import types and validators from it, so
the wire contract only has one source of truth.

### `@parking/api` — clean architecture layers

```
src/
  domain/           Pure business logic: pricing, lot invariants, reservation numbers. No I/O, no framework types.
  application/       Use cases (services) orchestrating domain logic against ports (interfaces): CreateReservationService, LotService, AnalyticsService, AuthService.
  infrastructure/     Port implementations: Postgres repositories, the mock payment gateway, the seed script, db/pool setup.
  presentation/       Express wiring: routes, middleware (auth, validation, error handling), app.ts (composition), main.ts (process entrypoint).
```

Dependencies point inward — `domain` knows nothing about `application`,
`application` knows nothing about `infrastructure`/`presentation`, and
`infrastructure`/`presentation` depend on `application`'s port interfaces
rather than the reverse. `main.ts` is the only place concrete infrastructure
implementations are wired to application services.

### API surface

| Method | Path | Auth |
|---|---|---|
| GET | `/api/health` | none |
| GET | `/api/lots` | none |
| GET | `/api/lots/:id` | none |
| GET | `/api/lots/:id/quote` | none |
| POST | `/api/lots` | admin |
| PUT | `/api/lots/:id` | admin |
| DELETE | `/api/lots/:id` | admin |
| GET | `/api/lots/:id/pricing-rules` | none |
| POST | `/api/lots/:id/pricing-rules` | admin |
| DELETE | `/api/pricing-rules/:ruleId` | admin |
| GET | `/api/lots/:id/capacity-overrides` | admin |
| POST | `/api/lots/:id/capacity-overrides` | admin |
| DELETE | `/api/capacity-overrides/:id` | admin |
| POST | `/api/reservations` | none (rate-limited) |
| GET | `/api/reservations/:id` | none |
| POST | `/api/admin/auth/login` | none |
| GET | `/api/admin/dashboard` | admin |
| GET | `/api/admin/analytics` | admin |
| GET | `/api/admin/analytics/day/:date` | admin |
| GET | `/api/admin/analytics/export` | admin |
| GET | `/api/admin/analytics/heatmap` | admin |
| GET | `/api/admin/analytics/weekly-compare` | admin |
| GET | `/api/admin/analytics/lot-compare` | admin |
| GET | `/api/admin/analytics/forecast` | admin |
| GET | `/api/admin/analytics/declines` | admin |
| GET | `/api/admin/reservations` | admin |
| GET | `/api/admin/reservations/:id` | admin |
| POST | `/api/admin/reservations/:id/cancel` | admin |
| POST | `/api/admin/reservations/:id/extend` | admin |
| GET | `/api/admin/lots/:id/current` | admin |
| GET | `/api/admin/customers` | admin |
| GET | `/api/admin/customers/:id` | admin |
| POST | `/api/admin/customers/:id/flag` | admin |
| POST | `/api/admin/customers/:id/unflag` | admin |

Admin routes require a `Bearer` JWT obtained from `/api/admin/auth/login`.
`GET /api/lots/:id/pricing-rules` is intentionally public (the customer app
may surface it later); every other pricing/capacity/reservation/customer
management route is admin-only.

## Prerequisites

- Node.js 20+
- Docker (for local Postgres via `docker-compose`, and for building the deployment images)
- npm 10+ (ships with Node 20)

## Quickstart (local development)

```bash
# 1. Start the dev Postgres container (port 5432)
docker compose up -d db

# 2. Install all workspace dependencies
npm install

# 3. Run migrations
npm run migrate -w @parking/api

# 4. Seed 6 Chicago lots, 30 customers, and ~30 days of reservation history
npm run seed -w @parking/api

# 5. Start the API (defaults to port 3000 — see note below if that's taken locally)
npm run dev -w @parking/api

# 6. In separate terminals, start both frontends
npm run dev -w @parking/customer-web
npm run dev -w @parking/admin-web
```

By default:

| Service | URL |
|---|---|
| API | http://localhost:3000 |
| customer-web | http://localhost:5173 |
| admin-web | http://localhost:5174 |

Both dev servers proxy `/api/*` to `http://localhost:3000` (override with
`VITE_PROXY_TARGET`). If port 3000 is unavailable locally, run the API with
`PORT=3001 npm run dev -w @parking/api` and `VITE_PROXY_TARGET=http://localhost:3001 npm run dev -w @parking/customer-web` (and the same for `admin-web`).

Required environment variables for the API (see `.env.example`):

| Variable | Purpose | Local default |
|---|---|---|
| `DATABASE_URL` | Postgres connection string | `postgres://parking:parking@localhost:5432/parking` |
| `JWT_SECRET` | Signing secret for admin JWTs | any dev string |
| `PORT` | Port the API listens on | `3000` |
| `CORS_ORIGINS` | Comma-separated list of allowed origins | `http://localhost:5173,http://localhost:5174` |

### Credentials and demo data

- **Admin login:** `admin@parknstuff.dev` / `admin123`
- **Demo card numbers:** any Luhn-valid card number works. A card ending in
  `0001` always succeeds; a card ending in `0002` always declines. All other
  cards succeed ~95% of the time (simulating a real processor).

## Running tests

Integration tests run against a second, disposable Postgres instance so they
never touch dev data.

```bash
# Start the test Postgres container (port 5433, db "parking_test")
docker compose up -d db_test

# Migrate the test database once
DATABASE_URL=postgres://parking:parking@localhost:5433/parking_test npm run migrate -w @parking/api

# Run every workspace's test suite (509 tests across shared/api/customer-web/admin-web)
npm test
```

## Test data

The seed script (`npm run seed -w @parking/api`) is idempotent (it truncates
before inserting) and generates:

- **6 parking lots** across Chicago neighborhoods (Loop, River North, West
  Loop, Wicker Park, Lincoln Park, Hyde Park), with downtown lots priced and
  utilized higher than neighborhood lots.
- **Pricing rules** on 3 of the 6 lots: Loop Premier Garage (weekday
  7am–7pm UTC, $15/hr), River North Self Park (weekend 5pm–midnight UTC,
  $12/hr), West Loop Lot (every day 6am–10am UTC, $10/hr). Historical
  reservation totals for these lots are priced through the same
  `calculateWindowCostCents` window-pricing logic the API uses at request
  time, so seeded totals match what the rules would charge.
- **30 days** of hourly-resolution reservation history per lot, back-filled
  from the seed run time.
- **~55,000 reservations** (~92% completed, ~8% cancelled) plus a small
  batch of currently-active reservations spanning "now". About half of
  cancelled reservations' payments are marked `refunded`.
- **~2.5% of payment attempts** also produce a `declined_attempts` row,
  spread across the 30-day history, feeding the declines analytics report.
- **30 seeded customers** with realistic names/emails/phone numbers; **2 are
  flagged** (with a reason) to demonstrate the flagged-customer reservation
  block and the admin unflag workflow.
- Occupancy is weighted toward **peak hours** (8-9am, 12-1pm, 5-6pm),
  downshifted **50% on weekends**, and downtown lots target roughly 70-90%
  peak utilization vs. 40-60% for neighborhood lots.

## Deployment (Railway)

The app deploys as three containers plus a managed Postgres instance, all
inside one Railway project. This is exactly how the live deployment
referenced below was created — using the Railway CLI, no dashboard clicks.

### Dockerfiles

- `packages/api/Dockerfile` — multi-stage Node 20 build. Builds
  `@parking/shared` then `@parking/api`, then a slim runtime image that runs
  `npm run migrate && node dist/main.js` on every boot (migrations run
  automatically before the server starts accepting traffic).
- `packages/customer-web/Dockerfile` / `packages/admin-web/Dockerfile` —
  multi-stage build: a Node stage builds the Vite app with `VITE_API_URL`
  passed as a build `ARG` (Vite inlines `VITE_*` vars at build time), then an
  `nginx:alpine` runtime stage serves the static bundle. Each package's
  `nginx.conf` is templated via nginx's built-in `envsubst` mechanism so the
  container listens on whatever `PORT` the host assigns, with SPA fallback
  (`try_files $uri /index.html`) for client-side routing.

All three Dockerfiles expect the **monorepo root** as the build context
(they need `packages/shared` and `tsconfig.base.json` alongside their own
package), e.g.:

```bash
docker build -f packages/api/Dockerfile -t parking-api .
docker build -f packages/customer-web/Dockerfile --build-arg VITE_API_URL=https://your-api-domain -t parking-customer-web .
docker build -f packages/admin-web/Dockerfile --build-arg VITE_API_URL=https://your-api-domain -t parking-admin-web .
```

### Steps actually performed

```bash
railway init --name park-n-stuff              # create the Railway project
railway add --database postgres               # managed Postgres plugin
railway add --service api                     # empty service, source pushed via `railway up`
railway add --service customer-web
railway add --service admin-web

railway domain -s api                          # generate a public domain per service
railway domain -s customer-web
railway domain -s admin-web

# Environment variables (see table below)
railway variable set DATABASE_URL='${{Postgres.DATABASE_URL}}' -s api --skip-deploys
railway variable set JWT_SECRET=<generated>    -s api --skip-deploys
railway variable set CORS_ORIGINS=<customer-web + admin-web domains> -s api --skip-deploys
railway variable set VITE_API_URL=<api domain> -s customer-web --skip-deploys
railway variable set VITE_API_URL=<api domain> -s admin-web --skip-deploys

# Deploy each service. Railway reads build config from a railway.json at the
# root of the uploaded snapshot, so write it to point at one service's
# Dockerfile, deploy that service, then rewrite it for the next:
#   railway.json: { "build": { "builder": "DOCKERFILE", "dockerfilePath": "packages/api/Dockerfile" } }
railway up -s api --ci
#   rewrite dockerfilePath to packages/customer-web/Dockerfile, then:
railway up -s customer-web --ci
#   rewrite dockerfilePath to packages/admin-web/Dockerfile, then:
railway up -s admin-web --ci
# (railway.json is intentionally not committed: its dockerfilePath is
# service-specific, so it only exists transiently during each deploy.)

# Seed (or re-seed — the script truncates first) the deployed database, run
# locally against Postgres's public URL, since the private
# *.railway.internal hostname only resolves inside Railway's network:
DATABASE_URL=<Postgres DATABASE_PUBLIC_URL> npm run seed -w @parking/api
```

Redeploying after a code change is the same three `railway up` invocations
above from the new commit; the API image runs migrations automatically on
boot (`npm run migrate && node dist/main.js`), so a new migration (e.g. the
phase-2 `2_phase2.cjs`) is applied as part of the deploy with no separate
step. Re-run the seed command above afterward if the migration changed the
schema the seed data depends on.

Railway auto-injects a `PORT` environment variable into every service with a
public domain and proxies to it; the API already reads `process.env.PORT`
via `loadConfig`, and the frontend nginx containers pick it up through the
`envsubst` template, so no Dockerfile changes were needed to support this.

### Environment variables (Railway)

| Service | Variable | Value |
|---|---|---|
| `api` | `DATABASE_URL` | `${{Postgres.DATABASE_URL}}` (Railway variable reference, internal hostname) |
| `api` | `JWT_SECRET` | randomly generated 32-byte hex secret |
| `api` | `CORS_ORIGINS` | `https://<customer-web domain>,https://<admin-web domain>` |
| `customer-web` | `VITE_API_URL` (build arg) | `https://<api domain>` |
| `admin-web` | `VITE_API_URL` (build arg) | `https://<api domain>` |

`PORT` is not set explicitly for any service — it's injected by Railway at
runtime and every container is already wired to respect it.

### Live deployment

| Service | URL |
|---|---|
| API | https://api-production-116e.up.railway.app |
| customer-web | https://customer-web-production-1b84.up.railway.app |
| admin-web | https://admin-web-production-3abf.up.railway.app |

The deployed database is seeded with the same 6-lot / 30-day dataset
described above, plus the same admin credentials and demo card behavior.
