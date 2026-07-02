# Parking App POC Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build a deployable parking management POC — Express/TS API with clean architecture over Postgres, a mobile-first customer React SPA (find lot → reserve → mock pay → QR receipt), and a desktop admin React SPA (lot CRUD, live dashboard, analytics, CSV export), seeded with 6 Chicago lots and 30 days of history.

**Architecture:** npm-workspaces monorepo. API follows clean architecture: `domain` (pure entities/rules) ← `application` (use cases + repository ports) ← `infrastructure` (Postgres repos, mock payment) and `presentation` (Express). Shared Zod contracts in `packages/shared` are the single source of truth for API types, consumed by API validation and both frontends.

**Tech Stack:** Node 20+, TypeScript 5, Express 4, pg + node-pg-migrate, Zod, jsonwebtoken + bcryptjs, express-rate-limit, helmet, cors, Vitest + Supertest, Vite + React 18 + TypeScript, React Router, @tanstack/react-query, react-leaflet + leaflet, recharts, qrcode.react, docker-compose Postgres 16.

## Global Constraints

- Money is **integer cents** everywhere (`hourlyRateCents`, `totalCostCents`, `amountCents`). Never floats.
- Timestamps are UTC `timestamptz` in DB and ISO-8601 strings over the wire; frontends render in browser-local time.
- Error envelope for ALL API errors: `{ "error": { "code": string, "message": string, "details"?: unknown } }`.
- Dependency rule: `domain` imports nothing outside `domain`. `application` imports only `domain`. `infrastructure`/`presentation` may import `application` + `domain`. Nothing imports from `presentation`.
- All request bodies/queries validated with Zod schemas from `@parking/shared` before reaching services.
- Never store or log full card numbers — only `cardLast4`.
- TDD: every task writes failing tests first, then implements, then commits. Run tests with `npm test -w @parking/api` (Vitest). Save test output to a file when running full suites (e.g. `npm test -w @parking/api 2>&1 | tee /tmp/test-run.log`).
- No AI/Claude attribution in commit messages.
- macOS host: the `timeout` command does not exist — never use it.
- Node test env vars: integration tests use `DATABASE_URL=postgres://parking:parking@localhost:5433/parking_test`.

---

### Task 1: Monorepo scaffold + shared contracts package

**Files:**
- Create: `package.json` (root), `tsconfig.base.json`, `.gitignore`, `.env.example`, `docker-compose.yml`
- Create: `packages/shared/package.json`, `packages/shared/tsconfig.json`, `packages/shared/src/index.ts`, `packages/shared/src/contracts.ts`
- Test: `packages/shared/src/contracts.test.ts`

**Interfaces:**
- Produces: package name `@parking/shared` exporting every schema/type below. ALL later tasks import contracts from here. These exact names are load-bearing.

**Step 1: Root scaffold.** Create root `package.json`:

```json
{
  "name": "park-n-stuff",
  "private": true,
  "workspaces": ["packages/*"],
  "scripts": {
    "build": "npm run build --workspaces --if-present",
    "test": "npm test --workspaces --if-present"
  }
}
```

`tsconfig.base.json`: `strict: true`, `target: ES2022`, `module: NodeNext` (packages override module for frontends), `esModuleInterop: true`, `skipLibCheck: true`.

`docker-compose.yml`: two Postgres 16 services — `db` on port `5432` (POSTGRES_USER/PASSWORD/DB all `parking`), `db_test` on port `5433` (db `parking_test`, same creds).

`.gitignore`: `node_modules`, `dist`, `.env`, `*.log`.
`.env.example`: `DATABASE_URL=postgres://parking:parking@localhost:5432/parking`, `JWT_SECRET=dev-secret-change-me`, `PORT=3000`, `CORS_ORIGINS=http://localhost:5173,http://localhost:5174`.

**Step 2: Shared package.** `packages/shared/package.json` name `@parking/shared`, `main: dist/index.js`, `types: dist/index.d.ts`, scripts `build: tsc`, `test: vitest run`. Dep: `zod`. DevDep: `vitest`, `typescript`.

**Step 3: Write failing contract tests** (`contracts.test.ts`) — representative assertions:

```ts
import { describe, it, expect } from 'vitest';
import { CreateReservationRequestSchema, LotSchema, CreateLotRequestSchema } from './contracts';

it('rejects reservation with invalid email', () => {
  const r = CreateReservationRequestSchema.safeParse({ /* valid body but email: 'nope' */ });
  expect(r.success).toBe(false);
});
it('accepts a valid lot', () => {
  expect(LotSchema.safeParse({
    id: 'a2f4…uuid', name: 'Loop Garage', address: '1 W Adams St, Chicago, IL',
    neighborhood: 'Loop', lat: 41.879, lng: -87.63, capacity: 100,
    hourlyRateCents: 1200, status: 'active', availableSpaces: 42, createdAt: new Date().toISOString(),
  }).success).toBe(true);
});
it('rejects lot with zero capacity', () => { /* capacity: 0 → success false */ });
```

