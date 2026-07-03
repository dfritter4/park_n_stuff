# Admin UI Modernization + Per-Lot Analytics (Phase 3) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.
>
> **On approval, save this plan to:** `docs/superpowers/plans/2026-07-02-admin-ui-phase3.md` (repo convention).
> **Sequencing note:** start only after the in-flight whole-phase-2 Opus review lands its fixes — U2–U7 touch the same admin-web files.

**Goal:** Make the admin app look professional and modern (design-token system, polished shell, consistent cards/tables/forms/charts, loading skeletons) and make the core analytics (revenue, occupancy, day breakdown) filterable by lot end-to-end.

**Architecture:** One small backend vertical slice adds an optional `lotId` filter to the existing analytics endpoints (no new endpoints, no response-shape changes, no migration). The UI work is design-system-first: rewrite `index.css` around CSS custom properties and shared primitives, keeping existing class names and DOM structure wherever possible so the 98 admin-web tests (role/label-based) stay green; then polish page-by-page; then rework the Analytics page IA so one lot selector drives every lot-scopable chart. Finish with recharts code-splitting and deploy.

**Tech Stack:** Existing only — React 18 + react-router 6 + TanStack Query 5 + recharts 3 + hand-rolled CSS (no new dependencies; icons are inline SVG).

## Global Constraints (inherited from phases 1–2)

- All phase-1/2 Global Constraints apply verbatim: integer cents, UTC everywhere, ISO strings over the wire, error envelope, Zod-at-boundary via `@parking/shared`, clean-architecture dependency rule, TDD, no `git add -A`, no AI attribution in commits, no `timeout` on macOS, test DB on port 5433.
- **No behavior/route regressions:** all 509 existing tests stay green; UI tasks may only *update* a test when the DOM structure legitimately changed, never delete coverage.
- **No new npm dependencies.** No new migration. No contract *shape* changes (only new optional query params).
- Restyle by rewriting CSS, not by renaming classes. Existing class names (`.metric-card`, `.lots-table`, `.status-badge-*`, `.modal`, `.form-field`, `.pagination`, …) are a stable API for this plan.
- Accessibility floor: visible `:focus-visible` rings on all interactive elements, WCAG-AA contrast for text on its background, `prefers-reduced-motion` respected for transitions/skeletons.

## Visual direction (binding for all UI tasks)

Professional SaaS-dashboard aesthetic: light neutral canvas, white cards with hairline borders and a soft shadow, one confident indigo primary, small uppercase micro-labels for card/section titles, data-dense but airy tables. No gradients-everywhere, no glassmorphism, no emoji.

### Design tokens (Task U2 adds these verbatim at the top of `index.css`; every later rule uses them)

```css
:root {
  /* canvas + surfaces */
  --color-bg: #f4f5f8;
  --color-surface: #ffffff;
  --color-border: #e5e7ec;
  --color-border-strong: #d3d6de;

  /* text */
  --color-text: #191b20;
  --color-text-secondary: #565b66;
  --color-text-muted: #8a8f9b;

  /* brand */
  --color-primary: #4353d9;
  --color-primary-hover: #3543ba;
  --color-primary-soft: #eceefb;

  /* status */
  --color-success: #187a43;  --color-success-soft: #e2f5ea;
  --color-warning: #a05f10;  --color-warning-soft: #fbf1df;
  --color-danger:  #bc3222;  --color-danger-soft:  #fbe9e6;
  --color-info:    #2a5bb8;  --color-info-soft:    #e6eefc;
  --color-refund:  #6431c9;  --color-refund-soft:  #f0eafd;

  /* sidebar */
  --color-sidebar-bg: #14161d;
  --color-sidebar-text: #b8bcc7;
  --color-sidebar-hover: #1e212b;
  --color-sidebar-active: #262a37;

  /* type scale */
  --text-xs: 0.72rem;  --text-sm: 0.82rem;  --text-md: 0.9rem;
  --text-lg: 1.05rem;  --text-xl: 1.35rem;  --text-2xl: 1.7rem;

  /* shape + elevation */
  --radius-sm: 6px;  --radius-md: 10px;  --radius-full: 999px;
  --shadow-sm: 0 1px 2px rgba(20, 22, 29, 0.05);
  --shadow-md: 0 4px 16px rgba(20, 22, 29, 0.08);
  --shadow-modal: 0 12px 40px rgba(20, 22, 29, 0.18);

  /* focus */
  --focus-ring: 0 0 0 3px rgba(67, 83, 217, 0.35);
}
```

