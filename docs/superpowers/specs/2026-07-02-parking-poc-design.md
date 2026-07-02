# Parking App POC — Design

**Date:** 2026-07-02
**Status:** Approved (user delegated judgment calls; throwaway POC)

## Overview

A full-stack parking management POC with two personas:

- **Customers** (mobile-first web): find nearby Chicago parking lots, reserve a spot, pay via a mock processor, receive a QR-coded receipt.
- **Admins** (desktop web): manage lots, watch a live dashboard, analyze 30 days of seeded historical data, export CSVs.

## Stack Decisions

| Concern | Choice | Rationale |
|---|---|---|
| Repo shape | npm-workspaces monorepo | Clean separation of API, two frontends, shared contracts |
| Backend | Node.js + Express + TypeScript | Spec default; mature middleware ecosystem |
| Database | PostgreSQL, `node-pg-migrate` migrations, `pg` driver | Spec requirement; no ORM — repositories own SQL, keeping domain pure |
| Frontends | Vite + React + TypeScript (two SPAs) | Fast dev loop; SPA is right-sized for a POC |
| Map | Leaflet + OpenStreetMap via `react-leaflet` | Free, no API key |
| Geocoding | Nominatim (OSM) public API | Free address→coords for search; no key |
| Charts | Recharts | Simple declarative line/bar charts |
| Auth | JWT (admin only), bcrypt password hash | Spec requirement; customers anonymous |
| Validation | Zod schemas at API boundary | Shared request/response contracts in `packages/shared` |
| Testing | Vitest (+ Supertest for HTTP) | Unit tests for domain, integration tests for API |
| Local dev | `docker-compose` Postgres | Zero-install DB |
| Deployment | Railway (API + 2 static frontends + managed Postgres) | One platform, container-ready |

## Monorepo Layout

```
park_n_stuff/
├── package.json              # npm workspaces root
├── docker-compose.yml        # local Postgres
├── packages/
│   ├── shared/               # Zod schemas, API contract types, shared utils
│   ├── api/                  # Express backend (clean architecture)
│   │   └── src/
│   │       ├── domain/           # entities, value objects, domain errors — zero deps
│   │       ├── application/      # use-case services, repository interfaces (ports)
│   │       ├── infrastructure/   # Postgres repositories, migrations, mock payment gateway
│   │       └── presentation/     # Express routes, controllers, middleware, error mapper
│   ├── customer-web/         # mobile-first React SPA
│   └── admin-web/            # desktop React SPA
```

Dependency rule: `presentation → application → domain`; `infrastructure` implements application ports. Domain imports nothing outside itself.

## Domain Model

- **Lot**: id, name, address, neighborhood, lat, lng, capacity, hourlyRateCents, status (`active` | `maintenance` | `deleted`), createdAt. Soft delete via status. Behavior: `availableSpaces(activeCount)`, `isReservable()`.
- **Reservation**: id, reservationNumber (`LOT-YYYYMMDD-XXXXX`), lotId, customerId, vehicleMake, vehicleModel, licensePlate, startTime, endTime, totalCostCents, status (`active` | `completed` | `cancelled`), createdAt. Behavior: cost calculation lives in `ReservationPricing` (hourlyRate × ceil(durationHours)); status transitions validated.
- **Customer**: id, name, email, phone. Upserted by email on reservation (anonymous flow, no login).
- **Payment**: id, reservationId, amountCents, status (`succeeded` | `declined`), transactionId, cardLast4, createdAt. Card data never stored beyond last4; never logged.
- **AdminUser**: id, email, passwordHash.

Money is integer cents everywhere. Times are UTC `timestamptz`; frontends render local (America/Chicago).

## Key Business Rules

1. **Cost**: `hourlyRateCents × ceil(durationMinutes / 60)`; minimum 1 hour billed.
2. **Capacity**: a reservation is rejected with `409 LOT_FULL` when active reservations overlapping the requested window ≥ capacity.
3. **Reservation number**: `LOT-YYYYMMDD-XXXXX` where XXXXX is a random base36 suffix, uniqueness enforced by DB constraint with retry.
4. **Mock payment**: 95% success. Deterministic override for demos/tests: card number ending `0002` always declines, ending `0001` always succeeds. Declined payment ⇒ no reservation persisted (single transaction).
5. **Reservation creation is atomic**: capacity check + customer upsert + reservation insert + payment record in one DB transaction with the capacity check done under lock (`SELECT ... FOR UPDATE` on lot row) to prevent oversell races.

## API Contract (all under `/api`)