**Step 4: Implement `contracts.ts`.** Exact exports (schemas + inferred types via `z.infer`):

```ts
export const LotStatusSchema = z.enum(['active', 'maintenance', 'deleted']);
export const LotSchema = z.object({
  id: z.string().uuid(), name: z.string(), address: z.string(), neighborhood: z.string(),
  lat: z.number(), lng: z.number(), capacity: z.number().int().positive(),
  hourlyRateCents: z.number().int().positive(), status: LotStatusSchema,
  availableSpaces: z.number().int().min(0), createdAt: z.string(),
});
export const CreateLotRequestSchema = z.object({
  name: z.string().min(1).max(120), address: z.string().min(1).max(300),
  neighborhood: z.string().min(1).max(80), lat: z.number().min(-90).max(90),
  lng: z.number().min(-180).max(180), capacity: z.number().int().positive().max(10000),
  hourlyRateCents: z.number().int().positive().max(100000),
});
export const UpdateLotRequestSchema = CreateLotRequestSchema.partial().extend({
  status: z.enum(['active', 'maintenance']).optional(),
});
export const CreateReservationRequestSchema = z.object({
  lotId: z.string().uuid(),
  customer: z.object({ name: z.string().min(1).max(120), email: z.string().email(), phone: z.string().min(7).max(20) }),
  vehicle: z.object({ make: z.string().min(1).max(60), model: z.string().min(1).max(60), licensePlate: z.string().min(2).max(12) }),
  startTime: z.string().datetime(), endTime: z.string().datetime(),
  payment: z.object({ cardNumber: z.string().regex(/^\d{13,19}$/), expiry: z.string().regex(/^(0[1-9]|1[0-2])\/\d{2}$/), cvc: z.string().regex(/^\d{3,4}$/), cardholderName: z.string().min(1) }),
}).refine(d => new Date(d.endTime) > new Date(d.startTime), { message: 'endTime must be after startTime' });
export const ReservationStatusSchema = z.enum(['active', 'completed', 'cancelled']);
export const ReservationSchema = z.object({
  id: z.string().uuid(), reservationNumber: z.string(), lotId: z.string().uuid(),
  lotName: z.string(), lotAddress: z.string(),
  customerName: z.string(), vehicleMake: z.string(), vehicleModel: z.string(), licensePlate: z.string(),
  startTime: z.string(), endTime: z.string(), totalCostCents: z.number().int(),
  status: ReservationStatusSchema, cardLast4: z.string(), createdAt: z.string(),
});
export const LoginRequestSchema = z.object({ email: z.string().email(), password: z.string().min(1) });
export const LoginResponseSchema = z.object({ token: z.string(), expiresInSeconds: z.number() });
export const DashboardResponseSchema = z.object({
  revenueTodayCents: z.number().int(), activeReservations: z.number().int(), averageOccupancyPct: z.number(),
  lots: z.array(z.object({ lotId: z.string(), name: z.string(), capacity: z.number(), occupied: z.number(), revenueTodayCents: z.number() })),
  recentReservations: z.array(z.object({ reservationNumber: z.string(), lotName: z.string(), startTime: z.string(), endTime: z.string(), totalCostCents: z.number(), createdAt: z.string() })),
});
export const AnalyticsResponseSchema = z.object({
  dailyRevenue: z.array(z.object({ date: z.string(), revenueCents: z.number().int(), reservations: z.number().int() })),
  hourlyOccupancy: z.array(z.object({ date: z.string(), hour: z.number().int(), occupancyPct: z.number() })),
});
export const DayBreakdownResponseSchema = z.object({
  rows: z.array(z.object({ hour: z.number().int(), reservations: z.number().int(), revenueCents: z.number().int(), occupancyPct: z.number() })),
});
export const ErrorResponseSchema = z.object({ error: z.object({ code: z.string(), message: z.string(), details: z.unknown().optional() }) });
```

`index.ts` re-exports everything from `contracts.ts`.

**Step 5:** `npm install`, run `npm test -w @parking/shared` → PASS. Commit: `feat: monorepo scaffold + shared API contracts`.

---

### Task 2: API package scaffold, migrations, DB module

