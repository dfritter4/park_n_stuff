import request from 'supertest';
import type { Express } from 'express';
import jwt from 'jsonwebtoken';
import { beforeAll, describe, expect, it } from 'vitest';
import type { AnalyticsRepository } from '../application/analyticsPorts.js';
import { AnalyticsService } from '../application/analyticsService.js';
import { CreateReservationService } from '../application/createReservation.js';
import { LotService } from '../application/lotService.js';
import {
  FakeAdminUserRepository,
  FakeCapacityOverrideRepository,
  FakeClock,
  FakeDeclinedAttemptRepository,
  FakeLotRepository,
  FakePaymentGateway,
  FakePricingRuleRepository,
  FakeReservationRepository,
  FakeReservationUnitOfWork,
  InMemoryDatabase,
} from '../application/testing/fakes.js';
import { createApp } from './app.js';

const JWT_SECRET = 'test-secret';

/**
 * These P2-phase admin routers (adminReservations, adminCustomers, lotOps)
 * are 501 stubs until their owning tasks land — this test only pins the
 * wiring (mount paths, admin gating, and the NOT_IMPLEMENTED envelope), not
 * any business behavior.
 */
function unimplementedAnalyticsRepository(): AnalyticsRepository {
  const fail = async (): Promise<never> => {
    throw new Error('AnalyticsRepository should not be called by route-stub tests');
  };
  return {
    getDashboardData: fail,
    getDailyRevenue: fail,
    getHourlyOccupancy: fail,
    getDayBreakdown: fail,
    getExportRows: fail,
  };
}

