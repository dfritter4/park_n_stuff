# Parking POC — Phase 2 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: superpowers:subagent-driven-development. Follow phase-1 conventions everywhere (see Global Constraints).

**Goal:** Add admin reservation management (list/detail/cancel+refund/extend/in-lot-now), customer management (list/detail/flag), pricing rules + capacity overrides with server-authoritative quotes, and analytics upgrades (heatmap, comparisons, forecast, declines report). No platform work (no roles/audit log).

**Architecture:** Same clean architecture + shared Zod contracts. One new migration. New admin routers as separate files (stub-mounted up front so parallel tasks never edit shared files). Vertical-slice backend tasks (repo+service+router per feature).

## Global Constraints (inherited from phase 1 + additions)

- All phase-1 Global Constraints apply verbatim (integer cents, UTC timestamptz, ISO over wire, error envelope, Zod-at-boundary via `@parking/shared`, clean-architecture dependency rule, TDD, no `git add -A`, no AI attribution, no `timeout` on macOS, test DB on 5433).
- Migration `packages/api/migrations/2_phase2.cjs` (node-pg-migrate orders by filename).
- Pricing-rule hours are **UTC** (consistent with analytics bucketing).
- Revenue definition update: revenue = payments with status `succeeded` only; `refunded` payments are excluded. (Phase-1 queries filter `status='succeeded'` already — refunds automatically drop out.)
- New error codes: `RESERVATION_NOT_ACTIVE` (409), `CUSTOMER_FLAGGED` (403), `INVALID_EXTENSION` (400), `PRICING_RULE_OVERLAP` (409) — all as DomainError subclasses in `domain/errors.ts`.
- Pagination convention: `?page` (1-based, default 1) `&pageSize` (default 25, max 100); responses `{ rows: [...], total: number }`.

## Schema (migration 2_phase2.cjs)

- `payments.status` CHECK constraint gains `'refunded'` (drop + re-add constraint).
- `customers` + `flagged boolean NOT NULL DEFAULT false`, `flag_reason text`.
- `pricing_rules`: id uuid PK gen_random_uuid, lot_id uuid REFERENCES lots ON DELETE CASCADE, day_type text CHECK IN ('weekday','weekend','all'), start_hour int CHECK (0–23), end_hour int CHECK (1–24 AND end_hour > start_hour), hourly_rate_cents int CHECK (>0), created_at timestamptz DEFAULT now(). Index (lot_id).
- `capacity_overrides`: id uuid PK, lot_id uuid REFERENCES lots ON DELETE CASCADE, spaces_closed int CHECK (>0), reason text, starts_at timestamptz NOT NULL, ends_at timestamptz (NULL = open-ended), created_at timestamptz DEFAULT now(). Index (lot_id).
- `declined_attempts`: id uuid PK, lot_id uuid REFERENCES lots, amount_cents int, card_last4 text, created_at timestamptz DEFAULT now(). Index (created_at).

## Domain: window pricing (packages/api/src/domain/pricing.ts additions)

```ts
export interface HourlyRateRule { dayType: 'weekday'|'weekend'|'all'; startHour: number; endHour: number; hourlyRateCents: number; }
export function rateForHour(baseRateCents: number, rules: HourlyRateRule[], slot: Date): number
// UTC dow: weekend = Sat/Sun. Matching rule: dayType matches (weekday/weekend specific beats 'all') AND startHour <= slot.getUTCHours() < endHour. No match → baseRateCents.
export function calculateWindowCostCents(baseRateCents: number, rules: HourlyRateRule[], startTime: Date, endTime: Date): number
// billedHours = max(1, ceil(minutes/60)); slot i = startTime + i hours (i = 0..billedHours-1); total = Σ rateForHour(base, rules, slot_i). Throws ValidationError if end <= start.
// With rules=[] this equals phase-1 calculateCostCents exactly (pin with a test).
```

Overlap validation (service-side, on rule create): reject if a new rule's [startHour,endHour) intersects an existing rule of the same lot with the same dayType, or if either is 'all' and hours intersect → `PRICING_RULE_OVERLAP`.

Effective capacity: `effectiveCapacity(capacity, overrides, window)` = capacity − Σ spaces_closed of overrides where `starts_at < windowEnd AND (ends_at IS NULL OR ends_at > windowStart)`; clamp ≥ 0.