**Files:**
- Create: `packages/api/package.json`, `packages/api/tsconfig.json`, `packages/api/vitest.config.ts`
- Create: `packages/api/migrations/1_init.js` (node-pg-migrate)
- Create: `packages/api/src/infrastructure/db.ts`
- Test: `packages/api/src/infrastructure/db.integration.test.ts`

**Interfaces:**
- Produces: `db.ts` exports `createPool(databaseUrl: string): pg.Pool` and `withTransaction<T>(pool: Pool, fn: (client: PoolClient) => Promise<T>): Promise<T>` (BEGIN/COMMIT, ROLLBACK on throw). Migration commands: `npm run migrate -w @parking/api` (uses `DATABASE_URL`).

**Step 1:** Package `@parking/api`. Deps: `express@4`, `pg`, `zod`, `jsonwebtoken`, `bcryptjs`, `express-rate-limit`, `helmet`, `cors`, `@parking/shared`. DevDeps: `node-pg-migrate`, `vitest`, `supertest`, `tsx`, `typescript`, `@types/*`. Scripts: `dev: tsx watch src/main.ts`, `build: tsc`, `start: node dist/main.js`, `migrate: node-pg-migrate up -m migrations`, `test: vitest run`, `seed: tsx src/infrastructure/seed/run.ts`.

**Step 2: Migration `1_init.js`** — tables (all PKs `uuid DEFAULT gen_random_uuid()`):
- `lots`: name text, address text, neighborhood text, lat double precision, lng double precision, capacity int CHECK (capacity > 0), hourly_rate_cents int CHECK (> 0), status text DEFAULT 'active' CHECK (status IN ('active','maintenance','deleted')), created_at timestamptz DEFAULT now().
- `customers`: name text, email text UNIQUE, phone text, created_at timestamptz.
- `admin_users`: email text UNIQUE, password_hash text, created_at timestamptz.
- `reservations`: reservation_number text UNIQUE, lot_id uuid REFERENCES lots, customer_id uuid REFERENCES customers, vehicle_make text, vehicle_model text, license_plate text, start_time timestamptz, end_time timestamptz, total_cost_cents int, status text CHECK (status IN ('active','completed','cancelled')), created_at timestamptz DEFAULT now(). Indexes: `(lot_id, status)`, `(start_time)`, `(created_at)`.
- `payments`: reservation_id uuid REFERENCES reservations, amount_cents int, status text CHECK (status IN ('succeeded','declined')), transaction_id text, card_last4 text, created_at timestamptz DEFAULT now().

**Step 3: Failing integration test** — `withTransaction` commits on success, rolls back on throw (insert a lot, throw, assert absent). Requires `docker compose up -d db_test` + migrate against test DB. **Step 4:** implement `db.ts`. **Step 5:** tests pass → commit `feat: api scaffold, schema migrations, db module`.

---

### Task 3: Domain layer (pure, TDD)

**Files:**
- Create: `packages/api/src/domain/errors.ts`, `domain/pricing.ts`, `domain/reservationNumber.ts`, `domain/lot.ts`
- Test: `packages/api/src/domain/pricing.test.ts`, `domain/reservationNumber.test.ts`, `domain/lot.test.ts`

**Interfaces:**
- Produces:
  - `errors.ts`: `export class DomainError extends Error { constructor(public code: string, message: string, public httpStatus: number) }` and subclasses `LotNotFoundError` (`LOT_NOT_FOUND`, 404), `LotFullError` (`LOT_FULL`, 409), `LotNotReservableError` (`LOT_NOT_RESERVABLE`, 409), `PaymentDeclinedError` (`PAYMENT_DECLINED`, 402), `InvalidCredentialsError` (`INVALID_CREDENTIALS`, 401), `ValidationError` (`VALIDATION_ERROR`, 400).
  - `pricing.ts`: `export function calculateCostCents(hourlyRateCents: number, startTime: Date, endTime: Date): number` — `hourlyRateCents * Math.max(1, Math.ceil(minutes/60))`; throws `ValidationError` if end <= start.
  - `reservationNumber.ts`: `export function generateReservationNumber(now: Date, random?: () => number): string` → `LOT-YYYYMMDD-XXXXX` (XXXXX = 5 uppercase base36 chars from injected `random`, default `Math.random`).
  - `lot.ts`: `export function isReservable(status: LotStatus): boolean` (only `'active'`); `export function availableSpaces(capacity: number, activeCount: number): number` (clamped ≥ 0).

**Steps (TDD):** failing tests → implement → pass → commit `feat: domain layer — pricing, reservation numbers, lot rules`.

