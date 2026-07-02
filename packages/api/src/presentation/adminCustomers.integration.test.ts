import bcrypt from 'bcryptjs';
import type { Pool } from 'pg';
import request from 'supertest';
import type { Express } from 'express';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import type { CreateReservationRequest } from '@parking/shared';
import { createPool } from '../infrastructure/db.js';
import { PostgresAdminCustomerRepository } from '../infrastructure/postgres/adminCustomerRepository.js';
import { PostgresAdminUserRepository } from '../infrastructure/postgres/adminUserRepository.js';
import { PostgresAnalyticsRepository } from '../infrastructure/postgres/analyticsRepository.js';
import { PostgresCapacityOverrideRepository } from '../infrastructure/postgres/capacityOverrideRepository.js';
import { PostgresDeclinedAttemptRepository } from '../infrastructure/postgres/declinedAttemptRepository.js';
import { PostgresLotRepository } from '../infrastructure/postgres/lotRepository.js';
import { PostgresPricingRuleRepository } from '../infrastructure/postgres/pricingRuleRepository.js';
import { PostgresReservationRepository } from '../infrastructure/postgres/reservationRepository.js';
import { PostgresReservationUnitOfWork } from '../infrastructure/postgres/reservationUnitOfWork.js';
import { MockPaymentGateway } from '../infrastructure/mockPaymentGateway.js';
import { AnalyticsService } from '../application/analyticsService.js';
import { CreateReservationService } from '../application/createReservation.js';
import { LotService } from '../application/lotService.js';
import { FakeClock } from '../application/testing/fakes.js';
import { createApp } from './app.js';

const DATABASE_URL = process.env.DATABASE_URL ?? 'postgres://parking:parking@localhost:5433/parking_test';
const JWT_SECRET = 'test-secret';
const ADMIN_EMAIL = 'admin@example.com';
const ADMIN_PASSWORD = 'correct-horse-battery-staple';

const lotInput = {
  name: 'Downtown Loop Garage',
  address: '100 Loop Ave',
  neighborhood: 'Loop District',
  lat: 47.6062,
  lng: -122.3321,
  capacity: 10,
  hourlyRateCents: 500,
};

function buildReservationRequest(
  lotId: string,
  overrides: Partial<CreateReservationRequest> = {},
): CreateReservationRequest {
  return {
    lotId,
    customer: { name: 'Alice Example', email: 'alice@example.com', phone: '555-0100' },
    vehicle: { make: 'Honda', model: 'Civic', licensePlate: 'ABC123' },
    startTime: '2026-01-01T10:00:00.000Z',
    endTime: '2026-01-01T12:00:00.000Z',
    payment: {
      cardNumber: '4111111111110001',
      expiry: '01/30',
      cvc: '123',
      cardholderName: 'Alice Example',
    },
    ...overrides,
  };
}

