import bcrypt from 'bcryptjs';
import type { Pool } from 'pg';
import request from 'supertest';
import type { Express } from 'express';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { AnalyticsResponseSchema, DashboardResponseSchema, DayBreakdownResponseSchema } from '@parking/shared';
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

const DATABASE_URL = process.env.DATABASE_URL ?? 'postgres://parking:parking@localhost:5433/parking_test';
const JWT_SECRET = 'test-secret';
const ADMIN_EMAIL = 'admin@example.com';
const ADMIN_PASSWORD = 'correct-horse-battery-staple';

interface SeededLot {
  id: string;
  name: string;
  capacity: number;
}

describe('admin dashboard + analytics + csv export (integration)', () => {
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
    await pool.query('TRUNCATE TABLE payments, reservations, customers, admin_users, lots RESTART IDENTITY CASCADE');
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
    status: 'succeeded' | 'declined';
    createdAt: Date;
  }): Promise<void> {
    await pool.query(
      `INSERT INTO payments (reservation_id, amount_cents, status, transaction_id, card_last4, created_at)
       VALUES ($1, $2, $3, 'txn_test', '4242', $4)`,
      [input.reservationId, input.amountCents, input.status, input.createdAt],
    );
  }

  const HOUR_MS = 3600_000;

  describe('GET /api/admin/dashboard', () => {
    it('returns 401 UNAUTHORIZED without a token', async () => {
      const res = await request(app).get('/api/admin/dashboard');
      expect(res.status).toBe(401);
      expect(res.body).toEqual({ error: { code: 'UNAUTHORIZED', message: expect.any(String) } });
    });

    it('computes revenue today, active reservations, per-lot occupancy/revenue, and averageOccupancyPct', async () => {
      const now = new Date();
      const lotA = await insertLot({ name: 'Lot A', capacity: 10 });
      const lotB = await insertLot({ name: 'Lot B', capacity: 4 });
      const customer = await insertCustomer('dash-customer@example.com');

      // Currently active in lot A: counts toward activeReservations + lotA.occupied.
      const rActiveA = await insertReservation({
        lotId: lotA.id,
        customerId: customer,
        startTime: new Date(now.getTime() - 30 * 60_000),
        endTime: new Date(now.getTime() + 30 * 60_000),
        status: 'active',
        totalCostCents: 1000,
        createdAt: new Date(now.getTime() - 50 * 60_000),
      });
      await insertPayment({ reservationId: rActiveA, amountCents: 1000, status: 'succeeded', createdAt: now });

      // status='active' but the time window already elapsed: must NOT count as active-now.
      const rStaleActive = await insertReservation({
        lotId: lotA.id,
        customerId: customer,
        startTime: new Date(now.getTime() - 2 * HOUR_MS),
        endTime: new Date(now.getTime() - HOUR_MS),
        status: 'active',
        totalCostCents: 500,
        createdAt: new Date(now.getTime() - 40 * 60_000),
      });
      // Payment from yesterday: must NOT count toward today's revenue.
      await insertPayment({
        reservationId: rStaleActive,
        amountCents: 500,
        status: 'succeeded',
        createdAt: new Date(now.getTime() - 25 * HOUR_MS),
      });

      // Completed status, in the past: must not count toward active reservations or occupancy.
      const rCompleted = await insertReservation({
        lotId: lotB.id,
        customerId: customer,
        startTime: new Date(now.getTime() - 3 * HOUR_MS),
        endTime: new Date(now.getTime() - 2 * HOUR_MS),
        status: 'completed',
        totalCostCents: 2000,
        createdAt: new Date(now.getTime() - 30 * 60_000),
      });
      // Declined payment today: must not count toward revenue.
      await insertPayment({ reservationId: rCompleted, amountCents: 2000, status: 'declined', createdAt: now });

      // Currently active in lot B.
      const rActiveB = await insertReservation({
        lotId: lotB.id,
        customerId: customer,
        startTime: new Date(now.getTime() - 10 * 60_000),
        endTime: new Date(now.getTime() + 50 * 60_000),
        status: 'active',
        totalCostCents: 300,
        createdAt: new Date(now.getTime() - 10 * 60_000),
      });
      await insertPayment({ reservationId: rActiveB, amountCents: 300, status: 'succeeded', createdAt: now });

      const token = await loginAndGetToken();
      const res = await request(app).get('/api/admin/dashboard').set('Authorization', `Bearer ${token}`);

      expect(res.status).toBe(200);
      expect(res.body.revenueTodayCents).toBe(1300);
      expect(res.body.activeReservations).toBe(2);
      expect(res.body.averageOccupancyPct).toBeCloseTo(17.5, 5);

      const lots = res.body.lots as Array<{ lotId: string; occupied: number; capacity: number; revenueTodayCents: number }>;
      const respLotA = lots.find((l) => l.lotId === lotA.id);
      const respLotB = lots.find((l) => l.lotId === lotB.id);
      expect(respLotA).toMatchObject({ capacity: 10, occupied: 1, revenueTodayCents: 1000 });
      expect(respLotB).toMatchObject({ capacity: 4, occupied: 1, revenueTodayCents: 300 });

      // Most recently created reservation (rActiveB) should be first.
      expect(res.body.recentReservations[0]).toMatchObject({
        lotName: 'Lot B',
        totalCostCents: 300,
      });
      expect(res.body.recentReservations).toHaveLength(4);
    });

    it('includes maintenance lots (but excludes deleted lots) in the lots array and averageOccupancyPct', async () => {
      const active = await insertLot({ name: 'Active Lot', capacity: 5, status: 'active' });
      const maintenance = await insertLot({ name: 'Maintenance Lot', capacity: 5, status: 'maintenance' });
      await insertLot({ name: 'Deleted Lot', capacity: 5, status: 'deleted' });
      const customer = await insertCustomer('maintenance-dash-customer@example.com');
      const now = new Date();

      // Active-now reservation on the maintenance lot: must still be reflected in its
      // occupancy and pulled into the fleet-wide average.
      await insertReservation({
        lotId: maintenance.id,
        customerId: customer,
        startTime: new Date(now.getTime() - 30 * 60_000),
        endTime: new Date(now.getTime() + 30 * 60_000),
        status: 'active',
        totalCostCents: 400,
        createdAt: now,
      });

      const token = await loginAndGetToken();
      const res = await request(app).get('/api/admin/dashboard').set('Authorization', `Bearer ${token}`);

      expect(res.body.lots).toHaveLength(2);
      const lots = res.body.lots as Array<{ lotId: string; occupied: number; capacity: number }>;
      const respActive = lots.find((l) => l.lotId === active.id);
      const respMaintenance = lots.find((l) => l.lotId === maintenance.id);
      expect(respActive).toMatchObject({ occupied: 0, capacity: 5 });
      expect(respMaintenance).toMatchObject({ occupied: 1, capacity: 5 });

      // Mean of per-lot occupancy pct over the two non-deleted lots: (0% + 20%) / 2 = 10%.
      expect(res.body.averageOccupancyPct).toBeCloseTo(10, 5);

      expect(DashboardResponseSchema.parse(res.body)).toBeTruthy();
    });

    it('returns 0 averageOccupancyPct when there are no lots', async () => {
      const token = await loginAndGetToken();
      const res = await request(app).get('/api/admin/dashboard').set('Authorization', `Bearer ${token}`);

      expect(res.body.averageOccupancyPct).toBe(0);
      expect(res.body.lots).toEqual([]);
    });

    it('caps recentReservations at the 10 newest by created_at', async () => {
      const lot = await insertLot();
      const customer = await insertCustomer('recent-customer@example.com');
      const now = new Date();

      for (let i = 0; i < 12; i++) {
        await insertReservation({
          lotId: lot.id,
          customerId: customer,
          startTime: new Date(now.getTime() - HOUR_MS),
          endTime: new Date(now.getTime() - HOUR_MS + 10 * 60_000),
          status: 'completed',
          totalCostCents: 100 + i,
          createdAt: new Date(now.getTime() - (12 - i) * 60_000),
          reservationNumber: `LOT-RECENT-${i}`,
        });
      }

      const token = await loginAndGetToken();
      const res = await request(app).get('/api/admin/dashboard').set('Authorization', `Bearer ${token}`);

      expect(res.body.recentReservations).toHaveLength(10);
      expect(res.body.recentReservations[0].totalCostCents).toBe(100 + 11);
      expect(res.body.recentReservations[9].totalCostCents).toBe(100 + 2);
    });
  });

  describe('GET /api/admin/analytics', () => {
    it('returns 401 UNAUTHORIZED without a token', async () => {
      const res = await request(app).get('/api/admin/analytics');
      expect(res.status).toBe(401);
    });

    it('sums succeeded payments per UTC day and counts distinct reservations, gap-free over the window', async () => {
      const lot = await insertLot();
      const customer = await insertCustomer('analytics-customer@example.com');
      const now = new Date();

      const rToday = await insertReservation({
        lotId: lot.id,
        customerId: customer,
        startTime: new Date(now.getTime() - HOUR_MS),
        endTime: now,
        status: 'completed',
        totalCostCents: 1500,
        createdAt: now,
      });
      await insertPayment({ reservationId: rToday, amountCents: 1500, status: 'succeeded', createdAt: now });

      const yesterday = new Date(now.getTime() - 25 * HOUR_MS);
      const rYesterday = await insertReservation({
        lotId: lot.id,
        customerId: customer,
        startTime: yesterday,
        endTime: yesterday,
        status: 'completed',
        totalCostCents: 700,
        createdAt: yesterday,
      });
      await insertPayment({ reservationId: rYesterday, amountCents: 700, status: 'succeeded', createdAt: yesterday });
      // Declined payment yesterday: must not contribute revenue.
      await insertPayment({ reservationId: rYesterday, amountCents: 999, status: 'declined', createdAt: yesterday });

      const token = await loginAndGetToken();
      const res = await request(app).get('/api/admin/analytics?days=30').set('Authorization', `Bearer ${token}`);

      expect(res.status).toBe(200);
      expect(res.body.dailyRevenue).toHaveLength(30);

      const todayStr = now.toISOString().slice(0, 10);
      const yesterdayStr = yesterday.toISOString().slice(0, 10);
      const todayRow = res.body.dailyRevenue.find((r: { date: string }) => r.date === todayStr);
      const yesterdayRow = res.body.dailyRevenue.find((r: { date: string }) => r.date === yesterdayStr);

      expect(todayRow).toMatchObject({ revenueCents: 1500, reservations: 1 });
      expect(yesterdayRow).toMatchObject({ revenueCents: 700, reservations: 1 });

      expect(res.body.hourlyOccupancy).toHaveLength(168);
    });

    it('computes hourlyOccupancy as overlapping active/completed reservations over total non-deleted capacity', async () => {
      const lotA = await insertLot({ capacity: 10 });
      const lotB = await insertLot({ capacity: 10 });
      const deletedLot = await insertLot({ capacity: 10, status: 'deleted' });
      const customer = await insertCustomer('hourly-customer@example.com');
      const now = new Date();

      await insertReservation({
        lotId: lotA.id,
        customerId: customer,
        startTime: new Date(now.getTime() - 30 * 60_000),
        endTime: new Date(now.getTime() + 30 * 60_000),
        status: 'active',
        totalCostCents: 100,
        createdAt: now,
      });

      // Overlapping reservation belonging to a soft-deleted lot: its capacity is already
      // excluded from the denominator, so it must also be excluded from the numerator —
      // otherwise it inflates occupancy for capacity that no longer exists.
      await insertReservation({
        lotId: deletedLot.id,
        customerId: customer,
        startTime: new Date(now.getTime() - 30 * 60_000),
        endTime: new Date(now.getTime() + 30 * 60_000),
        status: 'active',
        totalCostCents: 100,
        createdAt: now,
      });

      const token = await loginAndGetToken();
      const res = await request(app).get('/api/admin/analytics').set('Authorization', `Bearer ${token}`);

      expect(AnalyticsResponseSchema.parse(res.body)).toBeTruthy();

      const currentDateStr = now.toISOString().slice(0, 10);
      const currentHour = now.getUTCHours();
      const currentBucket = res.body.hourlyOccupancy.find(
        (row: { date: string; hour: number }) => row.date === currentDateStr && row.hour === currentHour,
      );
      // Numerator counts only the lotA reservation (1), not the deleted-lot one; denominator
      // is lotA + lotB capacity (20). The deleted lot's reservation must not appear in either.
      expect(currentBucket.occupancyPct).toBeCloseTo(5, 5); // 1 / 20 * 100

      const farPast = new Date(now.getTime() - 100 * HOUR_MS);
      const farPastDateStr = farPast.toISOString().slice(0, 10);
      const farPastHour = farPast.getUTCHours();
      const farPastBucket = res.body.hourlyOccupancy.find(
        (row: { date: string; hour: number }) => row.date === farPastDateStr && row.hour === farPastHour,
      );
      expect(farPastBucket.occupancyPct).toBe(0);
    });

    it('returns 400 VALIDATION_ERROR for days outside 1-90', async () => {
      const token = await loginAndGetToken();

      const tooLow = await request(app).get('/api/admin/analytics?days=0').set('Authorization', `Bearer ${token}`);
      const tooHigh = await request(app).get('/api/admin/analytics?days=91').set('Authorization', `Bearer ${token}`);
      const notANumber = await request(app).get('/api/admin/analytics?days=abc').set('Authorization', `Bearer ${token}`);

      expect(tooLow.status).toBe(400);
      expect(tooLow.body.error.code).toBe('VALIDATION_ERROR');
      expect(tooHigh.status).toBe(400);
      expect(notANumber.status).toBe(400);
    });

    it('scopes dailyRevenue to the given lotId, excluding another lot\'s payments', async () => {
      const lotA = await insertLot({ name: 'Lot A', capacity: 10 });
      const lotB = await insertLot({ name: 'Lot B', capacity: 10 });
      const customer = await insertCustomer('lotid-daily-customer@example.com');
      const now = new Date();

      const rA = await insertReservation({
        lotId: lotA.id,
        customerId: customer,
        startTime: new Date(now.getTime() - HOUR_MS),
        endTime: now,
        status: 'completed',
        totalCostCents: 1000,
        createdAt: now,
      });
      await insertPayment({ reservationId: rA, amountCents: 1000, status: 'succeeded', createdAt: now });

      const rB = await insertReservation({
        lotId: lotB.id,
        customerId: customer,
        startTime: new Date(now.getTime() - HOUR_MS),
        endTime: now,
        status: 'completed',
        totalCostCents: 500,
        createdAt: now,
      });
      await insertPayment({ reservationId: rB, amountCents: 500, status: 'succeeded', createdAt: now });

      const token = await loginAndGetToken();
      const res = await request(app)
        .get(`/api/admin/analytics?days=30&lotId=${lotA.id}`)
        .set('Authorization', `Bearer ${token}`);

      expect(res.status).toBe(200);
      expect(AnalyticsResponseSchema.parse(res.body)).toBeTruthy();
      const todayStr = now.toISOString().slice(0, 10);
      const todayRow = res.body.dailyRevenue.find((r: { date: string }) => r.date === todayStr);
      expect(todayRow).toMatchObject({ revenueCents: 1000, reservations: 1 });
    });

    it("uses the lot's own capacity as the hourlyOccupancy denominator when lotId is given, not fleet-wide capacity", async () => {
      const lotA = await insertLot({ capacity: 10 });
      await insertLot({ capacity: 40 });
      const customer = await insertCustomer('lotid-hourly-customer@example.com');
      const now = new Date();

      await insertReservation({
        lotId: lotA.id,
        customerId: customer,
        startTime: new Date(now.getTime() - 30 * 60_000),
        endTime: new Date(now.getTime() + 30 * 60_000),
        status: 'active',
        totalCostCents: 100,
        createdAt: now,
      });

      const token = await loginAndGetToken();
      const res = await request(app)
        .get(`/api/admin/analytics?lotId=${lotA.id}`)
        .set('Authorization', `Bearer ${token}`);

      expect(res.status).toBe(200);
      expect(AnalyticsResponseSchema.parse(res.body)).toBeTruthy();
      const currentDateStr = now.toISOString().slice(0, 10);
      const currentHour = now.getUTCHours();
      const currentBucket = res.body.hourlyOccupancy.find(
        (row: { date: string; hour: number }) => row.date === currentDateStr && row.hour === currentHour,
      );
      // 1 occupied / lotA capacity (10) = 10%, not 1 / (10 + 40) fleet-wide = 2%.
      expect(currentBucket.occupancyPct).toBeCloseTo(10, 5);
    });

    it('returns 400 VALIDATION_ERROR when lotId is not a valid uuid', async () => {
      const token = await loginAndGetToken();

      const res = await request(app)
        .get('/api/admin/analytics?lotId=not-a-uuid')
        .set('Authorization', `Bearer ${token}`);

      expect(res.status).toBe(400);
      expect(res.body.error.code).toBe('VALIDATION_ERROR');
    });

    it('returns 200 with zero-valued series for a well-formed but unknown lotId', async () => {
      const lot = await insertLot({ capacity: 10 });
      const customer = await insertCustomer('lotid-unknown-customer@example.com');
      const now = new Date();

      // Reservation exists, but on a different lot than the unknown lotId queried below.
      const r = await insertReservation({
        lotId: lot.id,
        customerId: customer,
        startTime: new Date(now.getTime() - HOUR_MS),
        endTime: now,
        status: 'completed',
        totalCostCents: 1000,
        createdAt: now,
      });
      await insertPayment({ reservationId: r, amountCents: 1000, status: 'succeeded', createdAt: now });

      const token = await loginAndGetToken();
      const res = await request(app)
        .get('/api/admin/analytics?lotId=00000000-0000-0000-0000-000000000000')
        .set('Authorization', `Bearer ${token}`);

      expect(res.status).toBe(200);
      expect(AnalyticsResponseSchema.parse(res.body)).toBeTruthy();
      for (const row of res.body.dailyRevenue) {
        expect(row.revenueCents).toBe(0);
        expect(row.reservations).toBe(0);
      }
      for (const row of res.body.hourlyOccupancy) {
        expect(row.occupancyPct).toBe(0);
      }
    });
  });

  describe('GET /api/admin/analytics/day/:date', () => {
    it('returns 401 UNAUTHORIZED without a token', async () => {
      const res = await request(app).get('/api/admin/analytics/day/2026-01-01');
      expect(res.status).toBe(401);
    });

    it('returns 24 gap-free rows with per-hour reservations, revenue, and occupancy', async () => {
      const lot = await insertLot({ capacity: 10 });
      const customer = await insertCustomer('day-customer@example.com');

      // Pick a date safely in the past relative to "now" so all 24 hourly buckets are stable.
      const date = new Date(Date.now() - 2 * 24 * HOUR_MS);
      const dateStr = date.toISOString().slice(0, 10);
      const dayStart = new Date(`${dateStr}T00:00:00.000Z`);
      const hour5Start = new Date(dayStart.getTime() + 5 * HOUR_MS);

      const r = await insertReservation({
        lotId: lot.id,
        customerId: customer,
        startTime: new Date(hour5Start.getTime() + 10 * 60_000),
        endTime: new Date(hour5Start.getTime() + 40 * 60_000),
        status: 'completed',
        totalCostCents: 800,
        createdAt: hour5Start,
      });
      await insertPayment({ reservationId: r, amountCents: 800, status: 'succeeded', createdAt: new Date(hour5Start.getTime() + 15 * 60_000) });

      const token = await loginAndGetToken();
      const res = await request(app).get(`/api/admin/analytics/day/${dateStr}`).set('Authorization', `Bearer ${token}`);

      expect(res.status).toBe(200);
      expect(DayBreakdownResponseSchema.parse(res.body)).toBeTruthy();
      expect(res.body.rows).toHaveLength(24);

      const hour5 = res.body.rows.find((row: { hour: number }) => row.hour === 5);
      expect(hour5).toMatchObject({ reservations: 1, revenueCents: 800 });
      expect(hour5.occupancyPct).toBeCloseTo(10, 5); // 1/10 * 100

      const hour0 = res.body.rows.find((row: { hour: number }) => row.hour === 0);
      expect(hour0).toMatchObject({ reservations: 0, revenueCents: 0, occupancyPct: 0 });
    });

    it('excludes reservations on soft-deleted lots from the day-breakdown occupancy numerator', async () => {
      const lot = await insertLot({ capacity: 10 });
      const deletedLot = await insertLot({ capacity: 10, status: 'deleted' });
      const customer = await insertCustomer('day-deleted-customer@example.com');

      const date = new Date(Date.now() - 3 * 24 * HOUR_MS);
      const dateStr = date.toISOString().slice(0, 10);
      const dayStart = new Date(`${dateStr}T00:00:00.000Z`);
      const hour5Start = new Date(dayStart.getTime() + 5 * HOUR_MS);

      await insertReservation({
        lotId: lot.id,
        customerId: customer,
        startTime: new Date(hour5Start.getTime() + 10 * 60_000),
        endTime: new Date(hour5Start.getTime() + 40 * 60_000),
        status: 'completed',
        totalCostCents: 800,
        createdAt: hour5Start,
      });

      // Reservation on a soft-deleted lot, overlapping only hour 5: its capacity is already
      // excluded from the denominator (SUM(capacity) WHERE status != 'deleted'), so it must
      // also be excluded from the occupied-count numerator.
      await insertReservation({
        lotId: deletedLot.id,
        customerId: customer,
        startTime: new Date(hour5Start.getTime() + 5 * 60_000),
        endTime: new Date(hour5Start.getTime() + 35 * 60_000),
        status: 'completed',
        totalCostCents: 800,
        createdAt: hour5Start,
      });

      const token = await loginAndGetToken();
      const res = await request(app).get(`/api/admin/analytics/day/${dateStr}`).set('Authorization', `Bearer ${token}`);

      const hour5 = res.body.rows.find((row: { hour: number }) => row.hour === 5);
      expect(hour5.occupancyPct).toBeCloseTo(10, 5); // 1/10 * 100 — deleted lot's overlap excluded

      const hour0 = res.body.rows.find((row: { hour: number }) => row.hour === 0);
      expect(hour0.occupancyPct).toBe(0);
    });

    it('returns 400 VALIDATION_ERROR for a malformed date', async () => {
      const token = await loginAndGetToken();

      const res = await request(app).get('/api/admin/analytics/day/not-a-date').set('Authorization', `Bearer ${token}`);

      expect(res.status).toBe(400);
      expect(res.body.error.code).toBe('VALIDATION_ERROR');
    });

    it('scopes reservations, revenue, and occupancy to the given lotId', async () => {
      const lotA = await insertLot({ capacity: 10 });
      const lotB = await insertLot({ capacity: 10 });
      const customer = await insertCustomer('lotid-day-customer@example.com');

      const date = new Date(Date.now() - 2 * 24 * HOUR_MS);
      const dateStr = date.toISOString().slice(0, 10);
      const dayStart = new Date(`${dateStr}T00:00:00.000Z`);
      const hour5Start = new Date(dayStart.getTime() + 5 * HOUR_MS);

      const rA = await insertReservation({
        lotId: lotA.id,
        customerId: customer,
        startTime: new Date(hour5Start.getTime() + 10 * 60_000),
        endTime: new Date(hour5Start.getTime() + 40 * 60_000),
        status: 'completed',
        totalCostCents: 800,
        createdAt: hour5Start,
      });
      await insertPayment({
        reservationId: rA,
        amountCents: 800,
        status: 'succeeded',
        createdAt: new Date(hour5Start.getTime() + 15 * 60_000),
      });

      // Lot B reservation overlapping the same hour: must not leak into lot A's scoped numbers.
      const rB = await insertReservation({
        lotId: lotB.id,
        customerId: customer,
        startTime: new Date(hour5Start.getTime() + 5 * 60_000),
        endTime: new Date(hour5Start.getTime() + 45 * 60_000),
        status: 'completed',
        totalCostCents: 500,
        createdAt: hour5Start,
      });
      await insertPayment({
        reservationId: rB,
        amountCents: 500,
        status: 'succeeded',
        createdAt: new Date(hour5Start.getTime() + 20 * 60_000),
      });

      const token = await loginAndGetToken();
      const res = await request(app)
        .get(`/api/admin/analytics/day/${dateStr}?lotId=${lotA.id}`)
        .set('Authorization', `Bearer ${token}`);

      expect(res.status).toBe(200);
      expect(DayBreakdownResponseSchema.parse(res.body)).toBeTruthy();
      const hour5 = res.body.rows.find((row: { hour: number }) => row.hour === 5);
      expect(hour5).toMatchObject({ reservations: 1, revenueCents: 800 });
      // 1 occupied / lotA capacity (10) = 10%, not 2/10 (combined reservations) nor 1/20 (fleet-wide).
      expect(hour5.occupancyPct).toBeCloseTo(10, 5);
    });

    it('returns 400 VALIDATION_ERROR when lotId is not a valid uuid', async () => {
      const token = await loginAndGetToken();

      const res = await request(app)
        .get('/api/admin/analytics/day/2026-01-01?lotId=not-a-uuid')
        .set('Authorization', `Bearer ${token}`);

      expect(res.status).toBe(400);
      expect(res.body.error.code).toBe('VALIDATION_ERROR');
    });
  });

  describe('GET /api/admin/analytics/export', () => {
    it('returns 401 UNAUTHORIZED without a token', async () => {
      const res = await request(app).get('/api/admin/analytics/export');
      expect(res.status).toBe(401);
    });

    it('returns a text/csv attachment with the header, one row per reservation, and RFC4180 quoting', async () => {
      const lot = await insertLot({ name: 'Downtown "Prime" Lot, West' });
      const customer = await insertCustomer('export-customer@example.com');
      const now = new Date();

      await insertReservation({
        lotId: lot.id,
        customerId: customer,
        startTime: new Date(now.getTime() - HOUR_MS),
        endTime: now,
        status: 'completed',
        totalCostCents: 1234,
        createdAt: now,
      });
      await insertReservation({
        lotId: lot.id,
        customerId: customer,
        startTime: new Date(now.getTime() + HOUR_MS),
        endTime: new Date(now.getTime() + 2 * HOUR_MS),
        status: 'cancelled',
        totalCostCents: 500,
        // 1s after the first reservation so ORDER BY created_at gives a deterministic row order.
        createdAt: new Date(now.getTime() + 1000),
      });

      const token = await loginAndGetToken();
      const res = await request(app).get('/api/admin/analytics/export').set('Authorization', `Bearer ${token}`);

      expect(res.status).toBe(200);
      expect(res.headers['content-type']).toContain('text/csv');
      expect(res.headers['content-disposition']).toBe('attachment; filename="reservations.csv"');

      const lines = (res.text as string).split('\r\n');
      expect(lines[0]).toBe('reservation_number,lot_name,start_time,end_time,status,total_cost_usd,created_at');
      // header + 2 data rows + trailing empty line from the final \r\n
      expect(lines).toHaveLength(4);
      expect(lines[3]).toBe('');
      expect(lines[1]).toContain('"Downtown ""Prime"" Lot, West"');
      expect(lines[1]).toContain(',12.34,');
    });
  });
});
