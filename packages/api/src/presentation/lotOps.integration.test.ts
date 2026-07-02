import type { Pool } from 'pg';
import request from 'supertest';
import type { Express } from 'express';
import jwt from 'jsonwebtoken';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { createPool } from '../infrastructure/db.js';
import { PostgresCapacityOverrideRepository } from '../infrastructure/postgres/capacityOverrideRepository.js';
import { PostgresLotRepository } from '../infrastructure/postgres/lotRepository.js';
import { PostgresPricingRuleRepository } from '../infrastructure/postgres/pricingRuleRepository.js';
import { PostgresReservationUnitOfWork } from '../infrastructure/postgres/reservationUnitOfWork.js';
import { PostgresReservationRepository } from '../infrastructure/postgres/reservationRepository.js';
import { PostgresAdminUserRepository } from '../infrastructure/postgres/adminUserRepository.js';
import { PostgresAnalyticsRepository } from '../infrastructure/postgres/analyticsRepository.js';
import { PostgresDeclinedAttemptRepository } from '../infrastructure/postgres/declinedAttemptRepository.js';
import { MockPaymentGateway } from '../infrastructure/mockPaymentGateway.js';
import { LotService } from '../application/lotService.js';
import { CreateReservationService } from '../application/createReservation.js';
import { AnalyticsService } from '../application/analyticsService.js';
import { FakeClock } from '../application/testing/fakes.js';
import { createApp } from './app.js';

const DATABASE_URL = process.env.DATABASE_URL ?? 'postgres://parking:parking@localhost:5433/parking_test_p6';
const JWT_SECRET = 'test-secret';

const lotInput = {
  name: 'Loop Premier Garage',
  address: '100 Loop Ave',
  neighborhood: 'Loop District',
  lat: 47.6062,
  lng: -122.3321,
  capacity: 10,
  hourlyRateCents: 500,
};