describe('phase-2 stub routers (wiring)', () => {
  let app: Express;
  let adminToken: string;

  beforeAll(() => {
    const db = new InMemoryDatabase();
    const lotRepository = new FakeLotRepository(db);
    const capacityOverrideRepository = new FakeCapacityOverrideRepository(db);
    const pricingRuleRepository = new FakePricingRuleRepository(db);
    const declinedAttemptRepository = new FakeDeclinedAttemptRepository(db);
    const uow = new FakeReservationUnitOfWork(db);
    const reservationRepository = new FakeReservationRepository(db);
    const adminUserRepository = new FakeAdminUserRepository();
    const gateway = new FakePaymentGateway(true);
    const clock = new FakeClock();

    const lotService = new LotService(lotRepository, capacityOverrideRepository, pricingRuleRepository, clock);
    const createReservationService = new CreateReservationService(
      uow,
      gateway,
      clock,
      pricingRuleRepository,
      declinedAttemptRepository,
    );
    const analyticsService = new AnalyticsService(unimplementedAnalyticsRepository());

    app = createApp({
      lotService,
      createReservationService,
      reservationRepository,
      adminUserRepository,
      analyticsService,
      jwtSecret: JWT_SECRET,
      clock,
    });

    adminToken = jwt.sign({ sub: 'admin-user' }, JWT_SECRET, { expiresIn: '1h' });
  });

  const authed = () => ({ Authorization: `Bearer ${adminToken}` });

  describe('adminReservations router', () => {
    it('501s GET /api/admin/reservations for an authenticated admin', async () => {
      const res = await request(app).get('/api/admin/reservations').set(authed());
      expect(res.status).toBe(501);
      expect(res.body.error.code).toBe('NOT_IMPLEMENTED');
    });

    it('401s GET /api/admin/reservations without a token', async () => {
      const res = await request(app).get('/api/admin/reservations');
      expect(res.status).toBe(401);
    });

    it('501s GET /api/admin/reservations/:id', async () => {
      const res = await request(app)
        .get('/api/admin/reservations/a2f4c1a0-1b2c-4d3e-8f4a-5b6c7d8e9f0a')
        .set(authed());
      expect(res.status).toBe(501);
      expect(res.body.error.code).toBe('NOT_IMPLEMENTED');
    });

    it('501s POST /api/admin/reservations/:id/cancel', async () => {
      const res = await request(app)
        .post('/api/admin/reservations/a2f4c1a0-1b2c-4d3e-8f4a-5b6c7d8e9f0a/cancel')
        .set(authed());
      expect(res.status).toBe(501);
    });

    it('501s POST /api/admin/reservations/:id/extend', async () => {
      const res = await request(app)
        .post('/api/admin/reservations/a2f4c1a0-1b2c-4d3e-8f4a-5b6c7d8e9f0a/extend')
        .set(authed());
      expect(res.status).toBe(501);
    });

    it('501s GET /api/admin/lots/:id/current', async () => {
      const res = await request(app)
        .get('/api/admin/lots/a2f4c1a0-1b2c-4d3e-8f4a-5b6c7d8e9f0a/current')
        .set(authed());
      expect(res.status).toBe(501);
      expect(res.body.error.code).toBe('NOT_IMPLEMENTED');
    });
  });

  describe('adminCustomers router', () => {
    it('501s GET /api/admin/customers for an authenticated admin', async () => {
      const res = await request(app).get('/api/admin/customers').set(authed());
      expect(res.status).toBe(501);
      expect(res.body.error.code).toBe('NOT_IMPLEMENTED');
    });

    it('401s GET /api/admin/customers without a token', async () => {
      const res = await request(app).get('/api/admin/customers');
      expect(res.status).toBe(401);
    });

    it('501s GET /api/admin/customers/:id', async () => {
      const res = await request(app)
        .get('/api/admin/customers/a2f4c1a0-1b2c-4d3e-8f4a-5b6c7d8e9f0a')
        .set(authed());
      expect(res.status).toBe(501);
    });

    it('501s POST /api/admin/customers/:id/flag', async () => {
      const res = await request(app)
        .post('/api/admin/customers/a2f4c1a0-1b2c-4d3e-8f4a-5b6c7d8e9f0a/flag')
        .set(authed())
        .send({ reason: 'test' });
      expect(res.status).toBe(501);
    });

    it('501s POST /api/admin/customers/:id/unflag', async () => {
      const res = await request(app)
        .post('/api/admin/customers/a2f4c1a0-1b2c-4d3e-8f4a-5b6c7d8e9f0a/unflag')
        .set(authed());
      expect(res.status).toBe(501);
    });
  });

  describe('lotOps router', () => {
    it('501s public GET /api/lots/:id/pricing-rules without a token', async () => {
      const res = await request(app).get('/api/lots/a2f4c1a0-1b2c-4d3e-8f4a-5b6c7d8e9f0a/pricing-rules');
      expect(res.status).toBe(501);
      expect(res.body.error.code).toBe('NOT_IMPLEMENTED');
    });

    it('401s POST /api/lots/:id/pricing-rules without a token (admin-only)', async () => {
      const res = await request(app)
        .post('/api/lots/a2f4c1a0-1b2c-4d3e-8f4a-5b6c7d8e9f0a/pricing-rules')
        .send({ dayType: 'all', startHour: 0, endHour: 24, hourlyRateCents: 1000 });
      expect(res.status).toBe(401);
    });

    it('501s POST /api/lots/:id/pricing-rules for an authenticated admin', async () => {
      const res = await request(app)
        .post('/api/lots/a2f4c1a0-1b2c-4d3e-8f4a-5b6c7d8e9f0a/pricing-rules')
        .set(authed())
        .send({ dayType: 'all', startHour: 0, endHour: 24, hourlyRateCents: 1000 });
      expect(res.status).toBe(501);
    });

    it('501s DELETE /api/pricing-rules/:ruleId', async () => {
      const res = await request(app)
        .delete('/api/pricing-rules/a2f4c1a0-1b2c-4d3e-8f4a-5b6c7d8e9f0a')
        .set(authed());
      expect(res.status).toBe(501);
    });

    it('501s GET /api/lots/:id/capacity-overrides for an authenticated admin', async () => {
      const res = await request(app)
        .get('/api/lots/a2f4c1a0-1b2c-4d3e-8f4a-5b6c7d8e9f0a/capacity-overrides')
        .set(authed());
      expect(res.status).toBe(501);
    });

    it('401s GET /api/lots/:id/capacity-overrides without a token (admin-only)', async () => {
      const res = await request(app).get('/api/lots/a2f4c1a0-1b2c-4d3e-8f4a-5b6c7d8e9f0a/capacity-overrides');
      expect(res.status).toBe(401);
    });

    it('501s POST /api/lots/:id/capacity-overrides for an authenticated admin', async () => {
      const res = await request(app)
        .post('/api/lots/a2f4c1a0-1b2c-4d3e-8f4a-5b6c7d8e9f0a/capacity-overrides')
        .set(authed())
        .send({ spacesClosed: 2, reason: 'test', startsAt: '2026-07-02T00:00:00.000Z' });
      expect(res.status).toBe(501);
    });

    it('501s DELETE /api/capacity-overrides/:id', async () => {
      const res = await request(app)
        .delete('/api/capacity-overrides/a2f4c1a0-1b2c-4d3e-8f4a-5b6c7d8e9f0a')
        .set(authed());
      expect(res.status).toBe(501);
    });
  });

  it('still routes /api/lots (the pre-existing lots CRUD router) unaffected by the lotOps mount', async () => {
    const res = await request(app).get('/api/lots');
    expect(res.status).toBe(200);
    expect(res.body).toEqual([]);
  });
});