## New/Changed API surface (all admin routes require JWT)

**Quote (public):** `GET /api/lots/:id/quote?startTime&endTime` → `{ totalCostCents: number, billedHours: number }` (404 unknown/deleted lot; 400 invalid window).

**Reservation flow changes (POST /api/reservations):** cost via `calculateWindowCostCents` with lot's rules; capacity gate uses effective capacity over the requested window (overrides + FOR UPDATE lock as before); flagged-customer gate: existing customer with matching email AND flagged → 403 `CUSTOMER_FLAGGED` (checked before charging); on `PaymentDeclinedError` insert `declined_attempts` row AFTER the txn rolls back, then rethrow. `GET /api/lots` availableSpaces = capacity − closed(now) − activeNow.

**Admin reservations** (`presentation/routes/adminReservations.ts`):
- `GET /api/admin/reservations?lotId&status&from&to&search&activeNow&page&pageSize` — search matches reservation_number, license_plate, customer name/email (ILIKE); from/to filter on start_time; activeNow=true → active AND now() BETWEEN start_time AND end_time. Returns `{rows: AdminReservation[], total}` ordered created_at DESC.
- `GET /api/admin/reservations/:id` → AdminReservationDetail (reservation + customer {name,email,phone,flagged} + payments[{amountCents,status,transactionId,cardLast4,createdAt}]).
- `POST /api/admin/reservations/:id/cancel` → active only (`RESERVATION_NOT_ACTIVE` otherwise); sets status cancelled; all its succeeded payments → refunded. Returns detail.
- `POST /api/admin/reservations/:id/extend` body `{newEndTime}` → active only; newEndTime > current end_time (`INVALID_EXTENSION`); delta = calculateWindowCostCents over [oldEnd,newEnd) with rules; capacity gate for extension window (effective capacity, FOR UPDATE); insert new succeeded payment (mock txn id, reuse stored card_last4 from the original payment); update end_time and total_cost_cents += delta. Returns detail.
- `GET /api/admin/lots/:id/current` → active-now reservations for the lot `[{reservationNumber, licensePlate, vehicleMake, vehicleModel, customerName, startTime, endTime}]`.

**Admin customers** (`presentation/routes/adminCustomers.ts`):
- `GET /api/admin/customers?search&page&pageSize` → rows `{id,name,email,phone,flagged,flagReason,reservationCount,lifetimeSpendCents}` (lifetime = succeeded payments only), total; search ILIKE name/email/phone.
- `GET /api/admin/customers/:id` → above + `reservations: AdminReservation[]` (latest 50).
- `POST /api/admin/customers/:id/flag` body `{reason: string (1-300)}`; `POST /api/admin/customers/:id/unflag`.

**Pricing/ops admin** (`presentation/routes/lotOps.ts`):
- `GET /api/lots/:id/pricing-rules` (public read — customer app may show it later), `POST /api/lots/:id/pricing-rules` (admin; overlap-validated), `DELETE /api/pricing-rules/:ruleId` (admin).
- `GET /api/lots/:id/capacity-overrides` (admin), `POST` (admin; body spaces_closed, reason, startsAt, endsAt?; reject spaces_closed > capacity), `DELETE /api/capacity-overrides/:id` (admin; hard delete OK).

**Analytics 2** (extend `presentation/routes/admin.ts` + analyticsRepository/service — only this task touches those files):
- `GET /api/admin/analytics/heatmap?lotId?` → `{cells: [{dow 0-6 (0=Sun, UTC), hour 0-23, occupancyPct}]}` — avg over last 30 days; denominator = lot capacity (or total capacity when no lotId); numerator = avg overlapping active/completed reservations.
- `GET /api/admin/analytics/weekly-compare` → `{thisWeek: DayPoint[], lastWeek: DayPoint[]}` where DayPoint = `{date, revenueCents, reservations}`; weeks = last 7 full days vs the 7 before (UTC).
- `GET /api/admin/analytics/lot-compare?days=30` → `{rows: [{lotId,name,revenueCents,reservations,avgOccupancyPct}]}`.
- `GET /api/admin/analytics/forecast?lotId` → `{points: [{date, hour, projectedOccupancyPct}]}` next 7 days × 24h; projection = mean occupancy of same (UTC dow, hour) over last 30 days.
- `GET /api/admin/analytics/declines?days=30` → `{total, byDay: [{date, count, amountCents}], recent: [{lotName, amountCents, cardLast4, createdAt}] (≤50 newest)}`.

