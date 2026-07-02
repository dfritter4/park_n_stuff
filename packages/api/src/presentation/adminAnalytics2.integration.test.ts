import bcrypt from 'bcryptjs';
import type { Pool } from 'pg';
import request from 'supertest';
import type { Express } from 'express';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import {
  DeclinesResponseSchema,
  ForecastResponseSchema,
  HeatmapResponseSchema,
  LotCompareResponseSchema,
  WeeklyCompareResponseSchema,
} from '@parking/shared';
import { createPool } from '../infrastructure/db.js';
import { PostgresCapacityOverrideRepository } from '../infrastructure/postgres/capacityOverrideRepository.js';
import { PostgresDeclinedAttemptRepository } from '../infrastructure/postgres/declinedAttemptRepository.js';
import { PostgresLotRepository } from '../infrastructure/postgres/lotRepository.js';
import { PostgresPricingRuleRepository } from '../infrastructure/postgres/pricingRuleRepository.js';
import { PostgresReservationUnitOfWork } from '../infrastructure/postgres/reservationUnitOfWork.js';
import { PostgresReservationRepository } from '../infrastructure/postgres/reservationRepository.js';
import { PostgresAdminUserRepository } from '../infrastructure/postgres/adminUserRepository.js';
import { PostgresAnalyticsRepository } from '../infrastructure/postgres/analyticsRepository.js';
import { MockPaymentGateway } from '../infrastructure/mockPaymentGateway.js';
import { LotService } from '../application/lotService.js';
import { CreateReservationService } from '../application/createReservation.js';
import { AnalyticsService } from '../application/analyticsService.js';
import { FakeClock } from '../application/testing/fakes.js';
import { createApp } from './app.js';

const DATABASE_URL = process.env.DATABASE_URL ?? 'postgres://parking:parking@localhost:5433/parking_test_p5';
const JWT_SECRET = 'test-secret';
const ADMIN_EMAIL = 'admin@example.com';
const ADMIN_PASSWORD = 'correct-horse-battery-staple';
const HOUR_MS = 3_600_000;
const DAY_MS = 24 * HOUR_MS;

interface SeededLot {
  id: string;
  name: string;
  capacity: number;
}

/**
 * Counts how many of the 720 consecutive hourly buckets ending at `nowFloorHour`
 * (i.e. the exact lookback window the heatmap/forecast SQL scans) share the
 * given UTC (dow, hour). Also returns the offset (in hours before
 * `nowFloorHour`) of the most recent matching bucket, so a test can seed a
 * reservation into exactly one occurrence and predict the resulting average
 * without hard-coding "4 or 5 occurrences" — the count naturally varies
 * depending on what day the suite happens to run.
 */
function analyzeDowHourWindow(
  nowFloorHour: Date,
  targetDow: number,
  targetHour: number,
): { occurrences: number; mostRecentOffsetHours: number } {
  let occurrences = 0;
  let mostRecentOffsetHours = -1;
  for (let i = 0; i < 720; i++) {
    const bucket = new Date(nowFloorHour.getTime() - i * HOUR_MS);
    if (bucket.getUTCDay() === targetDow && bucket.getUTCHours() === targetHour) {
      occurrences++;
      if (mostRecentOffsetHours === -1) {
        mostRecentOffsetHours = i;
      }
    }
  }
  return { occurrences, mostRecentOffsetHours };
}

function floorToHour(date: Date): Date {
  return new Date(Math.floor(date.getTime() / HOUR_MS) * HOUR_MS);
}