### Shared primitives (U2 defines once; later tasks consume)

- **Buttons:** `.btn` base + `.btn-primary` / `.btn-secondary` (white, border) / `.btn-danger` / `.btn-ghost` (borderless link-style) + `.btn-sm`. U2 restyles the existing raw `button` selectors to these looks *without* requiring markup changes (keep existing selectors as aliases, e.g. `.modal-actions button[type='submit']` gets the primary look); later page tasks may add the `.btn*` classes to markup as they touch each page.
- **Cards:** `.card` = surface + border + `--radius-md` + `--shadow-sm` + `1.25rem` padding; `.card-title` = `--text-xs`, uppercase, `letter-spacing: 0.06em`, `--color-text-muted`.
- **Tables:** one `.data-table` ruleset (replaces the four duplicated `.lots-table`/`.day-breakdown-table`/`.reservations-table`/`.lot-compare-table` blocks — keep old class names as comma-selector aliases of `.data-table`): sticky-feel header row in `--color-bg`, `--text-xs` uppercase muted headers, row `:hover` tint `#f8f9fd`, numeric columns right-aligned via `.num` cell class.
- **Badges:** `.status-badge` pill using the status soft/strong token pairs (mapping unchanged: active/succeeded→success, completed→info, cancelled/declined→danger, refunded→refund, maintenance→warning, flagged→danger).
- **Skeletons:** `components/Skeleton.tsx` — `Skeleton({ height?, width?, count? })` renders `<span className="skeleton" aria-hidden="true">`; CSS shimmer via `@keyframes skeleton-pulse` (opacity pulse, disabled under `prefers-reduced-motion`). Pages replace bare `Loading…` paragraphs with layout-shaped skeleton blocks but MUST keep an accessible loading signal (wrap in `<div role="status" aria-label="Loading">`; existing tests that query `/loading/i` keep passing via the aria-label).
- **Page header:** `.page-header` = flex row, `h2` at `--text-xl`/700 with an optional `.page-header-sub` muted line, actions right-aligned. Every page adopts it.
- **Chart theme:** `src/lib/chartTheme.ts` exporting literal constants (recharts props can't read CSS vars): `CHART_PRIMARY = '#4353d9'`, `CHART_COMPARE = '#a5aee8'`, `CHART_GRID = '#e5e7ec'`, `CHART_AXIS = '#8a8f9b'`, `CHART_DANGER = '#bc3222'`, plus `heatmapColor(pct: number): string` moved/reused from the existing heatmap bucketing helper. All charts consume these instead of hard-coded hexes.

## New/Changed API surface (backend, Task U1)

No new endpoints; two gain an optional `lotId` (uuid) query param. Unknown-but-valid-uuid lot behaves like the existing heatmap: zero-valued series, not 404. Invalid uuid → 400 `VALIDATION_ERROR`.

- `GET /api/admin/analytics?days=30&lotId=<uuid>` — when `lotId` present: `dailyRevenue` counts only payments of that lot's reservations; `hourlyOccupancy` numerator scoped to the lot and denominator = that lot's capacity (not total).
- `GET /api/admin/analytics/day/:date?lotId=<uuid>` — same scoping for all three columns (reservations, revenue, occupancy).

**Port signature changes** (`packages/api/src/application/analyticsPorts.ts`, `null` = all lots, matching `getHeatmap`):

```ts
getDailyRevenue(days: number, lotId: string | null): Promise<DailyRevenuePoint[]>;
getHourlyOccupancy(lotId: string | null): Promise<HourlyOccupancyPoint[]>;
getDayBreakdown(date: string, lotId: string | null): Promise<DayBreakdownRow[]>;
```

**Service** (`analyticsService.ts`): `getAnalytics(days: number, lotId?: string)`, `getDayBreakdown(date: string, lotId?: string)` — pass `lotId ?? null` down.

**SQL approach** (`infrastructure/postgres/analyticsRepository.ts`) — add `$n::uuid` param with the null-or-match idiom already used implicitly by heatmap:
- daily revenue: revenue subquery becomes `FROM payments JOIN reservations ON reservations.id = payments.reservation_id WHERE payments.status = 'succeeded' AND ($2::uuid IS NULL OR reservations.lot_id = $2)`.
- hourly occupancy + day breakdown: capacity CTE gains `AND ($n::uuid IS NULL OR id = $n)`; reservation join gains `AND ($n::uuid IS NULL OR reservations.lot_id = $n)`.

**Routes** (`presentation/routes/admin.ts`): both handlers parse optional `lotId` exactly like the existing heatmap handler (reuse `LotIdQuerySchema`, `ValidationError('lotId must be a valid UUID')`).

Out of scope (explicit): dashboard stays global (it already shows per-lot gauges); weekly-compare, lot-compare (inherently cross-lot), and declines stay global.

## File structure

```
packages/api/src/
  application/analyticsPorts.ts        modify (3 signatures)      — U1
  application/analyticsService.ts      modify (2 methods)         — U1
  application/analyticsService.test.ts modify                     — U1
  infrastructure/postgres/analyticsRepository.ts  modify (3 queries) — U1
  presentation/routes/admin.ts         modify (2 handlers)        — U1
  presentation/adminAnalytics.integration.test.ts modify (add lotId cases) — U1
packages/admin-web/src/
  index.css                            rewrite around tokens      — U2
  components/Layout.tsx                modify (icons, structure)  — U2
  components/icons.tsx                 create (inline SVG set)    — U2
  components/Skeleton.tsx (+ .test)    create                     — U2
  lib/chartTheme.ts (+ .test)          create                     — U2
  pages/LoginPage.tsx, DashboardPage.tsx, components/{MetricCard,LotGauge,ActivityFeed}.tsx — U3
  pages/{ReservationsPage,ReservationDetailPage,CustomersPage,CustomerDetailPage}.tsx + customers.css — U4
  pages/LotsPage.tsx + lotops.css + components/{LotFormModal,ConfirmDialog,PricingRulesPanel,CapacityOverridesPanel}.tsx — U5
  pages/AnalyticsPage.tsx (+ .test) + analytics2.css + hooks/useAnalytics.ts + charts/* + analytics2/* — U6
  vite.config.ts                       modify (manualChunks)      — U7
README.md                              modify                     — U8
```

---

## Tasks

### Task U1: Per-lot analytics backend [serial, first]

**Files:** as mapped above (api package only).
**Interfaces — Produces:** the port/service signatures quoted in "New/Changed API surface" verbatim; U6 relies on `GET /api/admin/analytics?days&lotId` and `GET /api/admin/analytics/day/:date?lotId` accepting the param.

- [ ] **RED:** add integration tests in `adminAnalytics.integration.test.ts` with hand fixtures (two lots, known capacities, reservations/payments split across them): (1) `?lotId=A` dailyRevenue excludes lot B's payments; (2) hourlyOccupancy for lot A uses capacity_A as denominator (1 active reservation in a 10-capacity lot → 10%, not revenue-weighted total); (3) `day/:date?lotId` scopes all three columns; (4) `lotId=not-a-uuid` → 400 `VALIDATION_ERROR`; (5) valid-uuid unknown lot → 200 with zeroed series. Plus unit tests in `analyticsService.test.ts` asserting `lotId ?? null` pass-through. Run: `npm test -w @parking/api 2>&1 | tee .superpowers/sdd/u1-red.log` → new tests FAIL.
- [ ] **GREEN:** update ports, repository SQL (predicates quoted above), service, routes. Run suite again, tee to `.superpowers/sdd/u1-tests.log` → all green.
- [ ] **Commit:** `feat(phase3): per-lot filtering for analytics and day breakdown`

### Task U2: Design system foundation + app shell [serial, after U1 merges — CSS base for everything]

**Files:** `index.css` (token block verbatim from "Visual direction", then every existing rule rewritten to consume tokens; add `.btn*`, `.card`, `.data-table` + aliases, `.page-header`, `.skeleton` primitives), `Layout.tsx`, new `components/icons.tsx`, `components/Skeleton.tsx` + test, `lib/chartTheme.ts` + test.
**Interfaces — Produces:** class names `.btn .btn-primary .btn-secondary .btn-danger .btn-ghost .btn-sm .card .card-title .data-table .num .page-header .page-header-sub .skeleton`; `Skeleton({ height?: string; width?: string; count?: number })`; `icons.tsx` exporting `IconDashboard, IconLots, IconReservations, IconCustomers, IconAnalytics, IconLogout` (20×20 inline SVG, `stroke="currentColor"`, `aria-hidden="true"`); chartTheme constants as specced. U3–U6 consume all of these.

- [ ] **RED:** `Skeleton.test.tsx` (renders `count` spans, `aria-hidden`), `chartTheme.test.ts` (`heatmapColor` bucket boundaries — port the existing bucketing helper's tests if it moves). Verify FAIL.
- [ ] **GREEN:** implement `Skeleton`, `icons`, `chartTheme`; rewrite `index.css` (tokens; sidebar: brand block with small parking-"P" mark, nav links with icons + `--radius-sm` active pill instead of border-left; topbar with page-height 56px, email as muted `--text-sm`; focus-visible rings globally: `:focus-visible { outline: none; box-shadow: var(--focus-ring); }`); update `Layout.tsx` to render icons inside existing NavLinks (text labels unchanged — tests query by name).
- [ ] **Verify:** `npm test -w @parking/admin-web 2>&1 | tee .superpowers/sdd/u2-tests.log` all green; `npm run build -w @parking/admin-web 2>&1 | tee .superpowers/sdd/u2-build.log` clean.
- [ ] **Commit:** `feat(phase3): admin design tokens, app shell, shared ui primitives`

### Task U3: Dashboard + Login polish [parallel with U4/U5 after U2]

**Files:** `DashboardPage.tsx`, `LoginPage.tsx`, `MetricCard.tsx`, `LotGauge.tsx`, `ActivityFeed.tsx`, related `index.css` sections.
**Consumes:** U2 primitives.

- [ ] Metric cards → `.card` with `.card-title` micro-label and `--text-2xl` value; lot gauges get capacity fraction (`42 / 250`) + pct-colored fill (success <70%, warning 70–90%, danger >90% — thresholds as a tested pure helper `gaugeColor(pct)` in `lib/format.ts` or new `lib/ui.ts`, TDD it); activity feed rows get status-dot + relative-time right column (helpers exist). Login: centered card on `--color-bg`, brand mark, proper input focus states, inline error styling.
- [ ] Replace `Loading dashboard…` with skeleton layout per the U2 skeleton contract (keep `role="status"` accessible signal).
- [ ] Page tests updated only where structure changed; suite green (tee `.superpowers/sdd/u3-tests.log`).
- [ ] **Commit:** `feat(phase3): dashboard and login polish`

### Task U4: Reservations + Customers pages polish [parallel after U2]

**Files:** `ReservationsPage.tsx`, `ReservationDetailPage.tsx`, `CustomersPage.tsx`, `CustomerDetailPage.tsx`, `customers.css`, related `index.css` sections.
**Consumes:** U2 primitives.

- [ ] Filter bar → `.card` with aligned `.form-field`s and a `.btn-primary` Apply; tables → `.data-table` (money/count columns `.num`); pagination → `.btn-sm .btn-secondary` prev/next + "Page X of Y · N results" muted text; row hover + pointer retained.
- [ ] Detail pages: `.page-header` with back `.btn-ghost`, status badge beside the reservation number; info/customer/payments as `.card`s in a responsive 2-col grid; Cancel = `.btn-danger`, Extend = `.btn-primary`; flag badge + flag-reason callout (`--color-danger-soft` panel) on customer views; skeletons for loading states.
- [ ] Suite green (tee `.superpowers/sdd/u4-tests.log`). **Commit:** `feat(phase3): reservations and customers ui polish`

### Task U5: Lots page + ops panels polish [parallel after U2]

**Files:** `LotsPage.tsx`, `lotops.css`, `LotFormModal.tsx`, `ConfirmDialog.tsx`, `PricingRulesPanel.tsx`, `CapacityOverridesPanel.tsx`, related `index.css` sections.
**Consumes:** U2 primitives.

- [ ] Lots table → `.data-table`; row actions become `.btn-ghost .btn-sm` group; status → badges. Modals: `--radius-md`, `--shadow-modal`, backdrop `rgba(20,22,29,0.5)`, form fields with focus rings and inline `--color-danger` errors; pricing-rules/capacity panels get `.card` framing, aligned add-forms, and empty-state copy (muted, centered) instead of bare empty tables.
- [ ] Suite green (tee `.superpowers/sdd/u5-tests.log`). **Commit:** `feat(phase3): lots and ops panels ui polish`

### Task U6: Analytics page rework — per-lot everywhere [after U1 + U2; parallel with U3–U5 only if it doesn't touch their files — it doesn't]

**Files:** `AnalyticsPage.tsx` + `AnalyticsPage.test.tsx`, `analytics2.css`, `hooks/useAnalytics.ts`, `charts/OccupancyLineChart.tsx`, `charts/RevenueBarChart.tsx`, all `components/analytics2/*` (theme adoption), `DayBreakdownTable.tsx`.
**Consumes:** U1 endpoints; U2 `.card`/`.page-header`/chartTheme.

- [ ] **Hooks (RED first):** `useAnalytics(lotId?: string)` and `useDayBreakdown(date: string, lotId?: string)` — lotId in queryKey and as `&lotId=` when set. Test with mocked `apiFetch` asserting exact URLs (follow `useAnalytics2`'s existing hook-test pattern).
- [ ] **Page IA:** single `LotSelector` moves into `.page-header` (label "All lots" default — remove the current auto-select-first-lot effect; forecast section keeps its "select a specific lot" empty-state) and now drives revenue, occupancy, day breakdown, heatmap, AND forecast. Sections become `.card`s in a 12-col grid: occupancy line (span 12), revenue bar (span 7) + weekly compare (span 5), heatmap (span 12), day breakdown (span 6) + lot compare (span 6), forecast (span 7) + declines (span 5); single-column under 1100px.
- [ ] **Page test (RED):** selecting a lot in the selector causes analytics + day-breakdown + heatmap + forecast fetch URLs to carry that `lotId` (extend existing `AnalyticsPage.test.tsx` fetch-spy pattern); "All lots" omits it and forecast shows the empty-state.
- [ ] **Charts:** all recharts components take colors/grid/axis styling from `chartTheme`; consistent tooltip formatting (`formatCentsAsDollars`, `formatPercent1`); axis tick font `--text-xs` equivalent.
- [ ] Suite green (tee `.superpowers/sdd/u6-tests.log`). **Commit:** `feat(phase3): per-lot analytics ui and analytics page redesign`

### Task U7: Chart bundle code-split [after U6]

**Files:** `packages/admin-web/vite.config.ts`.

- [ ] Add rolldown `manualChunks`-equivalent config splitting `recharts` (and its deps) into a `charts` chunk; verify with `npm run build -w @parking/admin-web 2>&1 | tee .superpowers/sdd/u7-build.log` that the main chunk drops below ~300 kB and the >500 kB warning disappears (or is confined to the lazy chunk); suite green. If rolldown's option differs from rollup's `manualChunks`, prefer `React.lazy` around the two chart-heavy page sections instead — whichever keeps tests green with less config; document the choice in the commit body.
- [ ] **Commit:** `perf(phase3): split recharts out of the main admin bundle`

### Task U8: Finalize [last]

- [ ] Full suite `npm test 2>&1 | tee .superpowers/sdd/u8-tests.log` (all workspaces green; update the README test count from 509 to the new total).
- [ ] README: document `lotId` on the two analytics endpoints; one line under phase-2 features noting the admin UI modernization + per-lot analytics.
- [ ] Railway redeploy (same transient-`railway.json` procedure, api + admin-web at minimum, customer-web unchanged but redeploy for commit parity); deployed verification: `GET /api/admin/analytics?days=30&lotId=<Loop lot id>` returns lot-scoped series (spot-check revenue < global revenue), admin-web serves fresh bundle hashes incl. the new `charts` chunk.
- [ ] **Commit:** `docs+deploy: phase 3 admin ui modernization`

Reviews: standard Opus task gate per task; fixes re-reviewed; ledger updated per task.

## Self-review notes

- Spec coverage: "professional/modern" → U2 (system) + U3–U5 (every page) + U6 (analytics) + U7 (perf); "analytics by lots" → U1 + U6; "dated and clunky" (skeletons, focus states, consistent components) → U2 primitives adopted everywhere.
- Type consistency: port `lotId: string | null` matches heatmap's existing convention; service takes `lotId?: string`; hooks take `lotId?: string` — the null↔undefined boundary is service-level (`lotId ?? null`), stated in U1.
- Product decisions locked in (flag to the user if wrong): dashboard stays global; weekly-compare/lot-compare/declines stay global; forecast keeps requiring a specific lot; no dark mode; no new deps.