All request/response schemas added to `packages/shared/src/contracts.ts` (exact names: `QuoteResponseSchema`, `AdminReservationSchema`, `AdminReservationDetailSchema`, `AdminReservationListResponseSchema`, `CancelResponse=detail`, `ExtendReservationRequestSchema`, `CurrentInLotResponseSchema`, `AdminCustomerSchema`, `AdminCustomerListResponseSchema`, `AdminCustomerDetailSchema`, `FlagCustomerRequestSchema`, `PricingRuleSchema`, `CreatePricingRuleRequestSchema`, `CapacityOverrideSchema`, `CreateCapacityOverrideRequestSchema`, `HeatmapResponseSchema`, `WeeklyCompareResponseSchema`, `LotCompareResponseSchema`, `ForecastResponseSchema`, `DeclinesResponseSchema`).

## Admin UI additions (packages/admin-web)

- Nav gains: Reservations, Customers (Analytics/Lots pages extended in place).
- **ReservationsPage**: filter bar (lot select, status select, date range, search box, "Active now" toggle), paginated table, row → **ReservationDetailPage** (`/reservations/:id`): info card, customer card (flag badge), payments table, actions: Cancel (ConfirmDialog) and Extend (modal: datetime-local newEnd, shows delta cost fetched via… POST result; disable while pending). "In lot now": on LotsPage each row gets a "View current" link → filtered reservations view (`/reservations?lotId=X&activeNow=true`).
- **CustomersPage**: search + paginated table (name, email, phone, reservations, lifetime spend, flagged badge) → **CustomerDetailPage** (`/customers/:id`): profile, Flag/Unflag (reason dialog), reservation history table linking to reservation detail.
- **LotsPage additions**: per-row "Pricing" and "Capacity" actions → panels/modals: PricingRulesPanel (list rules, add form dayType/hours/rate-in-dollars, delete w/ confirm; server overlap errors surfaced) and CapacityOverridesPanel (list, add form, delete).
- **AnalyticsPage additions**: lot selector; OccupancyHeatmap (7×24 CSS-grid, color scale, tooltips via title attr); WeeklyCompare (two-series bar chart); LotCompareTable; ForecastChart (line, next 7 days for selected lot); DeclinesSection (metric + byDay mini-bar + recent table).
- TDD the pure helpers (filter→querystring builder, heatmap color-scale bucketing, dollars↔cents reuse) + at least one page-level test per new page following LotsPage.test.tsx patterns.

## Customer web (packages/customer-web)

- Reserve flow cost preview becomes server-authoritative: debounced (400ms) `GET /lots/:id/quote` replaces local `estimateCostCents` for display (keep local fn as instant optimistic value while quote loads; server value wins). Payment page shows quoted total; server remains source of truth at POST. Test: hook-level test for the debounced quote (fake timers + mocked apiFetch).

## Seed additions (task P7)

- Pricing rules: Loop Premier weekday 7–19 UTC $15/hr; River North weekend 17–24 UTC $12/hr; West Loop 'all' 6–10 UTC $10/hr.
- ~2–3% of generated payment attempts also emit `declined_attempts` rows spread over 30 days.
- 2 customers flagged (reason strings).
- ~50% of historical cancelled reservations get payments marked `refunded`.
- History generation must now price with the lots' rules (reuse calculateWindowCostCents) so seeded totals match the rules.

## Tasks

