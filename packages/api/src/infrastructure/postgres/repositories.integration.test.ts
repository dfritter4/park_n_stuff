import { randomUUID } from 'node:crypto';
import type { Pool } from 'pg';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import type { CreateReservationRequest } from '@parking/shared';
import { createPool } from '../db.js';
import { PostgresLotRepository } from './lotRepository.js';
import { PostgresReservationUnitOfWork } from './reservationUnitOfWork.js';
import { PostgresReservationRepository } from './reservationRepository.js';
import { PostgresAdminUserRepository } from './adminUserRepository.js';
import { PostgresPricingRuleRepository } from './pricingRuleRepository.js';
import { PostgresCapacityOverrideRepository } from './capacityOverrideRepository.js';
import { PostgresDeclinedAttemptRepository } from './declinedAttemptRepository.js';
import { MockPaymentGateway } from '../mockPaymentGateway.js';
import { CreateReservationService } from '../../application/createReservation.js';
import { FakeClock } from '../../application/testing/fakes.js';

const DATABASE_URL =
  process.env.DATABASE_URL ?? 'postgres://parking:parking@localhost:5433/parking_test';

const lotInput = {
  name: 'Test Lot',
  address: '123 Main St',
  neighborhood: 'Downtown',
  lat: 47.6,
  lng: -122.3,
  capacity: 10,
  hourlyRateCents: 500,
};