Required test cases: 90 min @ $10/hr → 2000¢; exactly 60 min → 1000¢; 61 min → 2000¢; 10 min → minimum 1 hour (1000¢); end==start throws; reservation number matches `/^LOT-\d{8}-[A-Z0-9]{5}$/` and uses the passed date (e.g. 2026-07-02 → `LOT-20260702-`); deterministic with injected random; `isReservable('maintenance') === false`; `availableSpaces(10, 12) === 0`.

---

### Task 4: Application layer — ports + use cases (TDD with in-memory fakes)

**Files:**
- Create: `packages/api/src/application/ports.ts`, `application/createReservation.ts`, `application/lotService.ts`
- Test: `packages/api/src/application/createReservation.test.ts`, `application/lotService.test.ts`
- Create: `packages/api/src/application/testing/fakes.ts` (in-memory fakes used by tests)

**Interfaces:**
- Produces (`ports.ts`):

```ts
export interface LotRecord { id: string; name: string; address: string; neighborhood: string; lat: number; lng: number; capacity: number; hourlyRateCents: number; status: 'active'|'maintenance'|'deleted'; createdAt: Date; }
export interface ReservationRecord { id: string; reservationNumber: string; lotId: string; customerId: string; vehicleMake: string; vehicleModel: string; licensePlate: string; startTime: Date; endTime: Date; totalCostCents: number; status: 'active'|'completed'|'cancelled'; createdAt: Date; }
export interface LotRepository {
  findAllActive(): Promise<Array<LotRecord & { activeReservations: number }>>;
  findById(id: string): Promise<(LotRecord & { activeReservations: number }) | null>;
  create(data: Omit<LotRecord, 'id'|'createdAt'|'status'>): Promise<LotRecord>;
  update(id: string, data: Partial<Omit<LotRecord, 'id'|'createdAt'>>): Promise<LotRecord | null>;
  softDelete(id: string): Promise<boolean>;
}
export interface ReservationUnitOfWork {
  // Runs fn transactionally with the lot row locked; countActiveOverlapping counts
  // status='active' reservations overlapping [start,end) for the lot.
  execute<T>(lotId: string, fn: (txn: ReservationTxn) => Promise<T>): Promise<T>;
}
export interface ReservationTxn {
  getLotForUpdate(lotId: string): Promise<LotRecord | null>;
  countActiveOverlapping(lotId: string, start: Date, end: Date): Promise<number>;
  upsertCustomer(c: { name: string; email: string; phone: string }): Promise<{ id: string }>;
  insertReservation(r: Omit<ReservationRecord, 'id'|'createdAt'>): Promise<ReservationRecord>;
  insertPayment(p: { reservationId: string; amountCents: number; status: 'succeeded'|'declined'; transactionId: string; cardLast4: string }): Promise<void>;
}
export interface ReservationRepository {
  findByIdWithDetails(id: string): Promise<(ReservationRecord & { lotName: string; lotAddress: string; customerName: string; cardLast4: string }) | null>;
}
export interface PaymentGateway {
  charge(input: { cardNumber: string; amountCents: number }): Promise<{ success: boolean; transactionId: string }>;
}
export interface Clock { now(): Date; }
```

- Produces (`createReservation.ts`): `export class CreateReservationService { constructor(uow: ReservationUnitOfWork, gateway: PaymentGateway, clock: Clock) {} async execute(req: CreateReservationRequest): Promise<{ reservationId: string }> }`. Logic order inside `uow.execute`: load lot (`LotNotFoundError` if null/deleted) → `isReservable` check (`LotNotReservableError`) → overlap count vs capacity (`LotFullError`) → `calculateCostCents` → `gateway.charge` (`PaymentDeclinedError` on failure — thrown inside txn so nothing persists) → upsert customer → insert reservation with `generateReservationNumber(clock.now())` → insert payment with `cardLast4 = cardNumber.slice(-4)`.
- Produces (`lotService.ts`): `LotService` with `list()`, `getById(id)` (each mapping to shared `Lot` shape with `availableSpaces`), `create(req: CreateLotRequest)`, `update(id, req: UpdateLotRequest)` (`LotNotFoundError` if missing), `remove(id)`.

**Required tests (against fakes):** happy path persists reservation+payment and returns id; lot at capacity → `LotFullError` and nothing persisted; maintenance lot → `LotNotReservableError`; declined charge → `PaymentDeclinedError`, nothing persisted; cost matches pricing rules; unknown lot → `LotNotFoundError`; lot list excludes deleted lots and computes availableSpaces.

Commit: `feat: application services with repository ports`.

---

### Task 5: Infrastructure — Postgres repositories + mock payment gateway (TDD, integration)