- **P1 Foundations** [serial]: migration 2_phase2.cjs; ALL shared contract schemas; domain window pricing + new errors (TDD: rateForHour specificity, window sum, rules=[] parity with phase-1, effective-capacity clamp); ports.ts: ALL new port interfaces (PricingRuleRepository, CapacityOverrideRepository, DeclinedAttemptRepository, AdminReservationRepository, AdminCustomerRepository + method signatures per API surface above); stub routers `adminReservations.ts`/`adminCustomers.ts`/`lotOps.ts` returning 501 `NOT_IMPLEMENTED` envelope, mounted in app.ts with deps threaded (nullable deps OK); composition root wired. Commit `feat(phase2): schema, contracts, domain pricing, ports, route stubs`.
- **P2 Reservation-flow integration** [serial after P1]: Postgres PricingRuleRepository (read), CapacityOverrideRepository (read), DeclinedAttemptRepository (insert); createReservation uses window pricing + effective capacity + flagged gate + decline recording; quote endpoint (in lots router); lots availability uses effective capacity. Integration TDD incl.: rule-priced cost end-to-end; override shrinks capacity → LOT_FULL; flagged email → 403; declined card → declined_attempts row exists, reservation absent. Commit `feat(phase2): rule-based pricing, capacity overrides, flagged gate, decline recording`.
- **P3 Admin reservations backend** [parallel after P2]: own repo/service files + replace adminReservations stub. All five endpoints, integration TDD (filters, pagination totals, cancel refunds payments, extend charges delta + capacity gate, current-in-lot). Commit `feat(phase2): admin reservation management api`.
- **P4 Admin customers backend** [parallel after P2]: own repo/service + replace adminCustomers stub. Integration TDD (aggregates correctness incl. refunded excluded from lifetime spend, flag→reservation blocked end-to-end). Commit `feat(phase2): admin customer management api`.
- **P5 Analytics2 backend** [parallel after P2]: extends analyticsRepository/service + admin.ts routes (sole owner of those files this wave). Integration TDD with hand fixtures (heatmap cell math, weekly compare boundaries, forecast projection math, declines report). Commit `feat(phase2): analytics heatmap, comparisons, forecast, declines`.
- **P6 Pricing/ops backend** [parallel after P2]: CRUD for pricing rules + capacity overrides (extends P2's repo files — sole owner this wave) + replace lotOps stub. Integration TDD (overlap 409 incl. 'all'-vs-specific, spaces_closed > capacity 400, cascade on lot delete). Commit `feat(phase2): pricing rules and capacity override management api`.
- **P7 Seed phase 2** [after P3–P6]: seed additions above; verify with SQL (rule-priced totals differ from flat-rate for ruled lots; declines spread over days); full suite green. Commit `feat(phase2): seed pricing rules, declines, flags, refunds`.
- **P8 Admin UI: nav + reservations** [after P7]: routes/nav for Reservations+Customers (Customers page = placeholder stub for P9), ReservationsPage + ReservationDetailPage + LotsPage "View current" links. Commit `feat(phase2): admin reservations ui`.
- **P9 Admin UI: customers** [parallel after P8]: CustomersPage + CustomerDetailPage (replace stub). Commit `feat(phase2): admin customers ui`.
- **P10 Admin UI: pricing/ops** [parallel after P8]: LotsPage pricing + capacity panels. Commit `feat(phase2): pricing and capacity ops ui`.
- **P11 Admin UI: analytics2** [parallel after P8]: AnalyticsPage additions. Commit `feat(phase2): analytics upgrades ui`.
- **P12 Customer quote integration** [parallel after P2 — customer-web only]: debounced server quote in reserve flow. Commit `feat(phase2): server-authoritative cost quotes in customer flow`.
- **P12b Customer UI polish** [after P12, customer-web only, parallel with P8–P11]: visual refresh of the customer app — cohesive design system in index.css (type scale, spacing, color palette with a strong primary, consistent radii/shadows), polished lot cards (availability badge styling, rate emphasis), refined map/list layout, form styling (inputs, focus states, error states), payment page card-brand feel, confirmation page celebratory receipt look, loading skeletons instead of bare "Loading…", smooth transitions. NO behavior/logic/route changes; all existing tests must stay green; keep mobile-first (44px touch targets) and basic a11y (contrast, focus visibility). Screenshot-free verification: build + tests + careful CSS review. Commit `feat(phase2): customer app visual polish`.
- **P13 Finalize** [last]: README updates (new features/endpoints), final whole-phase review (Opus, P1-start..HEAD), Railway redeploy (all 3 services; migration runs on boot; re-run seed), deployed HTTP verification (quote endpoint, a filtered admin reservations call, heatmap). Commit `docs+deploy: phase 2`.

Reviews: every task gets the standard Opus task gate; fixes re-reviewed; ledger updated per task.