describe('admin customers (integration)', () => {
  let pool: Pool;
  let app: Express;
  let adminUserRepository: PostgresAdminUserRepository;
  let lotRepository: PostgresLotRepository;

  beforeAll(() => {
    pool = createPool(DATABASE_URL);
    lotRepository = new PostgresLotRepository(pool);
    const uow = new PostgresReservationUnitOfWork(pool);
    const reservationRepository = new PostgresReservationRepository(pool);
    adminUserRepository = new PostgresAdminUserRepository(pool);
    const analyticsRepository = new PostgresAnalyticsRepository(pool);
    const pricingRuleRepository = new PostgresPricingRuleRepository(pool);
    const capacityOverrideRepository = new PostgresCapacityOverrideRepository(pool);
    const declinedAttemptRepository = new PostgresDeclinedAttemptRepository(pool);
    const adminCustomerRepository = new PostgresAdminCustomerRepository(pool);
    const gateway = new MockPaymentGateway(() => 0);
    const clock = new FakeClock(new Date('2026-01-01T00:00:00.000Z'));

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
      adminCustomerRepository,
      reservationRateLimit: { windowMs: 60_000, max: 1000 },
    });
  });

  beforeEach(async () => {
    await pool.query('TRUNCATE TABLE payments, reservations, customers, admin_users, lots RESTART IDENTITY CASCADE');
  });

  afterAll(async () => {
    await pool.end();
  });

  async function loginAndGetToken(): Promise<string> {
    const passwordHash = await bcrypt.hash(ADMIN_PASSWORD, 10);
    await adminUserRepository.create(ADMIN_EMAIL, passwordHash);
    const res = await request(app).post('/api/admin/auth/login').send({ email: ADMIN_EMAIL, password: ADMIN_PASSWORD });
    return res.body.token as string;
  }

  async function insertCustomer(overrides: {
    name?: string;
    email?: string;
    phone?: string;
    flagged?: boolean;
    flagReason?: string | null;
  } = {}): Promise<string> {
    const result = await pool.query<{ id: string }>(
      `INSERT INTO customers (name, email, phone, flagged, flag_reason)
       VALUES ($1, $2, $3, $4, $5) RETURNING id`,
      [
        overrides.name ?? 'Alice Example',
        overrides.email ?? 'alice@example.com',
        overrides.phone ?? '555-0100',
        overrides.flagged ?? false,
        overrides.flagReason ?? null,
      ],
    );
    return result.rows[0].id;
  }

  describe('GET /api/admin/customers', () => {
    it('returns 401 UNAUTHORIZED without a token', async () => {
      const res = await request(app).get('/api/admin/customers');
      expect(res.status).toBe(401);
    });

    it('lists customers with aggregates and supports search + pagination', async () => {
      const token = await loginAndGetToken();
      const lot = await lotRepository.create(lotInput);
      await request(app).post('/api/reservations').send(buildReservationRequest(lot.id));

      const res = await request(app)
        .get('/api/admin/customers')
        .set('Authorization', `Bearer ${token}`)
        .query({ search: 'alice' });

      expect(res.status).toBe(200);
      expect(res.body.total).toBe(1);
      expect(res.body.rows[0]).toMatchObject({
        name: 'Alice Example',
        email: 'alice@example.com',
        reservationCount: 1,
        lifetimeSpendCents: expect.any(Number),
        flagged: false,
      });

      const noMatch = await request(app)
        .get('/api/admin/customers')
        .set('Authorization', `Bearer ${token}`)
        .query({ search: 'nobody-matches-this' });
      expect(noMatch.body.total).toBe(0);
      expect(noMatch.body.rows).toEqual([]);
    });

    it('returns 400 VALIDATION_ERROR for an out-of-range pageSize', async () => {
      const token = await loginAndGetToken();

      const res = await request(app)
        .get('/api/admin/customers')
        .set('Authorization', `Bearer ${token}`)
        .query({ pageSize: 500 });

      expect(res.status).toBe(400);
      expect(res.body.error.code).toBe('VALIDATION_ERROR');
    });
  });

  describe('GET /api/admin/customers/:id', () => {
    it('returns 404 CUSTOMER_NOT_FOUND for an unknown id', async () => {
      const token = await loginAndGetToken();

      const res = await request(app)
        .get('/api/admin/customers/00000000-0000-0000-0000-000000000000')
        .set('Authorization', `Bearer ${token}`);

      expect(res.status).toBe(404);
      expect(res.body).toEqual({ error: { code: 'CUSTOMER_NOT_FOUND', message: expect.any(String) } });
    });

    it('returns the customer with their latest reservations', async () => {
      const token = await loginAndGetToken();
      const lot = await lotRepository.create(lotInput);
      const created = await request(app).post('/api/reservations').send(buildReservationRequest(lot.id));

      const listRes = await request(app)
        .get('/api/admin/customers')
        .set('Authorization', `Bearer ${token}`);
      const customerId = listRes.body.rows[0].id;

      const res = await request(app)
        .get(`/api/admin/customers/${customerId}`)
        .set('Authorization', `Bearer ${token}`);

      expect(res.status).toBe(200);
      expect(res.body).toMatchObject({ id: customerId, name: 'Alice Example', flagged: false });
      expect(res.body.reservations).toHaveLength(1);
      expect(res.body.reservations[0]).toMatchObject({
        id: created.body.id,
        lotName: lot.name,
        status: 'active',
      });
    });
  });

  describe('flag / unflag end-to-end gating on reservation creation', () => {
    it('flagging a customer via the API blocks their next POST /api/reservations with 403 CUSTOMER_FLAGGED; unflagging allows it again', async () => {
      const token = await loginAndGetToken();
      const lot = await lotRepository.create(lotInput);
      const customerId = await insertCustomer({ email: 'alice@example.com' });

      const flagRes = await request(app)
        .post(`/api/admin/customers/${customerId}/flag`)
        .set('Authorization', `Bearer ${token}`)
        .send({ reason: 'suspicious chargeback pattern' });
      expect(flagRes.status).toBe(200);
      expect(flagRes.body).toMatchObject({ id: customerId, flagged: true, flagReason: 'suspicious chargeback pattern' });

      const blockedRes = await request(app).post('/api/reservations').send(buildReservationRequest(lot.id));
      expect(blockedRes.status).toBe(403);
      expect(blockedRes.body).toEqual({ error: { code: 'CUSTOMER_FLAGGED', message: expect.any(String) } });

      const reservationsAfterBlock = await pool.query('SELECT COUNT(*) FROM reservations');
      expect(Number(reservationsAfterBlock.rows[0].count)).toBe(0);

      const unflagRes = await request(app)
        .post(`/api/admin/customers/${customerId}/unflag`)
        .set('Authorization', `Bearer ${token}`);
      expect(unflagRes.status).toBe(200);
      expect(unflagRes.body).toMatchObject({ id: customerId, flagged: false, flagReason: null });

      const allowedRes = await request(app).post('/api/reservations').send(buildReservationRequest(lot.id));
      expect(allowedRes.status).toBe(201);
    });

    it('returns 401 UNAUTHORIZED for flag/unflag without a token', async () => {
      const customerId = await insertCustomer();

      const flagRes = await request(app).post(`/api/admin/customers/${customerId}/flag`).send({ reason: 'x' });
      expect(flagRes.status).toBe(401);

      const unflagRes = await request(app).post(`/api/admin/customers/${customerId}/unflag`);
      expect(unflagRes.status).toBe(401);
    });

    it('returns 400 VALIDATION_ERROR for a flag reason outside 1-300 chars', async () => {
      const token = await loginAndGetToken();
      const customerId = await insertCustomer();

      const res = await request(app)
        .post(`/api/admin/customers/${customerId}/flag`)
        .set('Authorization', `Bearer ${token}`)
        .send({ reason: '' });

      expect(res.status).toBe(400);
      expect(res.body.error.code).toBe('VALIDATION_ERROR');
    });

    it('returns 404 CUSTOMER_NOT_FOUND when flagging an unknown customer', async () => {
      const token = await loginAndGetToken();

      const res = await request(app)
        .post('/api/admin/customers/00000000-0000-0000-0000-000000000000/flag')
        .set('Authorization', `Bearer ${token}`)
        .send({ reason: 'unknown customer' });

      expect(res.status).toBe(404);
      expect(res.body).toEqual({ error: { code: 'CUSTOMER_NOT_FOUND', message: expect.any(String) } });
    });
  });
});
