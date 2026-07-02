import type { Pool } from 'pg';
import request from 'supertest';
import type { Express } from 'express';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import type { CreateReservationRequest } from '@parking/shared';
import { createPool } from '../infrastructure/db.js';
import { PostgresLotRepository } from '../infrastructure/postgres/lotRepository.js';
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

describe('presentation routes (integration)', () => {
  let pool: Pool;
  let app: Express;

  beforeAll(() => {
    pool = createPool(DATABASE_URL);
    const lotRepository = new PostgresLotRepository(pool);
    const uow = new PostgresReservationUnitOfWork(pool);
    const reservationRepository = new PostgresReservationRepository(pool);
    const adminUserRepository = new PostgresAdminUserRepository(pool);
    const analyticsRepository = new PostgresAnalyticsRepository(pool);
    const gateway = new MockPaymentGateway(() => 0);
    const clock = new FakeClock(new Date('2026-01-01T00:00:00.000Z'));

    const lotService = new LotService(lotRepository);
    const createReservationService = new CreateReservationService(uow, gateway, clock);
    const analyticsService = new AnalyticsService(analyticsRepository);

    app = createApp({
      lotService,
      createReservationService,
      reservationRepository,
      adminUserRepository,
      analyticsService,
      jwtSecret: 'test-secret',
      corsOrigins: ['http://localhost:5173'],
      // High ceiling so the many POSTs in this file don't trip the 10/min limiter.
      // Rate-limit enforcement itself is covered by the dedicated describe block below.
      reservationRateLimit: { windowMs: 60_000, max: 1000 },
    });
  });

  beforeEach(async () => {
    await pool.query('TRUNCATE TABLE payments, reservations, customers, admin_users, lots RESTART IDENTITY CASCADE');
  });

  afterAll(async () => {
    await pool.end();
  });

  describe('GET /api/health', () => {
    it('returns ok:true', async () => {
      const res = await request(app).get('/api/health');
      expect(res.status).toBe(200);
      expect(res.body).toEqual({ ok: true });
    });
  });

  describe('POST /api/reservations', () => {
    it('creates a reservation end-to-end and returns 201 with the full Reservation shape', async () => {
      const lotRepository = new PostgresLotRepository(pool);
      const lot = await lotRepository.create(lotInput);

      const res = await request(app).post('/api/reservations').send(buildReservationRequest(lot.id));

      expect(res.status).toBe(201);
      expect(res.body).toMatchObject({
        lotId: lot.id,
        lotName: lot.name,
        lotAddress: lot.address,
        customerName: 'Alice Example',
        vehicleMake: 'Honda',
        vehicleModel: 'Civic',
        licensePlate: 'ABC123',
        totalCostCents: 1000,
        status: 'active',
        cardLast4: '0001',
      });
      expect(res.body.id).toBeDefined();
      expect(res.body.reservationNumber).toMatch(/^LOT-\d{8}-[0-9A-Z]{5}$/);
      expect(new Date(res.body.startTime).toISOString()).toBe('2026-01-01T10:00:00.000Z');
      expect(new Date(res.body.createdAt).toISOString()).not.toBe('Invalid Date');
    });

    it('returns 409 LOT_FULL in the error envelope when the lot has no remaining capacity', async () => {
      const lotRepository = new PostgresLotRepository(pool);
      const lot = await lotRepository.create({ ...lotInput, capacity: 1 });

      const first = await request(app).post('/api/reservations').send(buildReservationRequest(lot.id));
      expect(first.status).toBe(201);

      const second = await request(app)
        .post('/api/reservations')
        .send(buildReservationRequest(lot.id, { vehicle: { make: 'Toyota', model: 'Corolla', licensePlate: 'XYZ999' } }));

      expect(second.status).toBe(409);
      expect(second.body).toEqual({ error: { code: 'LOT_FULL', message: expect.any(String) } });
    });

    it('returns 402 PAYMENT_DECLINED in the error envelope for a card ending in 0002', async () => {
      const lotRepository = new PostgresLotRepository(pool);
      const lot = await lotRepository.create(lotInput);

      const res = await request(app)
        .post('/api/reservations')
        .send(buildReservationRequest(lot.id, { payment: { ...buildReservationRequest(lot.id).payment, cardNumber: '4111111111110002' } }));

      expect(res.status).toBe(402);
      expect(res.body).toEqual({ error: { code: 'PAYMENT_DECLINED', message: expect.any(String) } });
    });

    it('returns 400 VALIDATION_ERROR with Zod details for an invalid body', async () => {
      const res = await request(app)
        .post('/api/reservations')
        .send({ lotId: 'not-a-uuid' });

      expect(res.status).toBe(400);
      expect(res.body.error.code).toBe('VALIDATION_ERROR');
      expect(res.body.error.details).toBeDefined();
    });
  });

  describe('GET /api/reservations/:id', () => {
    it('returns the shared Reservation shape', async () => {
      const lotRepository = new PostgresLotRepository(pool);
      const lot = await lotRepository.create(lotInput);

      const created = await request(app).post('/api/reservations').send(buildReservationRequest(lot.id));
      const res = await request(app).get(`/api/reservations/${created.body.id}`);

      expect(res.status).toBe(200);
      expect(res.body).toEqual(created.body);
    });

    it('returns 404 RESERVATION_NOT_FOUND for an unknown but well-formed id', async () => {
      const res = await request(app).get('/api/reservations/00000000-0000-0000-0000-000000000000');
      expect(res.status).toBe(404);
      expect(res.body).toEqual({ error: { code: 'RESERVATION_NOT_FOUND', message: expect.any(String) } });
    });
  });

  describe('GET /api/lots', () => {
    it('filters case-insensitively on ?search across name/address/neighborhood', async () => {
      const lotRepository = new PostgresLotRepository(pool);
      await lotRepository.create(lotInput);
      await lotRepository.create({ ...lotInput, name: 'Uptown Garage', address: '9 Hill St', neighborhood: 'Uptown' });

      const res = await request(app).get('/api/lots').query({ search: 'LOOP' });

      expect(res.status).toBe(200);
      expect(res.body).toHaveLength(1);
      expect(res.body[0].name).toBe('Downtown Loop Garage');
    });

    it('sorts by ?lat&lng nearest-first', async () => {
      const lotRepository = new PostgresLotRepository(pool);
      // Seattle-ish coordinates, ~1km apart
      const near = await lotRepository.create({ ...lotInput, name: 'Near Lot', lat: 47.61, lng: -122.33 });
      const far = await lotRepository.create({ ...lotInput, name: 'Far Lot', lat: 48.5, lng: -123.5 });

      const res = await request(app).get('/api/lots').query({ lat: '47.6062', lng: '-122.3321' });

      expect(res.status).toBe(200);
      expect(res.body.map((lot: { id: string }) => lot.id)).toEqual([near.id, far.id]);
    });
  });

  describe('GET /api/lots/:id', () => {
    it('returns 404 LOT_NOT_FOUND for an unknown but well-formed id', async () => {
      const res = await request(app).get('/api/lots/00000000-0000-0000-0000-000000000000');
      expect(res.status).toBe(404);
      expect(res.body).toEqual({ error: { code: 'LOT_NOT_FOUND', message: expect.any(String) } });
    });

    it('returns 400 VALIDATION_ERROR for a malformed id', async () => {
      const res = await request(app).get('/api/lots/not-a-uuid');
      expect(res.status).toBe(400);
      expect(res.body.error.code).toBe('VALIDATION_ERROR');
    });
  });

  describe('rate limiting', () => {
    it('returns 429 RATE_LIMITED envelope once the per-IP limit is exceeded', async () => {
      const lotRepository = new PostgresLotRepository(pool);
      const uow = new PostgresReservationUnitOfWork(pool);
      const reservationRepository = new PostgresReservationRepository(pool);
      const adminUserRepository = new PostgresAdminUserRepository(pool);
      const gateway = new MockPaymentGateway(() => 0);
      const clock = new FakeClock(new Date('2026-01-01T00:00:00.000Z'));
      const lotService = new LotService(lotRepository);
      const createReservationService = new CreateReservationService(uow, gateway, clock);

      const limitedApp = createApp({
        lotService,
        createReservationService,
        reservationRepository,
        adminUserRepository,
        jwtSecret: 'test-secret',
        corsOrigins: ['http://localhost:5173'],
        reservationRateLimit: { windowMs: 60_000, max: 1 },
      });

      const lot = await lotRepository.create(lotInput);

      const first = await request(limitedApp).post('/api/reservations').send(buildReservationRequest(lot.id));
      expect(first.status).toBe(201);

      const second = await request(limitedApp)
        .post('/api/reservations')
        .send(buildReservationRequest(lot.id, { vehicle: { make: 'Toyota', model: 'Corolla', licensePlate: 'XYZ999' } }));

      expect(second.status).toBe(429);
      expect(second.body).toEqual({ error: { code: 'RATE_LIMITED', message: expect.any(String) } });
    });
  });
});