**Files:**
- Create: `packages/api/src/infrastructure/postgres/lotRepository.ts`, `postgres/reservationUnitOfWork.ts`, `postgres/reservationRepository.ts`, `postgres/adminUserRepository.ts`
- Create: `packages/api/src/infrastructure/mockPaymentGateway.ts`
- Test: `packages/api/src/infrastructure/postgres/repositories.integration.test.ts`, `packages/api/src/infrastructure/mockPaymentGateway.test.ts`

**Interfaces:**
- Consumes: all port interfaces from Task 4; `withTransaction`/`createPool` from Task 2.
- Produces: `PostgresLotRepository`, `PostgresReservationUnitOfWork` (uses `SELECT … FROM lots WHERE id=$1 FOR UPDATE`), `PostgresReservationRepository`, `PostgresAdminUserRepository` (`findByEmail(email): Promise<{id,email,passwordHash}|null>`, `create(email, passwordHash)`), `MockPaymentGateway implements PaymentGateway`.

**MockPaymentGateway rules (exact):** card ending `0002` → always declined; ending `0001` → always success; otherwise success when `random() < 0.95` (random injected via constructor, default `Math.random`). `transactionId` = `txn_` + 12 base36 chars.

**Required integration tests:** lot CRUD roundtrip incl. soft delete filtered from `findAllActive`; overlap counting (reservation 10:00–12:00 overlaps query 11:00–13:00, not 12:00–14:00); customer upsert by email updates name/phone, reuses id; **oversell race**: capacity-1 lot, two concurrent `uow.execute` reservation attempts → exactly one succeeds (assert via `Promise.allSettled`); payment gateway determinism for `…0001`/`…0002` and injected-random behavior. Tests truncate tables in `beforeEach` against `parking_test` DB.

Commit: `feat: postgres repositories and mock payment gateway`.

---

### Task 6: HTTP layer — Express app, public routes, error mapping (integration TDD)

**Files:**
- Create: `packages/api/src/presentation/app.ts` (exports `createApp(deps): express.Express` for testability), `presentation/middleware/errorHandler.ts`, `presentation/middleware/validate.ts`, `presentation/routes/lots.ts`, `presentation/routes/reservations.ts`, `packages/api/src/main.ts` (composition root: pool, repos, services, `app.listen`), `packages/api/src/config.ts` (env parsing: `DATABASE_URL`, `JWT_SECRET`, `PORT`, `CORS_ORIGINS`)
- Test: `packages/api/src/presentation/routes.integration.test.ts`

**Interfaces:**
- Consumes: services from Task 4, repos/gateway from Task 5, shared schemas.
- Produces: `createApp({ lotService, createReservationService, reservationRepository, adminUserRepository, jwtSecret }): Express`. Routes: `GET /api/lots` (supports `?lat=&lng=` → sorted by haversine distance, and `?search=` → case-insensitive match on name/address/neighborhood), `GET /api/lots/:id`, `POST /api/reservations` (rate-limited 10/min/IP), `GET /api/reservations/:id` (returns shared `Reservation` shape). Health: `GET /api/health` → `{ok:true}`.
- Error handler maps `DomainError → { status: e.httpStatus, body: { error: { code, message } } }`; ZodError → 400 `VALIDATION_ERROR` with `details`; unknown → 500 `INTERNAL_ERROR` (message not leaked). App uses `helmet()`, `cors({ origin: CORS_ORIGINS.split(',') })`, `express.json()`.

**Required tests (Supertest + real test DB):** create reservation end-to-end 201 with reservation number format; full lot → 409 `LOT_FULL` envelope; card `…0002` → 402 `PAYMENT_DECLINED`; invalid body → 400 with Zod details; unknown lot GET → 404; `?search=loop` filters; `?lat/lng` sorts nearest-first (seed two lots in test).

Commit: `feat: http layer with public lot and reservation routes`.

---

### Task 7: Admin auth + protected lot mutations

**Files:**
- Create: `packages/api/src/application/authService.ts`, `presentation/middleware/requireAdmin.ts`, `presentation/routes/adminAuth.ts`
- Modify: `presentation/routes/lots.ts` (add `POST/PUT/DELETE` guarded by `requireAdmin`), `presentation/app.ts`
- Test: extend `routes.integration.test.ts` (or new `admin.integration.test.ts`)

**Interfaces:**
- Produces: `AuthService.login(email, password): Promise<{ token, expiresInSeconds }>` — bcrypt compare, `InvalidCredentialsError` on mismatch, JWT `{ sub: adminId, email }`, HS256, **expiresIn 1800** (30 min). `requireAdmin(jwtSecret)` middleware → 401 `UNAUTHORIZED` envelope when header missing/invalid/expired.