| Method & Path | Auth | Purpose |
|---|---|---|
| `POST /admin/auth/login` | — | Returns JWT (30 min expiry) |
| `GET /lots?lat=&lng=&search=` | — | Active lots + current availability; optional distance sort / text filter |
| `GET /lots/:id` | — | Lot detail with availability |
| `POST /lots` | JWT | Create lot |
| `PUT /lots/:id` | JWT | Update lot (incl. status: maintenance) |
| `DELETE /lots/:id` | JWT | Soft delete |
| `POST /reservations` | — | Create reservation + mock payment (rate-limited) |
| `GET /reservations/:id` | — | Reservation + receipt data |
| `GET /admin/dashboard` | JWT | Today's revenue, active reservations, occupancy %, per-lot cards, last 10 reservations |
| `GET /admin/analytics?days=30` | JWT | Daily revenue series, hourly occupancy series (7d), hourly breakdown for a selected day |
| `GET /admin/analytics/export` | JWT | CSV of reservation history |

Error envelope: `{ error: { code: string, message: string, details?: [...] } }` with proper status codes (400 validation, 401 auth, 404 not found, 409 conflict/full, 402 payment declined, 500 fallback). Central error-mapping middleware translates domain errors → HTTP.

Zod schemas for every request/response live in `packages/shared` and are imported by both API (validation) and frontends (types + parsing).

## Frontend — Customer (mobile-first)

Screens (React Router):
1. **Home** — geolocation prompt; Leaflet map with lot pins + bottom-sheet list; search bar (Nominatim) overrides location.
2. **Lot detail** — capacity bar, rate, address, "Reserve" CTA.
3. **Reservation form** — personal info, vehicle, duration presets (30m/1h/2h/4h/8h) or custom start/end; live cost preview.
4. **Payment** — mock card form (Luhn-checked number, expiry, CVC), processing spinner (~1.5s artificial delay), decline handling with retry.
5. **Confirmation** — reservation number, QR code (`qrcode.react` encoding the reservation number), lot address + "Get directions" link, cost summary.

State: React Query for server state; form state local. Errors surfaced inline (lot full, declined, network).

## Frontend — Admin (desktop)

1. **Login** — email/password → JWT stored in memory + sessionStorage; auto-logout after 30 min idle.
2. **Dashboard** — metric cards (revenue today, active reservations, avg occupancy), per-lot capacity gauges, recent-activity feed; polls every 15s.
3. **Lot management** — table with edit/delete (confirm dialogs), add/edit modal, bulk "mark maintenance".
4. **Analytics** — line chart (occupancy % by hour, last 7 days), bar chart (daily revenue, last 30 days), day-drilldown table, CSV export button.

## Seeding

`npm run seed` (idempotent — truncates and repopulates):
- 6 Chicago lots: Loop, River North, West Loop, Wicker Park, Lincoln Park, Hyde Park — capacities 40–250, rates $2.50–$12/hr.
- 30 days of reservations with weekday peaks (8–9a, 12–1p, 5–6p), lighter weekends, ~70–90% peak utilization at downtown lots; mix of completed/cancelled plus currently-active ones.
- Admin user `admin@parknstuff.dev` / `admin123` (bcrypt-hashed).

## Security (POC level)

- JWT middleware on all `/admin/*` + lot mutations; secret via env var.
- Zod validation on every endpoint; rate limiting (`express-rate-limit`) on `POST /reservations`.
- bcrypt for admin password; no card numbers stored or logged (last4 only).
- Helmet, CORS restricted to frontend origins via env.

## Testing Strategy (TDD)

- **Domain unit tests**: pricing (rounding, minimum), capacity rules, reservation-number format, status transitions, payment gateway determinism.
- **Application service tests**: use cases against in-memory repository fakes.
- **API integration tests**: Supertest against the Express app with a real Postgres test database (docker-compose) — happy paths + error envelopes + auth gates + oversell race (concurrent reservations).
- Frontends: light component tests for cost preview + form validation; not exhaustive (POC).

## Deployment (Railway)

- `Dockerfile` for API (multi-stage TS build); frontends built to static and served via Railway static services (or nginx containers). Managed Postgres addon.
- Env vars: `DATABASE_URL`, `JWT_SECRET`, `CORS_ORIGINS`, `VITE_API_URL`.
- README documents local setup, seeding, tests, and Railway deploy steps.

## Build Order

1. Monorepo scaffolding + shared contracts + docker-compose + migrations
2. Domain layer (TDD)
3. Application services + infrastructure repositories (TDD)
4. HTTP layer + auth + integration tests
5. Seed script
6. Customer frontend
7. Admin frontend
8. Dockerfiles + README + deploy config