describe('admin analytics 2: heatmap, weekly-compare, lot-compare, forecast, declines (integration)', () => {
  let pool: Pool;
  let app: Express;
  let adminUserRepository: PostgresAdminUserRepository;

  beforeAll(() => {
    pool = createPool(DATABASE_URL);
    const lotRepository = new PostgresLotRepository(pool);
    const uow = new PostgresReservationUnitOfWork(pool);
    const reservationRepository = new PostgresReservationRepository(pool);
    adminUserRepository = new PostgresAdminUserRepository(pool);
    const analyticsRepository = new PostgresAnalyticsRepository(pool);
    const gateway = new MockPaymentGateway(() => 0);
    const clock = new FakeClock(new Date('2026-01-01T00:00:00.000Z'));

    const pricingRuleRepository = new PostgresPricingRuleRepository(pool);
    const capacityOverrideRepository = new PostgresCapacityOverrideRepository(pool);
    const declinedAttemptRepository = new PostgresDeclinedAttemptRepository(pool);

    const lotService = new LotService(lotRepository, capacityOverrideRepository, pricingRuleRepository, clock);
    const createReservationService = new CreateReservationService(
      uow,
      gateway,
      clock,
      pricingRuleRepository,
      declinedAttemptRepository,
    );
    const analyticsService = new AnalyticsService(analyticsRepository);

    app = createApp({
      lotService,
      createReservationService,
      reservationRepository,
      adminUserRepository,
      analyticsService,
      jwtSecret: JWT_SECRET,
      corsOrigins: ['http://localhost:5173'],
    });
  });

  beforeEach(async () => {
    await pool.query(
      'TRUNCATE TABLE payments, reservations, customers, admin_users, lots, declined_attempts RESTART IDENTITY CASCADE',
    );
  });

  afterAll(async () => {
    await pool.end();
  });

  async function seedAdmin(): Promise<void> {
    const passwordHash = await bcrypt.hash(ADMIN_PASSWORD, 10);
    await adminUserRepository.create(ADMIN_EMAIL, passwordHash);
  }

  async function loginAndGetToken(): Promise<string> {
    await seedAdmin();
    const res = await request(app).post('/api/admin/auth/login').send({ email: ADMIN_EMAIL, password: ADMIN_PASSWORD });
    return res.body.token as string;
  }

  async function insertLot(overrides: Partial<{ name: string; capacity: number; status: string }> = {}): Promise<SeededLot> {
    const name = overrides.name ?? 'Test Lot';
    const capacity = overrides.capacity ?? 10;
    const status = overrides.status ?? 'active';
    const result = await pool.query<{ id: string }>(
      `INSERT INTO lots (name, address, neighborhood, lat, lng, capacity, hourly_rate_cents, status)
       VALUES ($1, '1 Main St', 'Downtown', 0, 0, $2, 500, $3)
       RETURNING id`,
      [name, capacity, status],
    );
    return { id: result.rows[0].id, name, capacity };
  }

  async function insertCustomer(email: string): Promise<string> {
    const result = await pool.query<{ id: string }>(
      `INSERT INTO customers (name, email, phone) VALUES ('Test Customer', $1, '5555555555') RETURNING id`,
      [email],
    );
    return result.rows[0].id;
  }

  async function insertReservation(input: {
    lotId: string;
    customerId: string;
    startTime: Date;
    endTime: Date;
    status: 'active' | 'completed' | 'cancelled';
    totalCostCents: number;
    createdAt: Date;
    reservationNumber?: string;
  }): Promise<string> {
    const reservationNumber = input.reservationNumber ?? `LOT-TEST-${Math.random().toString(36).slice(2, 10)}`;
    const result = await pool.query<{ id: string }>(
      `INSERT INTO reservations
         (reservation_number, lot_id, customer_id, vehicle_make, vehicle_model, license_plate, start_time, end_time, total_cost_cents, status, created_at)
       VALUES ($1, $2, $3, 'Honda', 'Civic', 'ABC123', $4, $5, $6, $7, $8)
       RETURNING id`,
      [
        reservationNumber,
        input.lotId,
        input.customerId,
        input.startTime,
        input.endTime,
        input.totalCostCents,
        input.status,
        input.createdAt,
      ],
    );
    return result.rows[0].id;
  }

  async function insertPayment(input: {
    reservationId: string;
    amountCents: number;
    status: 'succeeded' | 'declined' | 'refunded';
    createdAt: Date;
  }): Promise<void> {
    await pool.query(
      `INSERT INTO payments (reservation_id, amount_cents, status, transaction_id, card_last4, created_at)
       VALUES ($1, $2, $3, 'txn_test', '4242', $4)`,
      [input.reservationId, input.amountCents, input.status, input.createdAt],
    );
  }

  async function insertDeclinedAttempt(input: {
    lotId: string | null;
    amountCents: number;
    cardLast4: string;
    createdAt: Date;
  }): Promise<void> {
    await pool.query(
      `INSERT INTO declined_attempts (lot_id, amount_cents, card_last4, created_at) VALUES ($1, $2, $3, $4)`,
      [input.lotId, input.amountCents, input.cardLast4, input.createdAt],
    );
  }

  describe('GET /api/admin/analytics/heatmap', () => {
    it('returns 401 UNAUTHORIZED without a token', async () => {
      const res = await request(app).get('/api/admin/analytics/heatmap');
      expect(res.status).toBe(401);
    });

    it('returns 400 VALIDATION_ERROR for a malformed lotId', async () => {
      const token = await loginAndGetToken();
      const res = await request(app)
        .get('/api/admin/analytics/heatmap?lotId=not-a-uuid')
        .set('Authorization', `Bearer ${token}`);
      expect(res.status).toBe(400);
      expect(res.body.error.code).toBe('VALIDATION_ERROR');
    });

    it('returns 168 gap-free cells; fleet-wide denominator is total non-deleted capacity, uniform occupancy yields a uniform pct', async () => {
      const lotA = await insertLot({ capacity: 10 });
      await insertLot({ capacity: 10 }); // lotB — contributes capacity but no reservations
      await insertLot({ capacity: 10, status: 'deleted' }); // excluded from denominator entirely
      const customer = await insertCustomer('heatmap-uniform@example.com');
      const now = new Date();

      // Continuously occupies lotA across the entire 30-day lookback window, so every
      // one of the 168 (dow,hour) cells should show exactly the same occupancy pct:
      // 1 occupied / 20 total fleet capacity = 5%, regardless of which cell it is.
      await insertReservation({
        lotId: lotA.id,
        customerId: customer,
        startTime: new Date(now.getTime() - 31 * DAY_MS),
        endTime: new Date(now.getTime() + HOUR_MS),
        status: 'active',
        totalCostCents: 100,
        createdAt: now,
      });

      const token = await loginAndGetToken();
      const res = await request(app).get('/api/admin/analytics/heatmap').set('Authorization', `Bearer ${token}`);

      expect(res.status).toBe(200);
      expect(HeatmapResponseSchema.parse(res.body)).toBeTruthy();
      expect(res.body.cells).toHaveLength(168);
      for (const cell of res.body.cells) {
        expect(cell.occupancyPct).toBeCloseTo(5, 5);
      }
      // Every (dow, hour) combination is present exactly once — no gaps, no duplicates.
      const keys = new Set(res.body.cells.map((c: { dow: number; hour: number }) => `${c.dow}-${c.hour}`));
      expect(keys.size).toBe(168);
    });

    it('excludes reservations on a soft-deleted lot from the fleet-wide numerator, matching the non-deleted-lots-only expectation', async () => {
      const lotA = await insertLot({ capacity: 10 });
      const deletedLot = await insertLot({ capacity: 10, status: 'deleted' });
      const customer = await insertCustomer('heatmap-deleted-lot@example.com');
      const now = new Date();

      // Continuously occupies lotA across the entire 30-day lookback window, same as the
      // "uniform occupancy" test above: 1 occupied / 10 total fleet capacity (deletedLot's
      // capacity is excluded from the denominator) = 10%, uniformly across all 168 cells.
      await insertReservation({
        lotId: lotA.id,
        customerId: customer,
        startTime: new Date(now.getTime() - 31 * DAY_MS),
        endTime: new Date(now.getTime() + HOUR_MS),
        status: 'active',
        totalCostCents: 100,
        createdAt: now,
      });
      // Also continuously occupies the soft-deleted lot across the same window. Because
      // deletedLot's capacity is excluded from the denominator, its reservation must be
      // excluded from the numerator too — otherwise occupancy would be inflated to 20%
      // (2 occupied / 10 capacity) instead of matching the non-deleted-lots-only 10%.
      await insertReservation({
        lotId: deletedLot.id,
        customerId: customer,
        startTime: new Date(now.getTime() - 31 * DAY_MS),
        endTime: new Date(now.getTime() + HOUR_MS),
        status: 'active',
        totalCostCents: 100,
        createdAt: now,
      });

      const token = await loginAndGetToken();
      const res = await request(app).get('/api/admin/analytics/heatmap').set('Authorization', `Bearer ${token}`);

      expect(res.status).toBe(200);
      expect(HeatmapResponseSchema.parse(res.body)).toBeTruthy();
      expect(res.body.cells).toHaveLength(168);
      for (const cell of res.body.cells) {
        expect(cell.occupancyPct).toBeCloseTo(10, 5);
      }
    });

    it('averages a single occupied occurrence across all occurrences of that (dow,hour) in the 30-day window', async () => {
      const lotA = await insertLot({ capacity: 10 });
      await insertLot({ capacity: 10 });
      const customer = await insertCustomer('heatmap-single@example.com');
      const now = new Date();
      const nowFloorHour = floorToHour(now);

      // Target the (dow, hour) of "one week ago" — guaranteed to be within the 30-day
      // window and to share dow/hour with several other occurrences in that window.
      const targetBucket = new Date(nowFloorHour.getTime() - 168 * HOUR_MS);
      const targetDow = targetBucket.getUTCDay();
      const targetHour = targetBucket.getUTCHours();
      const { occurrences, mostRecentOffsetHours } = analyzeDowHourWindow(nowFloorHour, targetDow, targetHour);
      expect(mostRecentOffsetHours).toBeGreaterThanOrEqual(0);

      const occupiedBucketStart = new Date(nowFloorHour.getTime() - mostRecentOffsetHours * HOUR_MS);
      await insertReservation({
        lotId: lotA.id,
        customerId: customer,
        startTime: new Date(occupiedBucketStart.getTime() + 5 * 60_000),
        endTime: new Date(occupiedBucketStart.getTime() + 45 * 60_000),
        status: 'completed',
        totalCostCents: 100,
        createdAt: now,
      });

      const token = await loginAndGetToken();
      const res = await request(app).get('/api/admin/analytics/heatmap').set('Authorization', `Bearer ${token}`);

      const cell = res.body.cells.find((c: { dow: number; hour: number }) => c.dow === targetDow && c.hour === targetHour);
      // 1 of `occurrences` samples shows 5% (1/20*100), the rest show 0%.
      const expectedPct = 5 / occurrences;
      expect(cell.occupancyPct).toBeCloseTo(expectedPct, 5);

      // An unrelated (dow, hour) with no seeded reservation must read exactly 0.
      const otherDow = (targetDow + 3) % 7;
      const otherHour = (targetHour + 5) % 24;
      if (otherDow !== targetDow || otherHour !== targetHour) {
        const otherCell = res.body.cells.find(
          (c: { dow: number; hour: number }) => c.dow === otherDow && c.hour === otherHour,
        );
        expect(otherCell.occupancyPct).toBe(0);
      }
    });

    it('scopes to a single lot: denominator becomes that lot capacity, numerator excludes other lots', async () => {
      const lotA = await insertLot({ capacity: 10 });
      const lotB = await insertLot({ capacity: 10 });
      const customer = await insertCustomer('heatmap-scoped@example.com');
      const now = new Date();

      // Continuous occupancy on lotA across the window: scoped to lotA, expect 10%
      // (1/10) uniformly; must not be diluted by lotB's capacity.
      await insertReservation({
        lotId: lotA.id,
        customerId: customer,
        startTime: new Date(now.getTime() - 31 * DAY_MS),
        endTime: new Date(now.getTime() + HOUR_MS),
        status: 'active',
        totalCostCents: 100,
        createdAt: now,
      });
      // Continuous occupancy on lotB too — must not leak into lotA's scoped heatmap.
      await insertReservation({
        lotId: lotB.id,
        customerId: customer,
        startTime: new Date(now.getTime() - 31 * DAY_MS),
        endTime: new Date(now.getTime() + HOUR_MS),
        status: 'active',
        totalCostCents: 100,
        createdAt: now,
      });

      const token = await loginAndGetToken();
      const res = await request(app)
        .get(`/api/admin/analytics/heatmap?lotId=${lotA.id}`)
        .set('Authorization', `Bearer ${token}`);

      expect(res.status).toBe(200);
      expect(res.body.cells).toHaveLength(168);
      for (const cell of res.body.cells) {
        expect(cell.occupancyPct).toBeCloseTo(10, 5);
      }
    });
  });

  describe('GET /api/admin/analytics/weekly-compare', () => {
    it('returns 401 UNAUTHORIZED without a token', async () => {
      const res = await request(app).get('/api/admin/analytics/weekly-compare');
      expect(res.status).toBe(401);
    });

    it('splits revenue into the last 7 full UTC days vs the 7 before, excluding today and anything older than 14 days', async () => {
      const lot = await insertLot();
      const customer = await insertCustomer('weekly-compare@example.com');
      const now = new Date();

      async function paymentOnDaysAgo(daysAgo: number, amountCents: number): Promise<void> {
        const at = new Date(now.getTime() - daysAgo * DAY_MS);
        const r = await insertReservation({
          lotId: lot.id,
          customerId: customer,
          startTime: at,
          endTime: at,
          status: 'completed',
          totalCostCents: amountCents,
          createdAt: at,
        });
        await insertPayment({ reservationId: r, amountCents, status: 'succeeded', createdAt: at });
      }

      // Today: must be excluded from both weeks ("full" days only).
      await paymentOnDaysAgo(0, 111);
      // 1 day ago: newest day of "this week".
      await paymentOnDaysAgo(1, 500);
      // 7 days ago: oldest day of "this week".
      await paymentOnDaysAgo(7, 700);
      // 8 days ago: newest day of "last week".
      await paymentOnDaysAgo(8, 800);
      // 14 days ago: oldest day of "last week".
      await paymentOnDaysAgo(14, 1400);
      // 15 days ago: must be excluded from both weeks.
      await paymentOnDaysAgo(15, 999);

      const token = await loginAndGetToken();
      const res = await request(app).get('/api/admin/analytics/weekly-compare').set('Authorization', `Bearer ${token}`);

      expect(res.status).toBe(200);
      expect(WeeklyCompareResponseSchema.parse(res.body)).toBeTruthy();
      expect(res.body.thisWeek).toHaveLength(7);
      expect(res.body.lastWeek).toHaveLength(7);

      const dateStr = (daysAgo: number) => new Date(now.getTime() - daysAgo * DAY_MS).toISOString().slice(0, 10);

      const thisWeekTotal = res.body.thisWeek.reduce((sum: number, d: { revenueCents: number }) => sum + d.revenueCents, 0);
      const lastWeekTotal = res.body.lastWeek.reduce((sum: number, d: { revenueCents: number }) => sum + d.revenueCents, 0);
      // Only the 1-day-ago (500) and 7-days-ago (700) payments fall in "this week".
      expect(thisWeekTotal).toBe(1200);
      // Only the 8-days-ago (800) and 14-days-ago (1400) payments fall in "last week".
      expect(lastWeekTotal).toBe(2200);

      const oneDayAgo = res.body.thisWeek.find((d: { date: string }) => d.date === dateStr(1));
      expect(oneDayAgo).toMatchObject({ revenueCents: 500, reservations: 1 });
      const sevenDaysAgo = res.body.thisWeek.find((d: { date: string }) => d.date === dateStr(7));
      expect(sevenDaysAgo).toMatchObject({ revenueCents: 700, reservations: 1 });

      const eightDaysAgo = res.body.lastWeek.find((d: { date: string }) => d.date === dateStr(8));
      expect(eightDaysAgo).toMatchObject({ revenueCents: 800, reservations: 1 });
      const fourteenDaysAgo = res.body.lastWeek.find((d: { date: string }) => d.date === dateStr(14));
      expect(fourteenDaysAgo).toMatchObject({ revenueCents: 1400, reservations: 1 });

      // Today's date must not appear in either week.
      expect(res.body.thisWeek.some((d: { date: string }) => d.date === dateStr(0))).toBe(false);
      expect(res.body.lastWeek.some((d: { date: string }) => d.date === dateStr(0))).toBe(false);
    });
  });

  describe('GET /api/admin/analytics/lot-compare', () => {
    it('returns 401 UNAUTHORIZED without a token', async () => {
      const res = await request(app).get('/api/admin/analytics/lot-compare');
      expect(res.status).toBe(401);
    });

    it('sums succeeded-only revenue per lot within the days window and averages occupancy over the same window', async () => {
      const lotA = await insertLot({ name: 'Lot A', capacity: 10 });
      const lotB = await insertLot({ name: 'Lot B', capacity: 10 });
      await insertLot({ name: 'Deleted Lot', capacity: 10, status: 'deleted' });
      const customer = await insertCustomer('lot-compare@example.com');
      const now = new Date();
      const nowFloorHour = floorToHour(now);
      // The 7-day occupancy window the SQL scans: [end_hour - 167h, end_hour].
      const windowStart = new Date(nowFloorHour.getTime() - 167 * HOUR_MS);

      // Revenue reservation whose own start/end sit well outside the occupancy window (so
      // it can't add a stray occupied bucket) — only its payment's created_at (=now) needs
      // to fall inside the days=7 window.
      const rIn = await insertReservation({
        lotId: lotA.id,
        customerId: customer,
        startTime: new Date(now.getTime() - 100 * DAY_MS),
        endTime: new Date(now.getTime() - 100 * DAY_MS + HOUR_MS),
        status: 'completed',
        totalCostCents: 500,
        createdAt: now,
      });
      await insertPayment({ reservationId: rIn, amountCents: 500, status: 'succeeded', createdAt: now });
      // Declined and refunded payments on the same reservation: must not add to revenue.
      await insertPayment({ reservationId: rIn, amountCents: 999, status: 'declined', createdAt: now });
      await insertPayment({ reservationId: rIn, amountCents: 999, status: 'refunded', createdAt: now });

      // Out-of-window succeeded payment on lotA (10 days ago, window is 7 days): excluded.
      const rOut = await insertReservation({
        lotId: lotA.id,
        customerId: customer,
        startTime: new Date(now.getTime() - 10 * DAY_MS),
        endTime: new Date(now.getTime() - 10 * DAY_MS + HOUR_MS),
        status: 'completed',
        totalCostCents: 5000,
        createdAt: new Date(now.getTime() - 10 * DAY_MS),
      });
      await insertPayment({
        reservationId: rOut,
        amountCents: 5000,
        status: 'succeeded',
        createdAt: new Date(now.getTime() - 10 * DAY_MS),
      });

      // Continuous, hour-boundary-aligned occupancy on lotA covering every one of the 168
      // buckets exactly once: avgOccupancyPct = 1/10 capacity * 100 = 10, uniformly.
      await insertReservation({
        lotId: lotA.id,
        customerId: customer,
        startTime: new Date(windowStart.getTime() - HOUR_MS),
        endTime: new Date(nowFloorHour.getTime() + HOUR_MS),
        status: 'active',
        totalCostCents: 100,
        createdAt: now,
      });

      const token = await loginAndGetToken();
      const res = await request(app)
        .get('/api/admin/analytics/lot-compare?days=7')
        .set('Authorization', `Bearer ${token}`);

      expect(res.status).toBe(200);
      expect(LotCompareResponseSchema.parse(res.body)).toBeTruthy();
      // Deleted lots excluded entirely.
      expect(res.body.rows).toHaveLength(2);

      const rowA = res.body.rows.find((r: { lotId: string }) => r.lotId === lotA.id);
      const rowB = res.body.rows.find((r: { lotId: string }) => r.lotId === lotB.id);

      expect(rowA).toMatchObject({ name: 'Lot A', revenueCents: 500, reservations: 1 });
      expect(rowA.avgOccupancyPct).toBeCloseTo(10, 5);

      expect(rowB).toMatchObject({ name: 'Lot B', revenueCents: 0, reservations: 0, avgOccupancyPct: 0 });
    });
  });

  describe('GET /api/admin/analytics/forecast', () => {
    it('returns 401 UNAUTHORIZED without a token', async () => {
      const res = await request(app).get('/api/admin/analytics/forecast?lotId=00000000-0000-0000-0000-000000000000');
      expect(res.status).toBe(401);
    });

    it('returns 400 VALIDATION_ERROR when lotId is missing or malformed', async () => {
      const token = await loginAndGetToken();

      const missing = await request(app).get('/api/admin/analytics/forecast').set('Authorization', `Bearer ${token}`);
      expect(missing.status).toBe(400);
      expect(missing.body.error.code).toBe('VALIDATION_ERROR');

      const malformed = await request(app)
        .get('/api/admin/analytics/forecast?lotId=not-a-uuid')
        .set('Authorization', `Bearer ${token}`);
      expect(malformed.status).toBe(400);
    });

    it('projects the mean historical occupancy of the same (dow,hour) onto the next 7 UTC dates', async () => {
      const lotA = await insertLot({ capacity: 10 });
      const customer = await insertCustomer('forecast@example.com');
      const now = new Date();
      const nowFloorHour = floorToHour(now);

      // Tomorrow's (dow, hour=3) is the projection target.
      const tomorrow = new Date(nowFloorHour.getTime() + DAY_MS);
      const targetDow = tomorrow.getUTCDay();
      const targetHour = 3;
      const { occurrences, mostRecentOffsetHours } = analyzeDowHourWindow(nowFloorHour, targetDow, targetHour);
      expect(mostRecentOffsetHours).toBeGreaterThanOrEqual(0);

      const occupiedBucketStart = new Date(nowFloorHour.getTime() - mostRecentOffsetHours * HOUR_MS);
      await insertReservation({
        lotId: lotA.id,
        customerId: customer,
        startTime: new Date(occupiedBucketStart.getTime() + 5 * 60_000),
        endTime: new Date(occupiedBucketStart.getTime() + 45 * 60_000),
        status: 'completed',
        totalCostCents: 100,
        createdAt: now,
      });

      const token = await loginAndGetToken();
      const res = await request(app)
        .get(`/api/admin/analytics/forecast?lotId=${lotA.id}`)
        .set('Authorization', `Bearer ${token}`);

      expect(res.status).toBe(200);
      expect(ForecastResponseSchema.parse(res.body)).toBeTruthy();
      // 7 dates x 24 hours, gap-free.
      expect(res.body.points).toHaveLength(168);

      const tomorrowStr = tomorrow.toISOString().slice(0, 10);
      const point = res.body.points.find(
        (p: { date: string; hour: number }) => p.date === tomorrowStr && p.hour === targetHour,
      );
      expect(point).toBeDefined();
      // 1 of `occurrences` historical samples was 10% (1/10*100) occupied, the rest 0%.
      const expectedPct = 10 / occurrences;
      expect(point.projectedOccupancyPct).toBeCloseTo(expectedPct, 5);

      // All 7 forecast dates must be the 7 consecutive UTC dates starting tomorrow.
      const distinctDates = [...new Set(res.body.points.map((p: { date: string }) => p.date))].sort();
      const expectedDates = Array.from({ length: 7 }, (_, i) =>
        new Date(tomorrow.getTime() + i * DAY_MS).toISOString().slice(0, 10),
      ).sort();
      expect(distinctDates).toEqual(expectedDates);
    });

    it('projects 0 for an unknown lotId rather than erroring', async () => {
      const token = await loginAndGetToken();
      const res = await request(app)
        .get('/api/admin/analytics/forecast?lotId=00000000-0000-0000-0000-000000000000')
        .set('Authorization', `Bearer ${token}`);

      expect(res.status).toBe(200);
      expect(res.body.points).toHaveLength(168);
      for (const point of res.body.points) {
        expect(point.projectedOccupancyPct).toBe(0);
      }
    });
  });

  describe('GET /api/admin/analytics/declines', () => {
    it('returns 401 UNAUTHORIZED without a token', async () => {
      const res = await request(app).get('/api/admin/analytics/declines');
      expect(res.status).toBe(401);
    });

    it('totals and buckets declines by UTC day within the window, gap-free, excluding attempts outside it', async () => {
      const lot = await insertLot({ name: 'Decline Lot' });
      const now = new Date();

      // Today: amount 100.
      await insertDeclinedAttempt({ lotId: lot.id, amountCents: 100, cardLast4: '1111', createdAt: now });
      // 1 day ago: amount 200. Same day gets another decline too, amount 50.
      const oneDayAgo = new Date(now.getTime() - DAY_MS);
      await insertDeclinedAttempt({ lotId: lot.id, amountCents: 200, cardLast4: '2222', createdAt: oneDayAgo });
      await insertDeclinedAttempt({ lotId: lot.id, amountCents: 50, cardLast4: '2223', createdAt: oneDayAgo });
      // 6 days ago (the oldest day still inside a 7-day window): amount 300.
      const sixDaysAgo = new Date(now.getTime() - 6 * DAY_MS);
      await insertDeclinedAttempt({ lotId: lot.id, amountCents: 300, cardLast4: '3333', createdAt: sixDaysAgo });
      // 8 days ago: outside a 7-day window entirely.
      const eightDaysAgo = new Date(now.getTime() - 8 * DAY_MS);
      await insertDeclinedAttempt({ lotId: lot.id, amountCents: 9999, cardLast4: '4444', createdAt: eightDaysAgo });

      const token = await loginAndGetToken();
      const res = await request(app)
        .get('/api/admin/analytics/declines?days=7')
        .set('Authorization', `Bearer ${token}`);

      expect(res.status).toBe(200);
      expect(DeclinesResponseSchema.parse(res.body)).toBeTruthy();
      expect(res.body.byDay).toHaveLength(7);
      expect(res.body.total).toBe(4);

      const todayStr = now.toISOString().slice(0, 10);
      const oneDayAgoStr = oneDayAgo.toISOString().slice(0, 10);
      const sixDaysAgoStr = sixDaysAgo.toISOString().slice(0, 10);

      const todayRow = res.body.byDay.find((d: { date: string }) => d.date === todayStr);
      expect(todayRow).toMatchObject({ count: 1, amountCents: 100 });

      const oneDayAgoRow = res.body.byDay.find((d: { date: string }) => d.date === oneDayAgoStr);
      expect(oneDayAgoRow).toMatchObject({ count: 2, amountCents: 250 });

      const sixDaysAgoRow = res.body.byDay.find((d: { date: string }) => d.date === sixDaysAgoStr);
      expect(sixDaysAgoRow).toMatchObject({ count: 1, amountCents: 300 });

      // No byDay row corresponds to the 8-days-ago attempt (outside the window) and it
      // does not inflate the total.
      const eightDaysAgoStr = eightDaysAgo.toISOString().slice(0, 10);
      if (eightDaysAgoStr !== sixDaysAgoStr && eightDaysAgoStr !== oneDayAgoStr && eightDaysAgoStr !== todayStr) {
        expect(res.body.byDay.some((d: { date: string }) => d.date === eightDaysAgoStr)).toBe(false);
      }
    });

    it('returns at most the 50 newest declines overall in `recent`, independent of the days window, newest first', async () => {
      const lot = await insertLot({ name: 'Recent Decline Lot' });
      const now = new Date();

      for (let i = 0; i < 55; i++) {
        await insertDeclinedAttempt({
          lotId: lot.id,
          amountCents: 100 + i,
          cardLast4: '9999',
          createdAt: new Date(now.getTime() - i * 60_000),
        });
      }

      const token = await loginAndGetToken();
      const res = await request(app)
        .get('/api/admin/analytics/declines?days=1')
        .set('Authorization', `Bearer ${token}`);

      expect(res.status).toBe(200);
      expect(res.body.recent).toHaveLength(50);
      // Newest (i=0, amountCents=100) must be first.
      expect(res.body.recent[0]).toMatchObject({ lotName: 'Recent Decline Lot', amountCents: 100, cardLast4: '9999' });
      expect(typeof res.body.recent[0].createdAt).toBe('string');
      // Strictly newest-first ordering.
      const timestamps = res.body.recent.map((r: { createdAt: string }) => new Date(r.createdAt).getTime());
      for (let i = 1; i < timestamps.length; i++) {
        expect(timestamps[i]).toBeLessThanOrEqual(timestamps[i - 1]);
      }
    });

    it('returns 400 VALIDATION_ERROR for days outside 1-90', async () => {
      const token = await loginAndGetToken();
      const res = await request(app).get('/api/admin/analytics/declines?days=0').set('Authorization', `Bearer ${token}`);
      expect(res.status).toBe(400);
      expect(res.body.error.code).toBe('VALIDATION_ERROR');
    });
  });
});