**Required tests:** login with seeded admin (bcrypt hash inserted in test setup) → token; wrong password → 401 `INVALID_CREDENTIALS`; `POST /api/lots` without token → 401; with token → 201 and visible in `GET /api/lots`; `PUT` updates rate; `DELETE` soft-deletes (gone from list, still 200 direct-fetchable? — no: `GET /api/lots/:id` on deleted lot → 404); expired/garbage token → 401.

Commit: `feat: admin JWT auth and protected lot management`.

---

### Task 8: Admin dashboard + analytics endpoints + CSV export

**Files:**
- Create: `packages/api/src/application/analyticsService.ts`, `packages/api/src/infrastructure/postgres/analyticsRepository.ts`, `presentation/routes/admin.ts`
- Modify: `presentation/app.ts`
- Test: `packages/api/src/presentation/adminAnalytics.integration.test.ts`

**Interfaces:**
- Produces routes (all `requireAdmin`):
  - `GET /api/admin/dashboard` → `DashboardResponse`. Revenue today = sum of succeeded payments where `payments.created_at::date = today (UTC)`. Active reservations = status 'active' AND `now() BETWEEN start_time AND end_time`. `averageOccupancyPct` = mean over active lots of `occupied/capacity*100`. `recentReservations` = 10 newest by created_at.
  - `GET /api/admin/analytics?days=30` → `AnalyticsResponse` (daily revenue for N days; hourlyOccupancy for last 7 days: for each date×hour, occupancy % = avg reservations overlapping that hour across lots / total capacity × 100).
  - `GET /api/admin/analytics/day/:date` → `DayBreakdownResponse` (24 rows).
  - `GET /api/admin/analytics/export` → `text/csv` attachment `reservations.csv`, columns: `reservation_number,lot_name,start_time,end_time,status,total_cost_usd,created_at`.
- `AnalyticsRepository` owns the SQL (GROUP BY date_trunc / generate_series); service shapes the response.

**Required tests:** with hand-inserted fixtures (2 lots, known reservations/payments across 2 days) assert exact revenue sums, active counts, occupancy math, CSV header + row count, and that all four routes 401 without JWT.

Commit: `feat: admin dashboard, analytics, csv export`.

---

### Task 9: Seed script

**Files:**
- Create: `packages/api/src/infrastructure/seed/run.ts`, `seed/lots.ts` (static lot data), `seed/generateHistory.ts`
- Test: `packages/api/src/infrastructure/seed/generateHistory.test.ts`

**Interfaces:**
- Consumes: `createPool`; direct SQL inserts are fine here.
- Produces: `npm run seed -w @parking/api` — idempotent (TRUNCATE lots/customers/reservations/payments/admin_users CASCADE, then insert).

**Seed data (exact):**
- Admin: `admin@parknstuff.dev` / `admin123` (bcrypt, 10 rounds).
- 6 lots: Loop Premier Garage (Loop, 41.8790,-87.6298, cap 250, $12/hr), River North Self Park (41.8925,-87.6350, cap 180, $10/hr), West Loop Lot (41.8820,-87.6520, cap 120, $8/hr), Wicker Park Lot (41.9088,-87.6796, cap 80, $5/hr), Lincoln Park Garage (41.9214,-87.6513, cap 100, $6/hr), Hyde Park Lot (41.7943,-87.5907, cap 60, $2.50/hr).
- `generateHistory(lots, now, random): SeedReservation[]` (pure, testable): for each of the past 30 days × lot, generate reservations with hourly weights — peak hours 8,9,12,13,17,18 get weight ~3×; weekends ×0.5; downtown lots (Loop/River North/West Loop) target 70–90% utilization at peaks, neighborhood lots 40–60%. Durations sampled from [1,2,4,8] hours. ~92% completed, ~8% cancelled (cancelled ⇒ no revenue: payment still `succeeded` then reservation cancelled — keep simple: cancelled reservations DO have succeeded payments; revenue queries in Task 8 count payments, so cancelled still counted — **decision: revenue = succeeded payments regardless of later cancellation**). Also create 6–12 currently-active reservations spanning `now`. 30 customers reused round-robin.
- Print summary: lots, reservations, revenue total.

**Required tests (pure generator, injected random+now):** every reservation within past 30 days; peak-hour count > off-peak count for a downtown lot; no lot-hour exceeds capacity; deterministic with seeded random.

Commit: `feat: seed script with 6 chicago lots and 30 days of history`.

---

### Task 10: Customer web — scaffold, API client, home/search/map