describe('lotOps routes (integration)', () => {
  let pool: Pool;
  let app: Express;
  let lotRepository: PostgresLotRepository;
  let pricingRuleRepository: PostgresPricingRuleRepository;
  let capacityOverrideRepository: PostgresCapacityOverrideRepository;
  let adminToken: string;

  beforeAll(() => {
    pool = createPool(DATABASE_URL);
    lotRepository = new PostgresLotRepository(pool);
    pricingRuleRepository = new PostgresPricingRuleRepository(pool);
    capacityOverrideRepository = new PostgresCapacityOverrideRepository(pool);

    const uow = new PostgresReservationUnitOfWork(pool);
    const reservationRepository = new PostgresReservationRepository(pool);
    const adminUserRepository = new PostgresAdminUserRepository(pool);
    const analyticsRepository = new PostgresAnalyticsRepository(pool);
    const declinedAttemptRepository = new PostgresDeclinedAttemptRepository(pool);
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
      lotRepository,
      pricingRuleRepository,
      capacityOverrideRepository,
      clock,
    });

    adminToken = jwt.sign({ sub: 'admin-user' }, JWT_SECRET, { expiresIn: '1h' });
  });

  beforeEach(async () => {
    await pool.query(
      'TRUNCATE TABLE payments, reservations, customers, pricing_rules, capacity_overrides, declined_attempts, admin_users, lots RESTART IDENTITY CASCADE',
    );
  });

  afterAll(async () => {
    await pool.end();
  });

  const authed = () => ({ Authorization: `Bearer ${adminToken}` });

  describe('pricing rules', () => {
    it('creates and lists pricing rules for a lot (GET is public)', async () => {
      const lot = await lotRepository.create(lotInput);

      const createRes = await request(app)
        .post(`/api/lots/${lot.id}/pricing-rules`)
        .set(authed())
        .send({ dayType: 'weekday', startHour: 7, endHour: 19, hourlyRateCents: 1500 });
      expect(createRes.status).toBe(201);
      expect(createRes.body).toMatchObject({
        lotId: lot.id,
        dayType: 'weekday',
        startHour: 7,
        endHour: 19,
        hourlyRateCents: 1500,
      });

      const listRes = await request(app).get(`/api/lots/${lot.id}/pricing-rules`);
      expect(listRes.status).toBe(200);
      expect(listRes.body).toHaveLength(1);
      expect(listRes.body[0].id).toBe(createRes.body.id);
    });

    it('401s creating a pricing rule without an admin token', async () => {
      const lot = await lotRepository.create(lotInput);
      const res = await request(app)
        .post(`/api/lots/${lot.id}/pricing-rules`)
        .send({ dayType: 'all', startHour: 0, endHour: 24, hourlyRateCents: 1000 });
      expect(res.status).toBe(401);
    });

    it('404s creating a pricing rule for an unknown lot', async () => {
      const res = await request(app)
        .post('/api/lots/00000000-0000-0000-0000-000000000000/pricing-rules')
        .set(authed())
        .send({ dayType: 'all', startHour: 0, endHour: 24, hourlyRateCents: 1000 });
      expect(res.status).toBe(404);
      expect(res.body.error.code).toBe('LOT_NOT_FOUND');
    });

    it('404s creating a pricing rule for a soft-deleted lot', async () => {
      const lot = await lotRepository.create(lotInput);
      await lotRepository.softDelete(lot.id);

      const res = await request(app)
        .post(`/api/lots/${lot.id}/pricing-rules`)
        .set(authed())
        .send({ dayType: 'all', startHour: 0, endHour: 24, hourlyRateCents: 1000 });
      expect(res.status).toBe(404);
      expect(res.body.error.code).toBe('LOT_NOT_FOUND');
    });

    it('returns 409 PRICING_RULE_OVERLAP for two rules with the same dayType and intersecting hours', async () => {
      const lot = await lotRepository.create(lotInput);
      await pricingRuleRepository.create(lot.id, {
        dayType: 'weekday',
        startHour: 8,
        endHour: 12,
        hourlyRateCents: 1000,
      });

      const res = await request(app)
        .post(`/api/lots/${lot.id}/pricing-rules`)
        .set(authed())
        .send({ dayType: 'weekday', startHour: 10, endHour: 14, hourlyRateCents: 1200 });

      expect(res.status).toBe(409);
      expect(res.body.error.code).toBe('PRICING_RULE_OVERLAP');
    });

    it("returns 409 PRICING_RULE_OVERLAP when a new 'all' rule intersects an existing day-specific rule", async () => {
      const lot = await lotRepository.create(lotInput);
      await pricingRuleRepository.create(lot.id, {
        dayType: 'weekend',
        startHour: 17,
        endHour: 24,
        hourlyRateCents: 1200,
      });

      const res = await request(app)
        .post(`/api/lots/${lot.id}/pricing-rules`)
        .set(authed())
        .send({ dayType: 'all', startHour: 20, endHour: 22, hourlyRateCents: 1000 });

      expect(res.status).toBe(409);
      expect(res.body.error.code).toBe('PRICING_RULE_OVERLAP');
    });

    it("returns 409 PRICING_RULE_OVERLAP when a new day-specific rule intersects an existing 'all' rule", async () => {
      const lot = await lotRepository.create(lotInput);
      await pricingRuleRepository.create(lot.id, {
        dayType: 'all',
        startHour: 6,
        endHour: 10,
        hourlyRateCents: 1000,
      });

      const res = await request(app)
        .post(`/api/lots/${lot.id}/pricing-rules`)
        .set(authed())
        .send({ dayType: 'weekday', startHour: 8, endHour: 12, hourlyRateCents: 1500 });

      expect(res.status).toBe(409);
      expect(res.body.error.code).toBe('PRICING_RULE_OVERLAP');
    });

    it('allows a weekday and a weekend rule covering identical hours (no overlap)', async () => {
      const lot = await lotRepository.create(lotInput);
      await pricingRuleRepository.create(lot.id, {
        dayType: 'weekday',
        startHour: 8,
        endHour: 12,
        hourlyRateCents: 1000,
      });

      const res = await request(app)
        .post(`/api/lots/${lot.id}/pricing-rules`)
        .set(authed())
        .send({ dayType: 'weekend', startHour: 8, endHour: 12, hourlyRateCents: 1200 });

      expect(res.status).toBe(201);
    });

    it('deletes a pricing rule (204) and 404s deleting it again', async () => {
      const lot = await lotRepository.create(lotInput);
      const rule = await pricingRuleRepository.create(lot.id, {
        dayType: 'all',
        startHour: 0,
        endHour: 24,
        hourlyRateCents: 1000,
      });

      const delRes = await request(app).delete(`/api/pricing-rules/${rule.id}`).set(authed());
      expect(delRes.status).toBe(204);

      const secondDelete = await request(app).delete(`/api/pricing-rules/${rule.id}`).set(authed());
      expect(secondDelete.status).toBe(404);
    });

    it('404s deleting an unknown pricing-rule id', async () => {
      const res = await request(app)
        .delete('/api/pricing-rules/00000000-0000-0000-0000-000000000000')
        .set(authed());
      expect(res.status).toBe(404);
    });

    it('cascade-deletes pricing rules when the owning lot row is hard-deleted', async () => {
      const lot = await lotRepository.create(lotInput);
      await pricingRuleRepository.create(lot.id, {
        dayType: 'all',
        startHour: 0,
        endHour: 24,
        hourlyRateCents: 1000,
      });

      await pool.query('DELETE FROM lots WHERE id = $1', [lot.id]);

      const remaining = await pool.query('SELECT * FROM pricing_rules WHERE lot_id = $1', [lot.id]);
      expect(remaining.rowCount).toBe(0);
    });
  });

  describe('capacity overrides', () => {
    it('creates and lists capacity overrides for a lot (admin-only)', async () => {
      const lot = await lotRepository.create(lotInput);

      const createRes = await request(app)
        .post(`/api/lots/${lot.id}/capacity-overrides`)
        .set(authed())
        .send({ spacesClosed: 3, reason: 'Resurfacing', startsAt: '2026-07-02T00:00:00.000Z' });
      expect(createRes.status).toBe(201);
      expect(createRes.body).toMatchObject({ lotId: lot.id, spacesClosed: 3, reason: 'Resurfacing', endsAt: null });

      const listRes = await request(app).get(`/api/lots/${lot.id}/capacity-overrides`).set(authed());
      expect(listRes.status).toBe(200);
      expect(listRes.body).toHaveLength(1);
    });

    it('401s listing capacity overrides without an admin token', async () => {
      const lot = await lotRepository.create(lotInput);
      const res = await request(app).get(`/api/lots/${lot.id}/capacity-overrides`);
      expect(res.status).toBe(401);
    });

    it('returns 400 VALIDATION_ERROR when spacesClosed exceeds the lot capacity', async () => {
      const lot = await lotRepository.create({ ...lotInput, capacity: 5 });

      const res = await request(app)
        .post(`/api/lots/${lot.id}/capacity-overrides`)
        .set(authed())
        .send({ spacesClosed: 6, reason: 'Resurfacing', startsAt: '2026-07-02T00:00:00.000Z' });

      expect(res.status).toBe(400);
      expect(res.body.error.code).toBe('VALIDATION_ERROR');
    });

    it('allows spacesClosed exactly equal to the lot capacity', async () => {
      const lot = await lotRepository.create({ ...lotInput, capacity: 5 });

      const res = await request(app)
        .post(`/api/lots/${lot.id}/capacity-overrides`)
        .set(authed())
        .send({ spacesClosed: 5, reason: 'Full closure', startsAt: '2026-07-02T00:00:00.000Z' });

      expect(res.status).toBe(201);
    });

    it('404s creating a capacity override for an unknown lot', async () => {
      const res = await request(app)
        .post('/api/lots/00000000-0000-0000-0000-000000000000/capacity-overrides')
        .set(authed())
        .send({ spacesClosed: 1, reason: 'test', startsAt: '2026-07-02T00:00:00.000Z' });
      expect(res.status).toBe(404);
      expect(res.body.error.code).toBe('LOT_NOT_FOUND');
    });

    it('deletes a capacity override (204) and 404s deleting it again', async () => {
      const lot = await lotRepository.create(lotInput);
      const override = await capacityOverrideRepository.create(lot.id, {
        spacesClosed: 2,
        reason: 'test',
        startsAt: new Date('2026-07-02T00:00:00Z'),
        endsAt: null,
      });

      const delRes = await request(app).delete(`/api/capacity-overrides/${override.id}`).set(authed());
      expect(delRes.status).toBe(204);

      const secondDelete = await request(app).delete(`/api/capacity-overrides/${override.id}`).set(authed());
      expect(secondDelete.status).toBe(404);
    });

    it('404s deleting an unknown capacity-override id', async () => {
      const res = await request(app)
        .delete('/api/capacity-overrides/00000000-0000-0000-0000-000000000000')
        .set(authed());
      expect(res.status).toBe(404);
    });

    it('cascade-deletes capacity overrides when the owning lot row is hard-deleted', async () => {
      const lot = await lotRepository.create(lotInput);
      await capacityOverrideRepository.create(lot.id, {
        spacesClosed: 2,
        reason: 'test',
        startsAt: new Date('2026-07-02T00:00:00Z'),
        endsAt: null,
      });

      await pool.query('DELETE FROM lots WHERE id = $1', [lot.id]);

      const remaining = await pool.query('SELECT * FROM capacity_overrides WHERE lot_id = $1', [lot.id]);
      expect(remaining.rowCount).toBe(0);
    });
  });
});