describe('Postgres repositories', () => {
  let pool: Pool;
  let lotRepository: PostgresLotRepository;
  let uow: PostgresReservationUnitOfWork;
  let reservationRepository: PostgresReservationRepository;
  let adminUserRepository: PostgresAdminUserRepository;
  let pricingRuleRepository: PostgresPricingRuleRepository;
  let capacityOverrideRepository: PostgresCapacityOverrideRepository;
  let declinedAttemptRepository: PostgresDeclinedAttemptRepository;

  beforeAll(() => {
    pool = createPool(DATABASE_URL);
    lotRepository = new PostgresLotRepository(pool);
    uow = new PostgresReservationUnitOfWork(pool);
    reservationRepository = new PostgresReservationRepository(pool);
    adminUserRepository = new PostgresAdminUserRepository(pool);
    pricingRuleRepository = new PostgresPricingRuleRepository(pool);
    capacityOverrideRepository = new PostgresCapacityOverrideRepository(pool);
    declinedAttemptRepository = new PostgresDeclinedAttemptRepository(pool);
  });

  beforeEach(async () => {
    await pool.query(
      'TRUNCATE TABLE payments, reservations, customers, admin_users, lots RESTART IDENTITY CASCADE',
    );
  });

  afterAll(async () => {
    await pool.end();
  });

  describe('PostgresLotRepository', () => {
    it('round-trips create/findById/update, and excludes soft-deleted lots from findAllActive', async () => {
      const created = await lotRepository.create(lotInput);
      expect(created.id).toBeDefined();
      expect(created.status).toBe('active');
      expect(created.name).toBe('Test Lot');
      expect(created.capacity).toBe(10);

      const found = await lotRepository.findById(created.id);
      expect(found).toMatchObject({ id: created.id, name: 'Test Lot', activeReservations: 0 });

      const updated = await lotRepository.update(created.id, { name: 'Renamed Lot', capacity: 20 });
      expect(updated).toMatchObject({ id: created.id, name: 'Renamed Lot', capacity: 20 });

      const activeBeforeDelete = await lotRepository.findAllActive();
      expect(activeBeforeDelete.map((lot) => lot.id)).toContain(created.id);

      const deleted = await lotRepository.softDelete(created.id);
      expect(deleted).toBe(true);

      const activeAfterDelete = await lotRepository.findAllActive();
      expect(activeAfterDelete.map((lot) => lot.id)).not.toContain(created.id);

      // findById may still return deleted lots; the service layer is responsible for filtering.
      const foundAfterDelete = await lotRepository.findById(created.id);
      expect(foundAfterDelete?.status).toBe('deleted');
    });

    it('includes maintenance lots in findAllActive (only deleted status is excluded)', async () => {
      const created = await lotRepository.create(lotInput);
      await lotRepository.update(created.id, { status: 'maintenance' });

      const active = await lotRepository.findAllActive();
      expect(active.map((lot) => lot.id)).toContain(created.id);
      expect(active.find((lot) => lot.id === created.id)?.status).toBe('maintenance');
    });

    it('returns null/false for unknown ids', async () => {
      const unknownId = randomUUID();
      expect(await lotRepository.findById(unknownId)).toBeNull();
      expect(await lotRepository.update(unknownId, { name: 'x' })).toBeNull();
      expect(await lotRepository.softDelete(unknownId)).toBe(false);
    });
  });

  describe('ReservationTxn.countActiveOverlapping', () => {
    it('counts reservations overlapping [start, end) and excludes touching boundaries', async () => {
      const lot = await lotRepository.create(lotInput);
      const customer = await pool.query<{ id: string }>(
        `INSERT INTO customers (name, email, phone) VALUES ('Alice', 'alice@example.com', '555-0100') RETURNING id`,
      );
      const customerId = customer.rows[0].id;
      await pool.query(
        `INSERT INTO reservations
           (reservation_number, lot_id, customer_id, vehicle_make, vehicle_model, license_plate, start_time, end_time, total_cost_cents, status)
         VALUES ('R-1', $1, $2, 'Honda', 'Civic', 'ABC123', '2026-01-01T10:00:00Z', '2026-01-01T12:00:00Z', 1000, 'active')`,
        [lot.id, customerId],
      );

      const overlapCount = await uow.execute(lot.id, (txn) =>
        txn.countActiveOverlapping(lot.id, new Date('2026-01-01T11:00:00Z'), new Date('2026-01-01T13:00:00Z')),
      );
      expect(overlapCount).toBe(1);

      const touchingCount = await uow.execute(lot.id, (txn) =>
        txn.countActiveOverlapping(lot.id, new Date('2026-01-01T12:00:00Z'), new Date('2026-01-01T14:00:00Z')),
      );
      expect(touchingCount).toBe(0);
    });
  });

  describe('ReservationTxn.upsertCustomer', () => {
    it('upserts by email: reuses the id and updates name/phone on conflict', async () => {
      const lot = await lotRepository.create(lotInput);

      const first = await uow.execute(lot.id, (txn) =>
        txn.upsertCustomer({ name: 'Alice', email: 'alice@example.com', phone: '555-0100' }),
      );
      const second = await uow.execute(lot.id, (txn) =>
        txn.upsertCustomer({ name: 'Alice Updated', email: 'alice@example.com', phone: '555-0199' }),
      );

      expect(second.id).toBe(first.id);

      const row = await pool.query<{ name: string; phone: string }>(
        'SELECT name, phone FROM customers WHERE id = $1',
        [first.id],
      );
      expect(row.rows[0]).toEqual({ name: 'Alice Updated', phone: '555-0199' });

      const count = await pool.query<{ count: string }>('SELECT COUNT(*) FROM customers');
      expect(Number(count.rows[0].count)).toBe(1);
    });
  });

  describe('oversell race', () => {
    it('allows only one of two concurrent reservation attempts to succeed for a capacity-1 lot', async () => {
      const lot = await lotRepository.create({ ...lotInput, capacity: 1 });
      const gateway = new MockPaymentGateway(() => 0);
      const clock = new FakeClock();
      const service = new CreateReservationService(uow, gateway, clock, pricingRuleRepository, declinedAttemptRepository);

      const buildRequest = (licensePlate: string, email: string): CreateReservationRequest => ({
        lotId: lot.id,
        customer: { name: 'Racer', email, phone: '555-0100' },
        vehicle: { make: 'Honda', model: 'Civic', licensePlate },
        startTime: '2026-01-01T10:00:00.000Z',
        endTime: '2026-01-01T12:00:00.000Z',
        payment: {
          cardNumber: '4111111111111234',
          expiry: '01/30',
          cvc: '123',
          cardholderName: 'Racer One',
        },
      });

      const results = await Promise.allSettled([
        service.execute(buildRequest('AAA111', 'racer-a@example.com')),
        service.execute(buildRequest('BBB222', 'racer-b@example.com')),
      ]);

      const fulfilled = results.filter((r) => r.status === 'fulfilled');
      const rejected = results.filter((r) => r.status === 'rejected');
      expect(fulfilled).toHaveLength(1);
      expect(rejected).toHaveLength(1);

      const reservationCount = await pool.query<{ count: string }>(
        `SELECT COUNT(*) FROM reservations WHERE lot_id = $1 AND status = 'active'`,
        [lot.id],
      );
      expect(Number(reservationCount.rows[0].count)).toBe(1);
    });
  });

  describe('PostgresReservationRepository.findByIdWithDetails', () => {
    it('returns joined reservation, lot, customer, and payment details', async () => {
      const lot = await lotRepository.create(lotInput);
      const gateway = new MockPaymentGateway(() => 0);
      const clock = new FakeClock();
      const service = new CreateReservationService(uow, gateway, clock, pricingRuleRepository, declinedAttemptRepository);

      const { reservationId } = await service.execute({
        lotId: lot.id,
        customer: { name: 'Bob', email: 'bob@example.com', phone: '555-0111' },
        vehicle: { make: 'Toyota', model: 'Corolla', licensePlate: 'XYZ999' },
        startTime: '2026-01-01T10:00:00.000Z',
        endTime: '2026-01-01T12:00:00.000Z',
        payment: { cardNumber: '4111111111110001', expiry: '01/30', cvc: '123', cardholderName: 'Bob' },
      });

      const details = await reservationRepository.findByIdWithDetails(reservationId);
      expect(details).toMatchObject({
        id: reservationId,
        lotName: lot.name,
        lotAddress: lot.address,
        customerName: 'Bob',
        cardLast4: '0001',
        status: 'active',
      });
    });

    it('returns null for an unknown reservation id', async () => {
      expect(await reservationRepository.findByIdWithDetails(randomUUID())).toBeNull();
    });
  });

  describe('PostgresAdminUserRepository', () => {
    it('creates an admin user and finds it by email', async () => {
      await adminUserRepository.create('admin@example.com', 'hashed-password');

      const found = await adminUserRepository.findByEmail('admin@example.com');
      expect(found).toMatchObject({ email: 'admin@example.com', passwordHash: 'hashed-password' });
      expect(found?.id).toBeDefined();
    });

    it('returns null for an unknown email', async () => {
      expect(await adminUserRepository.findByEmail('missing@example.com')).toBeNull();
    });
  });

  describe('PostgresPricingRuleRepository', () => {
    it('round-trips create/listByLot/delete', async () => {
      const lot = await lotRepository.create({ ...lotInput, name: 'Pricing Rule Repo Lot' });

      const created = await pricingRuleRepository.create(lot.id, {
        dayType: 'weekday',
        startHour: 7,
        endHour: 19,
        hourlyRateCents: 1500,
      });
      expect(created.id).toBeDefined();
      expect(created.lotId).toBe(lot.id);

      const rules = await pricingRuleRepository.listByLot(lot.id);
      expect(rules).toHaveLength(1);
      expect(rules[0]).toMatchObject({ dayType: 'weekday', startHour: 7, endHour: 19, hourlyRateCents: 1500 });

      expect(await pricingRuleRepository.delete(created.id)).toBe(true);
      expect(await pricingRuleRepository.listByLot(lot.id)).toHaveLength(0);
      expect(await pricingRuleRepository.delete(created.id)).toBe(false);
    });
  });

  describe('PostgresCapacityOverrideRepository', () => {
    it('round-trips create/listByLot/delete, and listActiveForWindow excludes touching boundaries', async () => {
      const lot = await lotRepository.create({ ...lotInput, name: 'Capacity Override Repo Lot' });

      const created = await capacityOverrideRepository.create(lot.id, {
        spacesClosed: 2,
        reason: 'Event',
        startsAt: new Date('2026-01-01T10:00:00Z'),
        endsAt: new Date('2026-01-01T12:00:00Z'),
      });
      expect(created.id).toBeDefined();

      expect(await capacityOverrideRepository.listByLot(lot.id)).toHaveLength(1);

      const overlapping = await capacityOverrideRepository.listActiveForWindow(
        lot.id,
        new Date('2026-01-01T11:00:00Z'),
        new Date('2026-01-01T13:00:00Z'),
      );
      expect(overlapping).toHaveLength(1);

      const touching = await capacityOverrideRepository.listActiveForWindow(
        lot.id,
        new Date('2026-01-01T12:00:00Z'),
        new Date('2026-01-01T14:00:00Z'),
      );
      expect(touching).toHaveLength(0);

      expect(await capacityOverrideRepository.delete(created.id)).toBe(true);
      expect(await capacityOverrideRepository.listByLot(lot.id)).toHaveLength(0);
    });
  });

  describe('PostgresDeclinedAttemptRepository', () => {
    it('inserts attempts and listSince returns them newest-first with the joined lot name', async () => {
      const lot = await lotRepository.create({ ...lotInput, name: 'Declined Attempt Repo Lot' });

      await declinedAttemptRepository.insert({ lotId: lot.id, amountCents: 1000, cardLast4: '0002' });
      await declinedAttemptRepository.insert({ lotId: lot.id, amountCents: 2000, cardLast4: '0002' });

      const attempts = await declinedAttemptRepository.listSince(new Date('2020-01-01T00:00:00Z'));
      expect(attempts).toHaveLength(2);
      expect(attempts[0]?.lotName).toBe(lot.name);
      expect(attempts.map((a) => a.amountCents).sort()).toEqual([1000, 2000]);

      expect(await declinedAttemptRepository.listSince(new Date('2099-01-01T00:00:00Z'))).toHaveLength(0);
    });
  });

  describe('ReservationTxn P2 extensions', () => {
    it('listActiveCapacityOverrides reads overrides overlapping [start, end) inside the transaction', async () => {
      const lot = await lotRepository.create({ ...lotInput, name: 'Txn Overrides Lot' });
      await capacityOverrideRepository.create(lot.id, {
        spacesClosed: 3,
        reason: null,
        startsAt: new Date('2026-01-01T09:00:00Z'),
        endsAt: new Date('2026-01-01T11:00:00Z'),
      });

      const overrides = await uow.execute(lot.id, (txn) =>
        txn.listActiveCapacityOverrides(lot.id, new Date('2026-01-01T10:00:00Z'), new Date('2026-01-01T12:00:00Z')),
      );
      expect(overrides).toHaveLength(1);
      expect(overrides[0]?.spacesClosed).toBe(3);

      const nonOverlapping = await uow.execute(lot.id, (txn) =>
        txn.listActiveCapacityOverrides(lot.id, new Date('2026-01-01T11:00:00Z'), new Date('2026-01-01T13:00:00Z')),
      );
      expect(nonOverlapping).toHaveLength(0);
    });

    it('findCustomerByEmail returns the flagged status, and null for an unknown email', async () => {
      const lot = await lotRepository.create({ ...lotInput, name: 'Txn Customer Lookup Lot' });
      await pool.query(
        `INSERT INTO customers (name, email, phone, flagged, flag_reason) VALUES ('Flagged Guy', 'flagged@example.com', '555-0100', true, 'chargebacks')`,
      );

      const found = await uow.execute(lot.id, (txn) => txn.findCustomerByEmail('flagged@example.com'));
      expect(found?.flagged).toBe(true);

      const notFound = await uow.execute(lot.id, (txn) => txn.findCustomerByEmail('nobody@example.com'));
      expect(notFound).toBeNull();
    });
  });
});