**Files:**
- Create: `packages/customer-web/` via Vite react-ts template: `package.json` (name `@parking/customer-web`), `vite.config.ts` (dev port **5173**, `server.proxy: { '/api': 'http://localhost:3000' }`), `index.html`, `src/main.tsx`, `src/App.tsx` (Router + QueryClientProvider)
- Create: `src/api/client.ts`, `src/pages/HomePage.tsx`, `src/components/LotMap.tsx`, `src/components/LotList.tsx`, `src/components/SearchBar.tsx`, `src/hooks/useGeolocation.ts`, `src/api/geocode.ts`
- Test: `src/api/client.test.ts` (fetch wrapper error envelope parsing)

**Interfaces:**
- Consumes: `GET /api/lots?lat&lng&search`, shared `Lot` type from `@parking/shared`.
- Produces: `apiFetch<T>(path, init?): Promise<T>` — throws `ApiError { code, message, status }` parsed from the error envelope; used by all customer pages. `geocode(query): Promise<{lat,lng,label} | null>` calling `https://nominatim.openstreetmap.org/search?format=json&limit=1&q=…` with a `User-Agent`-safe fetch.

**Behavior:** HomePage requests geolocation on mount (`useGeolocation` — states: idle/granted/denied). Granted → center Leaflet map on user, fetch `/api/lots?lat&lng`; denied → default center Chicago Loop (41.8781,-87.6298) and show search prompt. Map pins per lot with popup (name, $rate/hr, X spaces) linking to `/lots/:id`; below map a scrollable `LotList` (name, neighborhood, availability badge green/amber/red by % free, rate). SearchBar geocodes then re-fetches sorted by the searched point. Mobile-first: map ~45vh, list below; single column; touch targets ≥44px. Leaflet CSS imported; marker icon fix applied (known Vite/Leaflet issue — use `leaflet/dist/images` imports for `L.Icon.Default`).

Commit: `feat: customer app with lot discovery map and search`.

---

### Task 11: Customer web — lot detail, reservation form, payment, confirmation

**Files:**
- Create: `src/pages/LotDetailPage.tsx`, `src/pages/ReservePage.tsx`, `src/pages/PaymentPage.tsx`, `src/pages/ConfirmationPage.tsx`, `src/components/CapacityBar.tsx`, `src/components/DurationPicker.tsx`, `src/lib/pricing.ts`, `src/lib/reservationDraft.ts`
- Test: `src/lib/pricing.test.ts`, `src/components/DurationPicker.test.tsx` (Vitest + @testing-library/react)

**Interfaces:**
- Consumes: `POST /api/reservations`, `GET /api/reservations/:id`, `apiFetch`.
- Produces: `estimateCostCents(hourlyRateCents, startISO, endISO)` mirroring server rule (ceil hours, min 1) — unit-tested to match Task 3 cases. `reservationDraft.ts`: typed draft held in React context (lot, customer, vehicle, times) passed across form→payment.

**Behavior:**
- LotDetail: `CapacityBar` (available/capacity with color), rate, address, Reserve button (disabled + "Lot full" when 0 available or status maintenance).
- ReservePage: customer fields, vehicle fields, `DurationPicker` — preset chips `30m/1h/2h/4h/8h` (start = now) OR custom datetime-local start/end; live cost preview updates on change; client-side validation mirrors Zod (email format, plate length); Continue → PaymentPage.
- PaymentPage: card form (number with Luhn check + spacing, expiry MM/YY, CVC, name), shows total; on submit: 1.5s artificial delay + spinner, then `POST /api/reservations`; 402 → inline "Card declined — try another card" (form retained, retry allowed); 409 LOT_FULL → error state linking back to home; network error → generic retry banner. Test hint displayed in small print: "Demo: card ending 0002 always declines."
- ConfirmationPage: fetch reservation by id from navigation state; show big reservation number, `<QRCodeSVG value={reservationNumber}/>`, lot name+address, Google Maps directions link (`https://maps.google.com/?q=` + encoded address), time range, total. "Book another spot" → home.

Commit: `feat: customer reservation, mock payment, and QR confirmation flow`.

---

### Task 12: Admin web — scaffold, login, dashboard

**Files:**
- Create: `packages/admin-web/` Vite react-ts (name `@parking/admin-web`, dev port **5174**, same `/api` proxy)
- Create: `src/api/client.ts` (JWT-aware `apiFetch` — reads token from `sessionStorage`, adds `Authorization: Bearer`, on 401 clears token + redirects to `/login`), `src/auth/AuthContext.tsx` (login/logout, **30-min idle timeout**: reset timer on user events, logout on expiry), `src/pages/LoginPage.tsx`, `src/pages/DashboardPage.tsx`, `src/components/MetricCard.tsx`, `src/components/LotGauge.tsx`, `src/components/ActivityFeed.tsx`, `src/components/Layout.tsx` (sidebar nav: Dashboard / Lots / Analytics, logout button)
- Test: `src/api/client.test.ts` (adds auth header; 401 handling)

