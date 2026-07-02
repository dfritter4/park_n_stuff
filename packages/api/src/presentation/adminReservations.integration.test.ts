import { randomUUID } from 'node:crypto';
import jwt from 'jsonwebtoken';
import type { Pool } from 'pg';
import request from 'supertest';
import type { Express } from 'express';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { createPool } from '../infrastructure/db.js';
import { PostgresAdminReservationRepository } from '../infrastructure/postgres/adminReservationRepository.js';
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

const lotInput = {
  name: 'Downtown Loop Garage',
  address: '100 Loop Ave',
  neighborhood: 'Loop District',
  lat: 47.6062,
  lng: -122.3321,
  capacity: 10,
  hourlyRateCents: 500,
};

interface FixtureLot {
  id: string;
  hourlyRateCents: number;
}

describe('admin reservations (integration)', () => {
  let pool: Pool;
  let app: Express;
  let lotRepository: PostgresLotRepository;
  let clock: FakeClock;
  let adminToken: string;

  beforeAll(() => {
    pool = createPool(DATABASE_URL);
    lotRepository = new PostgresLotRepository(pool);
    const uow = new PostgresReservationUnitOfWork(pool);
    const reservationRepository = new PostgresReservationRepository(pool);
    const adminUserRepository = new PostgresAdminUserRepository(pool);
    const analyticsRepository = new PostgresAnalyticsRepository(pool);
    const gateway = new MockPaymentGateway(() => 0);
    clock = new FakeClock(new Date('2026-01-01T00:00:00.000Z'));

    const pricingRuleRepository = new PostgresPricingRuleRepository(pool);
    const capacityOverrideRepository = new PostgresCapacityOverrideRepository(pool);
    const declinedAttemptRepository = new PostgresDeclinedAttemptRepository(pool);
    const adminReservationRepository = new PostgresAdminReservationRepository(pool);

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
      pricingRuleRepository,
      capacityOverrideRepository,
      adminReservationRepository,
      clock,
    });

    adminToken = jwt.sign({ sub: 'admin-user' }, JWT_SECRET, { expiresIn: '1h' });
  });

  beforeEach(async () => {
    await pool.query('TRUNCATE TABLE payments, reservations, customers, admin_users, lots RESTART IDENTITY CASCADE');
  });

  afterAll(async () => {
    await pool.end();
  });

  const authed = () => ({ Authorization: `Bearer ${adminToken}` });

  async function seedLot(overrides: Partial<typeof lotInput> = {}): Promise<FixtureLot> {
    const lot = await lotRepository.create({ ...lotInput, ...overrides });
    return { id: lot.id, hourlyRateCents: lot.hourlyRateCents };
  }

  async function seedCustomer(overrides: {
    name?: string;
    email?: string;
    phone?: string;
    flagged?: boolean;
  } = {}): Promise<string> {
    const result = await pool.query<{ id: string }>(
      `INSERT INTO customers (name, email, phone, flagged) VALUES ($1, $2, $3, $4) RETURNING id`,
      [
        overrides.name ?? 'Alice Example',
        overrides.email ?? `alice-${randomUUID()}@example.com`,
        overrides.phone ?? '555-0100',
        overrides.flagged ?? false,
      ],
    );
    return result.rows[0].id;
  }

  async function seedReservation(opts: {
    lotId: string;
    customerId: string;
    reservationNumber?: string;
    licensePlate?: string;
    startTime: Date;
    endTime: Date;
    totalCostCents?: number;
    status?: 'active' | 'completed' | 'cancelled';
    createdAt?: Date;
  }): Promise<string> {
    const result = await pool.query<{ id: string }>(
      `INSERT INTO reservations
         (reservation_number, lot_id, customer_id, vehicle_make, vehicle_model, license_plate, start_time, end_time, total_cost_cents, status)
       VALUES ($1, $2, $3, 'Honda', 'Civic', $4, $5, $6, $7, $8)
       RETURNING id`,
      [
        opts.reservationNumber ?? `LOT-20260101-${randomUUID().slice(0, 5).toUpperCase()}`,
        opts.lotId,
        opts.customerId,
        opts.licensePlate ?? 'ABC123',
        opts.startTime,
        opts.endTime,
        opts.totalCostCents ?? 1000,
        opts.status ?? 'active',
      ],
    );
    const id = result.rows[0].id;
    if (opts.createdAt) {
      await pool.query('UPDATE reservations SET created_at = $2 WHERE id = $1', [id, opts.createdAt]);
    }
    return id;
  }

  async function seedPayment(opts: {
    reservationId: string;
    amountCents?: number;
    status?: 'succeeded' | 'declined' | 'refunded';
    transactionId?: string;
    cardLast4?: string;
    createdAt?: Date;
  }): Promise<void> {
    const result = await pool.query<{ id: string }>(
      `INSERT INTO payments (reservation_id, amount_cents, status, transaction_id, card_last4)
       VALUES ($1, $2, $3, $4, $5) RETURNING id`,
      [
        opts.reservationId,
        opts.amountCents ?? 1000,
        opts.status ?? 'succeeded',
        opts.transactionId ?? `txn_${randomUUID().slice(0, 8)}`,
        opts.cardLast4 ?? '0001',
      ],
    );
    if (opts.createdAt) {
      await pool.query('UPDATE payments SET created_at = $2 WHERE id = $1', [opts.createdAt, result.rows[0].id]);
    }
  }

  describe('GET /api/admin/reservations', () => {
    it('401s without a token', async () => {
      const res = await request(app).get('/api/admin/reservations');
      expect(res.status).toBe(401);
    });

    it('paginates and orders by created_at DESC, returning {rows,total}', async () => {
      const lot = await seedLot();
      const customer = await seedCustomer();
      const t0 = new Date('2026-01-01T09:00:00.000Z');
      const ids = [];
      for (let i = 0; i < 3; i++) {
        ids.push(
          await seedReservation({
            lotId: lot.id,
            customerId: customer,
            startTime: t0,
            endTime: new Date(t0.getTime() + 3600_000),
            createdAt: new Date(t0.getTime() + i * 60_000),
          }),
        );
      }

      const res = await request(app)
        .get('/api/admin/reservations')
        .query({ page: 1, pageSize: 2 })
        .set(authed());

      expect(res.status).toBe(200);
      expect(res.body.total).toBe(3);
      expect(res.body.rows).toHaveLength(2);
      // Newest created_at first.
      expect(res.body.rows[0].id).toBe(ids[2]);
      expect(res.body.rows[1].id).toBe(ids[1]);
    });

    it('defaults to page 1 pageSize 25, and caps pageSize at 100', async () => {
      const res = await request(app).get('/api/admin/reservations').query({ pageSize: 500 }).set(authed());
      expect(res.status).toBe(400);
      expect(res.body.error.code).toBe('VALIDATION_ERROR');
    });

    it('filters by lotId', async () => {
      const lotA = await seedLot();
      const lotB = await seedLot();
      const customer = await seedCustomer();
      const t0 = new Date('2026-01-01T09:00:00.000Z');
      await seedReservation({ lotId: lotA.id, customerId: customer, startTime: t0, endTime: new Date(t0.getTime() + 3600_000) });
      await seedReservation({ lotId: lotB.id, customerId: customer, startTime: t0, endTime: new Date(t0.getTime() + 3600_000) });

      const res = await request(app).get('/api/admin/reservations').query({ lotId: lotA.id }).set(authed());

      expect(res.status).toBe(200);
      expect(res.body.total).toBe(1);
      expect(res.body.rows[0].lotId).toBe(lotA.id);
    });

    it('filters by status', async () => {
      const lot = await seedLot();
      const customer = await seedCustomer();
      const t0 = new Date('2026-01-01T09:00:00.000Z');
      await seedReservation({ lotId: lot.id, customerId: customer, startTime: t0, endTime: new Date(t0.getTime() + 3600_000), status: 'active' });
      await seedReservation({ lotId: lot.id, customerId: customer, startTime: t0, endTime: new Date(t0.getTime() + 3600_000), status: 'cancelled' });

      const res = await request(app).get('/api/admin/reservations').query({ status: 'cancelled' }).set(authed());

      expect(res.status).toBe(200);
      expect(res.body.total).toBe(1);
      expect(res.body.rows[0].status).toBe('cancelled');
    });

    it('filters by from/to on start_time (inclusive)', async () => {
      const lot = await seedLot();
      const customer = await seedCustomer();
      const inRange = await seedReservation({
        lotId: lot.id,
        customerId: customer,
        startTime: new Date('2026-02-15T10:00:00.000Z'),
        endTime: new Date('2026-02-15T12:00:00.000Z'),
      });
      await seedReservation({
        lotId: lot.id,
        customerId: customer,
        startTime: new Date('2026-03-15T10:00:00.000Z'),
        endTime: new Date('2026-03-15T12:00:00.000Z'),
      });

      const res = await request(app)
        .get('/api/admin/reservations')
        .query({ from: '2026-02-01T00:00:00.000Z', to: '2026-02-28T00:00:00.000Z' })
        .set(authed());

      expect(res.status).toBe(200);
      expect(res.body.total).toBe(1);
      expect(res.body.rows[0].id).toBe(inRange);
    });

    it('searches by reservation_number, license_plate, customer name, and email (ILIKE)', async () => {
      const lot = await seedLot();
      const t0 = new Date('2026-01-01T09:00:00.000Z');
      const t1 = new Date(t0.getTime() + 3600_000);

      const byNumberCustomer = await seedCustomer();
      const byNumber = await seedReservation({
        lotId: lot.id,
        customerId: byNumberCustomer,
        reservationNumber: 'LOT-20260101-FINDME',
        startTime: t0,
        endTime: t1,
      });

      const byPlateCustomer = await seedCustomer();
      const byPlate = await seedReservation({
        lotId: lot.id,
        customerId: byPlateCustomer,
        licensePlate: 'FINDPLATE',
        startTime: t0,
        endTime: t1,
      });

      const byNameCustomer = await seedCustomer({ name: 'Zelda Findable Target' });
      const byName = await seedReservation({ lotId: lot.id, customerId: byNameCustomer, startTime: t0, endTime: t1 });

      const byEmailCustomer = await seedCustomer({ email: 'findable-target@example.com' });
      const byEmail = await seedReservation({ lotId: lot.id, customerId: byEmailCustomer, startTime: t0, endTime: t1 });

      for (const [term, expectedId] of [
        ['findme', byNumber],
        ['findplate', byPlate],
        ['findable target', byName],
        ['findable-target', byEmail],
      ] as const) {
        const res = await request(app).get('/api/admin/reservations').query({ search: term }).set(authed());
        expect(res.status).toBe(200);
        expect(res.body.rows.map((r: { id: string }) => r.id)).toContain(expectedId);
      }
    });

    it('activeNow=true returns only reservations active right now', async () => {
      const lot = await seedLot();
      const customer = await seedCustomer();
      const now = Date.now();

      const activeNow = await seedReservation({
        lotId: lot.id,
        customerId: customer,
        startTime: new Date(now - 3600_000),
        endTime: new Date(now + 3600_000),
        status: 'active',
      });
      // Active status, but window already in the past.
      await seedReservation({
        lotId: lot.id,
        customerId: customer,
        startTime: new Date(now - 7200_000),
        endTime: new Date(now - 3600_000),
        status: 'active',
      });

      const res = await request(app).get('/api/admin/reservations').query({ activeNow: 'true' }).set(authed());

      expect(res.status).toBe(200);
      expect(res.body.total).toBe(1);
      expect(res.body.rows[0].id).toBe(activeNow);
    });
  });

  describe('GET /api/admin/reservations/:id', () => {
    it('404s for an unknown id', async () => {
      const res = await request(app).get(`/api/admin/reservations/${randomUUID()}`).set(authed());
      expect(res.status).toBe(404);
      expect(res.body.error.code).toBe('RESERVATION_NOT_FOUND');
    });

    it('returns full detail incl. customer and payments', async () => {
      const lot = await seedLot();
      const customer = await seedCustomer({ name: 'Bob Detail', email: 'bob@example.com', flagged: true });
      const reservationId = await seedReservation({
        lotId: lot.id,
        customerId: customer,
        startTime: new Date('2026-01-01T09:00:00.000Z'),
        endTime: new Date('2026-01-01T11:00:00.000Z'),
        totalCostCents: 1000,
      });
      await seedPayment({ reservationId, amountCents: 1000, status: 'succeeded', cardLast4: '4242' });

      const res = await request(app).get(`/api/admin/reservations/${reservationId}`).set(authed());

      expect(res.status).toBe(200);
      expect(res.body).toMatchObject({
        id: reservationId,
        lotId: lot.id,
        customer: { name: 'Bob Detail', email: 'bob@example.com', flagged: true },
        payments: [expect.objectContaining({ amountCents: 1000, status: 'succeeded', cardLast4: '4242' })],
      });
    });
  });

  describe('POST /api/admin/reservations/:id/cancel', () => {
    it('404s for an unknown id', async () => {
      const res = await request(app).post(`/api/admin/reservations/${randomUUID()}/cancel`).set(authed());
      expect(res.status).toBe(404);
    });

    it('409s RESERVATION_NOT_ACTIVE for an already-cancelled reservation', async () => {
      const lot = await seedLot();
      const customer = await seedCustomer();
      const reservationId = await seedReservation({
        lotId: lot.id,
        customerId: customer,
        startTime: new Date('2026-01-01T09:00:00.000Z'),
        endTime: new Date('2026-01-01T11:00:00.000Z'),
        status: 'cancelled',
      });

      const res = await request(app).post(`/api/admin/reservations/${reservationId}/cancel`).set(authed());

      expect(res.status).toBe(409);
      expect(res.body.error.code).toBe('RESERVATION_NOT_ACTIVE');
    });

    it('cancels an active reservation and refunds all its succeeded payments (leaving declined payments untouched)', async () => {
      const lot = await seedLot();
      const customer = await seedCustomer();
      const reservationId = await seedReservation({
        lotId: lot.id,
        customerId: customer,
        startTime: new Date('2026-01-01T09:00:00.000Z'),
        endTime: new Date('2026-01-01T11:00:00.000Z'),
        totalCostCents: 1000,
      });
      await seedPayment({ reservationId, amountCents: 1000, status: 'succeeded' });
      await seedPayment({ reservationId, amountCents: 500, status: 'succeeded' });
      await seedPayment({ reservationId, amountCents: 250, status: 'declined' });

      const res = await request(app).post(`/api/admin/reservations/${reservationId}/cancel`).set(authed());

      expect(res.status).toBe(200);
      expect(res.body.status).toBe('cancelled');
      const statuses = res.body.payments.map((p: { status: string; amountCents: number }) => [p.amountCents, p.status]);
      expect(statuses).toEqual(
        expect.arrayContaining([
          [1000, 'refunded'],
          [500, 'refunded'],
          [250, 'declined'],
        ]),
      );
    });
  });

  describe('POST /api/admin/reservations/:id/extend', () => {
    it('404s for an unknown id', async () => {
      const res = await request(app)
        .post(`/api/admin/reservations/${randomUUID()}/extend`)
        .set(authed())
        .send({ newEndTime: '2026-01-01T12:00:00.000Z' });
      expect(res.status).toBe(404);
    });

    it('409s RESERVATION_NOT_ACTIVE for a cancelled reservation', async () => {
      const lot = await seedLot();
      const customer = await seedCustomer();
      const reservationId = await seedReservation({
        lotId: lot.id,
        customerId: customer,
        startTime: new Date('2026-01-01T09:00:00.000Z'),
        endTime: new Date('2026-01-01T11:00:00.000Z'),
        status: 'cancelled',
      });

      const res = await request(app)
        .post(`/api/admin/reservations/${reservationId}/extend`)
        .set(authed())
        .send({ newEndTime: '2026-01-01T12:00:00.000Z' });

      expect(res.status).toBe(409);
      expect(res.body.error.code).toBe('RESERVATION_NOT_ACTIVE');
    });

    it('400s INVALID_EXTENSION when newEndTime is not after the current end_time', async () => {
      const lot = await seedLot();
      const customer = await seedCustomer();
      const reservationId = await seedReservation({
        lotId: lot.id,
        customerId: customer,
        startTime: new Date('2026-01-01T09:00:00.000Z'),
        endTime: new Date('2026-01-01T11:00:00.000Z'),
      });
      await seedPayment({ reservationId });

      const res = await request(app)
        .post(`/api/admin/reservations/${reservationId}/extend`)
        .set(authed())
        .send({ newEndTime: '2026-01-01T11:00:00.000Z' });

      expect(res.status).toBe(400);
      expect(res.body.error.code).toBe('INVALID_EXTENSION');
    });

    it('prices the delta window with the lot rate, updates end_time/total_cost_cents, and adds a succeeded payment reusing the original card_last4', async () => {
      const lot = await seedLot({ hourlyRateCents: 500 });
      const customer = await seedCustomer();
      const reservationId = await seedReservation({
        lotId: lot.id,
        customerId: customer,
        startTime: new Date('2026-01-01T09:00:00.000Z'),
        endTime: new Date('2026-01-01T11:00:00.000Z'),
        totalCostCents: 1000,
      });
      await seedPayment({ reservationId, amountCents: 1000, cardLast4: '9999' });

      const res = await request(app)
        .post(`/api/admin/reservations/${reservationId}/extend`)
        .set(authed())
        .send({ newEndTime: '2026-01-01T12:00:00.000Z' });

      expect(res.status).toBe(200);
      expect(res.body.endTime).toBe('2026-01-01T12:00:00.000Z');
      expect(res.body.totalCostCents).toBe(1500);
      expect(res.body.payments).toHaveLength(2);
      const newPayment = res.body.payments.find((p: { amountCents: number }) => p.amountCents === 500);
      expect(newPayment).toMatchObject({ status: 'succeeded', cardLast4: '9999' });
    });

    it('applies rule-priced rates to the delta window, not the base rate', async () => {
      const lot = await seedLot({ hourlyRateCents: 500 });
      // A pricing rule covering the extension's hour at double the base rate.
      await pool.query(
        `INSERT INTO pricing_rules (lot_id, day_type, start_hour, end_hour, hourly_rate_cents) VALUES ($1, 'all', 0, 24, 1000)`,
        [lot.id],
      );
      const customer = await seedCustomer();
      const reservationId = await seedReservation({
        lotId: lot.id,
        customerId: customer,
        startTime: new Date('2026-01-01T09:00:00.000Z'),
        endTime: new Date('2026-01-01T11:00:00.000Z'),
        totalCostCents: 1000,
      });
      await seedPayment({ reservationId, amountCents: 1000, cardLast4: '9999' });

      const res = await request(app)
        .post(`/api/admin/reservations/${reservationId}/extend`)
        .set(authed())
        .send({ newEndTime: '2026-01-01T12:00:00.000Z' });

      expect(res.status).toBe(200);
      expect(res.body.totalCostCents).toBe(2000); // 1000 original + 1 hr * 1000/hr rule rate
    });

    it('409s LOT_FULL when the extension window has no remaining capacity', async () => {
      const lot = await seedLot({ capacity: 1 });
      const customer = await seedCustomer();
      const reservationId = await seedReservation({
        lotId: lot.id,
        customerId: customer,
        startTime: new Date('2026-01-01T09:00:00.000Z'),
        endTime: new Date('2026-01-01T11:00:00.000Z'),
        totalCostCents: 1000,
      });
      await seedPayment({ reservationId, amountCents: 1000 });
      // Occupies the lot's only space for exactly the extension window.
      const otherCustomer = await seedCustomer({ email: `other-${randomUUID()}@example.com` });
      await seedReservation({
        lotId: lot.id,
        customerId: otherCustomer,
        startTime: new Date('2026-01-01T11:00:00.000Z'),
        endTime: new Date('2026-01-01T13:00:00.000Z'),
      });

      const res = await request(app)
        .post(`/api/admin/reservations/${reservationId}/extend`)
        .set(authed())
        .send({ newEndTime: '2026-01-01T12:00:00.000Z' });

      expect(res.status).toBe(409);
      expect(res.body.error.code).toBe('LOT_FULL');
    });
  });

  describe('GET /api/admin/lots/:id/current', () => {
    it('returns active-now reservations for the lot, and excludes past/future/other-lot ones', async () => {
      const lot = await seedLot();
      const otherLot = await seedLot();
      const customer = await seedCustomer({ name: 'Current Carla' });
      const now = new Date('2026-01-01T00:00:00.000Z'); // matches the app's FakeClock
      clock.set(now);

      const activeId = await seedReservation({
        lotId: lot.id,
        customerId: customer,
        startTime: new Date(now.getTime() - 3600_000),
        endTime: new Date(now.getTime() + 3600_000),
      });
      // Not active yet.
      await seedReservation({
        lotId: lot.id,
        customerId: customer,
        startTime: new Date(now.getTime() + 3600_000),
        endTime: new Date(now.getTime() + 7200_000),
      });
      // Different lot.
      await seedReservation({
        lotId: otherLot.id,
        customerId: customer,
        startTime: new Date(now.getTime() - 3600_000),
        endTime: new Date(now.getTime() + 3600_000),
      });

      const res = await request(app).get(`/api/admin/lots/${lot.id}/current`).set(authed());

      expect(res.status).toBe(200);
      expect(res.body).toHaveLength(1);
      expect(res.body[0]).toMatchObject({ customerName: 'Current Carla' });
      const activeReservation = await pool.query('SELECT id FROM reservations WHERE id = $1', [activeId]);
      expect(activeReservation.rows).toHaveLength(1);
    });
  });
});
