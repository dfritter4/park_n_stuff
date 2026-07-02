import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';
import type { Pool } from 'pg';
import request from 'supertest';
import type { Express } from 'express';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
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

const lotInput = {
  name: 'Downtown Loop Garage',
  address: '100 Loop Ave',
  neighborhood: 'Loop District',
  lat: 47.6062,
  lng: -122.3321,
  capacity: 10,
  hourlyRateCents: 500,
};

describe('admin auth + protected lot mutations (integration)', () => {
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

  async function seedAdmin(): Promise<{ id: string; email: string }> {
    const passwordHash = await bcrypt.hash(ADMIN_PASSWORD, 10);
    return adminUserRepository.create(ADMIN_EMAIL, passwordHash);
  }

  async function loginAndGetToken(): Promise<string> {
    await seedAdmin();
    const res = await request(app).post('/api/admin/auth/login').send({ email: ADMIN_EMAIL, password: ADMIN_PASSWORD });
    return res.body.token as string;
  }

  describe('POST /api/admin/auth/login', () => {
    it('returns a token and expiresInSeconds for a seeded admin with the correct password', async () => {
      await seedAdmin();

      const res = await request(app).post('/api/admin/auth/login').send({ email: ADMIN_EMAIL, password: ADMIN_PASSWORD });

      expect(res.status).toBe(200);
      expect(res.body.expiresInSeconds).toBe(1800);
      expect(typeof res.body.token).toBe('string');
      expect(jwt.verify(res.body.token, JWT_SECRET)).toBeTruthy();
    });

    it('returns 401 INVALID_CREDENTIALS for the wrong password', async () => {
      await seedAdmin();

      const res = await request(app).post('/api/admin/auth/login').send({ email: ADMIN_EMAIL, password: 'nope' });

      expect(res.status).toBe(401);
      expect(res.body).toEqual({ error: { code: 'INVALID_CREDENTIALS', message: expect.any(String) } });
    });

    it('returns 401 INVALID_CREDENTIALS for an unregistered email', async () => {
      const res = await request(app)
        .post('/api/admin/auth/login')
        .send({ email: 'nobody@example.com', password: ADMIN_PASSWORD });

      expect(res.status).toBe(401);
      expect(res.body).toEqual({ error: { code: 'INVALID_CREDENTIALS', message: expect.any(String) } });
    });

    it('returns 400 VALIDATION_ERROR for a malformed body', async () => {
      const res = await request(app).post('/api/admin/auth/login').send({ email: 'not-an-email', password: '' });

      expect(res.status).toBe(400);
      expect(res.body.error.code).toBe('VALIDATION_ERROR');
    });
  });

  describe('POST /api/lots', () => {
    it('returns 401 UNAUTHORIZED without a token', async () => {
      const res = await request(app).post('/api/lots').send(lotInput);

      expect(res.status).toBe(401);
      expect(res.body).toEqual({ error: { code: 'UNAUTHORIZED', message: expect.any(String) } });
    });

    it('creates the lot and it becomes visible in GET /api/lots when authorized', async () => {
      const token = await loginAndGetToken();

      const res = await request(app).post('/api/lots').set('Authorization', `Bearer ${token}`).send(lotInput);

      expect(res.status).toBe(201);
      expect(res.body).toMatchObject({ name: lotInput.name, status: 'active' });

      const list = await request(app).get('/api/lots');
      expect(list.body.map((lot: { id: string }) => lot.id)).toContain(res.body.id);
    });

    it('returns 401 UNAUTHORIZED for an expired token', async () => {
      await seedAdmin();
      const expiredToken = jwt.sign({ sub: 'admin-id', email: ADMIN_EMAIL }, JWT_SECRET, { expiresIn: -1 });

      const res = await request(app).post('/api/lots').set('Authorization', `Bearer ${expiredToken}`).send(lotInput);

      expect(res.status).toBe(401);
      expect(res.body).toEqual({ error: { code: 'UNAUTHORIZED', message: expect.any(String) } });
    });

    it('returns 401 UNAUTHORIZED for a garbage token', async () => {
      const res = await request(app)
        .post('/api/lots')
        .set('Authorization', 'Bearer not-a-real-token')
        .send(lotInput);

      expect(res.status).toBe(401);
      expect(res.body).toEqual({ error: { code: 'UNAUTHORIZED', message: expect.any(String) } });
    });
  });

  describe('PUT /api/lots/:id', () => {
    it('returns 401 UNAUTHORIZED without a token', async () => {
      const lot = await lotRepository.create(lotInput);

      const res = await request(app).put(`/api/lots/${lot.id}`).send({ hourlyRateCents: 700 });

      expect(res.status).toBe(401);
    });

    it('updates the hourly rate when authorized', async () => {
      const lot = await lotRepository.create(lotInput);
      const token = await loginAndGetToken();

      const res = await request(app)
        .put(`/api/lots/${lot.id}`)
        .set('Authorization', `Bearer ${token}`)
        .send({ hourlyRateCents: 700 });

      expect(res.status).toBe(200);
      expect(res.body.hourlyRateCents).toBe(700);
    });
  });

  describe('DELETE /api/lots/:id', () => {
    it('returns 401 UNAUTHORIZED without a token', async () => {
      const lot = await lotRepository.create(lotInput);

      const res = await request(app).delete(`/api/lots/${lot.id}`);

      expect(res.status).toBe(401);
    });

    it('soft-deletes the lot: gone from GET /api/lots and GET /api/lots/:id 404s', async () => {
      const lot = await lotRepository.create(lotInput);
      const token = await loginAndGetToken();

      const del = await request(app).delete(`/api/lots/${lot.id}`).set('Authorization', `Bearer ${token}`);
      expect(del.status).toBe(204);

      const list = await request(app).get('/api/lots');
      expect(list.body.map((l: { id: string }) => l.id)).not.toContain(lot.id);

      const getById = await request(app).get(`/api/lots/${lot.id}`);
      expect(getById.status).toBe(404);
      expect(getById.body).toEqual({ error: { code: 'LOT_NOT_FOUND', message: expect.any(String) } });
    });
  });
});