**Interfaces:**
- Consumes: `POST /api/admin/auth/login`, `GET /api/admin/dashboard`, shared `DashboardResponse`.
- Produces: `useDashboard()` React Query hook with `refetchInterval: 15000`.

**Behavior:** Login form → store token → redirect to dashboard; all routes except `/login` wrapped in auth guard. Dashboard: three `MetricCard`s (Revenue today `$X.XX`, Active reservations, Avg occupancy %), grid of `LotGauge` cards (occupied/capacity progress bar + revenue today), `ActivityFeed` of last 10 reservations (relative times). Desktop layout, data refreshes every 15s without flicker (React Query `placeholderData: keepPreviousData`).

Commit: `feat: admin app with login and live dashboard`.

---

### Task 13: Admin web — lot management + analytics + export

**Files:**
- Create: `src/pages/LotsPage.tsx`, `src/components/LotFormModal.tsx`, `src/components/ConfirmDialog.tsx`, `src/pages/AnalyticsPage.tsx`, `src/components/charts/OccupancyLineChart.tsx`, `src/components/charts/RevenueBarChart.tsx`, `src/components/DayBreakdownTable.tsx`
- Test: `src/components/LotFormModal.test.tsx` (validation: rejects empty name, non-positive capacity/rate; submits cents conversion — user types dollars, modal converts `$8.50` → `850`)

**Interfaces:**
- Consumes: lot CRUD endpoints, `GET /api/admin/analytics`, `/analytics/day/:date`, `/analytics/export`.

**Behavior:**
- LotsPage: table (name, neighborhood, capacity, rate $, status badge, occupancy) with row actions Edit/Delete; checkbox column + bulk action "Mark maintenance" / "Mark active"; Add Lot button → `LotFormModal` (create+edit modes, dollar input converted to cents); Delete and bulk actions require `ConfirmDialog`. Mutations invalidate the lots query.
- AnalyticsPage: `OccupancyLineChart` (recharts LineChart, X = hour 0–23, one line per day for last 7 days, Y = occupancy %), `RevenueBarChart` (X = date, Y = revenue $, 30 days), date picker → `DayBreakdownTable` (24 hourly rows: reservations, revenue, utilization %). Export button downloads CSV via authenticated fetch → blob → anchor download.

Commit: `feat: admin lot management and analytics with csv export`.

---

### Task 14: Docker, Railway config, README, final verification

**Files:**
- Create: `packages/api/Dockerfile` (multi-stage: build workspace incl. shared → run `node dist/main.js`; runs migrations on boot via `npm run migrate && node dist/main.js` start command), `packages/customer-web/Dockerfile` + `packages/admin-web/Dockerfile` (build → nginx static with SPA fallback `try_files $uri /index.html`), `nginx.conf` per frontend, `railway.md` notes or `railway.json` if straightforward
- Create: `README.md` (root)
- Modify: frontends read `VITE_API_URL` (fallback `''` = same-origin proxy) in their `client.ts`

**README must cover:** what it is + screenshots-optional; prerequisites (Node 20+, Docker); quickstart (`docker compose up -d db`, `npm install`, `npm run migrate -w @parking/api`, `npm run seed -w @parking/api`, `npm run dev -w @parking/api`, `npm run dev -w @parking/customer-web`, `npm run dev -w @parking/admin-web`); URLs + admin credentials + demo card numbers (any Luhn-valid card, `…0001` force-success, `…0002` force-decline); test instructions (`docker compose up -d db_test` then `npm test`); architecture overview; Railway deployment steps (create project, add Postgres, 3 services from Dockerfiles, env vars table).

**Final verification (must actually run):** full test suite green (`npm test 2>&1 | tee /tmp/final-tests.log`); fresh-clone simulation: migrate + seed + boot API + `curl /api/health`, `curl /api/lots` returns 6 lots; both frontends `npm run build` clean.

Commit: `feat: dockerfiles, deployment config, readme`.

---

## Task Dependency Order

1 → 2 → 3 → 4 → 5 → 6 → 7 → 8 → 9 (backend chain, strictly ordered)
10 → 11 (customer, needs 6)
12 → 13 (admin, needs 7+8)
14 last.
Tasks 10–11 and 12–13 can proceed in parallel after their backend deps.
