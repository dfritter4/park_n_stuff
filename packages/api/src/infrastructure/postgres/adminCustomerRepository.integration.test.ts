import type { Pool } from 'pg';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { createPool } from '../db.js';
import { PostgresAdminCustomerRepository } from './adminCustomerRepository.js';

const DATABASE_URL = process.env.DATABASE_URL ?? 'postgres://parking:parking@localhost:5433/parking_test';

interface CustomerFixture {
  id: string;
  name: string;
  email: string;
  phone: string;
  flagged?: boolean;
  flagReason?: string | null;
}

async function insertLot(pool: Pool, name: string): Promise<string> {
  const result = await pool.query<{ id: string }>(
    `INSERT INTO lots (name, address, neighborhood, lat, lng, capacity, hourly_rate_cents)
     VALUES ($1, '1 Main St', 'Downtown', 47.6, -122.3, 10, 500)
     RETURNING id`,
    [name],
  );
  return result.rows[0].id;
}

async function insertCustomer(pool: Pool, fixture: CustomerFixture): Promise<void> {
  await pool.query(
    `INSERT INTO customers (id, name, email, phone, flagged, flag_reason)
     VALUES ($1, $2, $3, $4, $5, $6)`,
    [fixture.id, fixture.name, fixture.email, fixture.phone, fixture.flagged ?? false, fixture.flagReason ?? null],
  );
}

async function insertReservation(
  pool: Pool,
  args: { id: string; lotId: string; customerId: string; status?: 'active' | 'completed' | 'cancelled' },
): Promise<void> {
  await pool.query(
    `INSERT INTO reservations
       (id, reservation_number, lot_id, customer_id, vehicle_make, vehicle_model, license_plate,
        start_time, end_time, total_cost_cents, status)
     VALUES ($1, $2, $3, $4, 'Honda', 'Civic', 'ABC123', '2026-01-01T10:00:00Z', '2026-01-01T12:00:00Z', 1000, $5)`,
    [args.id, `RES-${args.id}`, args.lotId, args.customerId, args.status ?? 'completed'],
  );
}

async function insertPayment(
  pool: Pool,
  args: { reservationId: string; amountCents: number; status: 'succeeded' | 'declined' | 'refunded' },
): Promise<void> {
  await pool.query(
    `INSERT INTO payments (reservation_id, amount_cents, status, transaction_id, card_last4)
     VALUES ($1, $2, $3, 'txn', '0001')`,
    [args.reservationId, args.amountCents, args.status],
  );
}

describe('PostgresAdminCustomerRepository (integration)', () => {
  let pool: Pool;
  let repository: PostgresAdminCustomerRepository;

  beforeAll(() => {
    pool = createPool(DATABASE_URL);
    repository = new PostgresAdminCustomerRepository(pool);
  });

  beforeEach(async () => {
    await pool.query('TRUNCATE TABLE payments, reservations, customers, lots RESTART IDENTITY CASCADE');
  });

  afterAll(async () => {
    await pool.end();
  });

  it('computes reservationCount (all statuses) and lifetimeSpendCents (succeeded only, refunded excluded) across a fan-out join', async () => {
    const lotId = await insertLot(pool, 'Fan-out Lot');
    const customerId = 'a0000000-0000-0000-0000-000000000001';
    await insertCustomer(pool, { id: customerId, name: 'Alice Example', email: 'alice@example.com', phone: '555-0100' });

    // Reservation 1: two payments (a declined attempt followed by a succeeded one) —
    // this is the fan-out case: the join produces two rows for this one reservation.
    const res1 = 'b0000000-0000-0000-0000-000000000001';
    await insertReservation(pool, { id: res1, lotId, customerId, status: 'completed' });
    await insertPayment(pool, { reservationId: res1, amountCents: 500, status: 'declined' });
    await insertPayment(pool, { reservationId: res1, amountCents: 2000, status: 'succeeded' });

    // Reservation 2: cancelled, with its succeeded payment refunded — must count
    // toward reservationCount but its amount must NOT count toward lifetime spend.
    const res2 = 'b0000000-0000-0000-0000-000000000002';
    await insertReservation(pool, { id: res2, lotId, customerId, status: 'cancelled' });
    await insertPayment(pool, { reservationId: res2, amountCents: 3000, status: 'refunded' });

    // Reservation 3: active, no payment yet at all (LEFT JOIN keeps it, contributes 0).
    const res3 = 'b0000000-0000-0000-0000-000000000003';
    await insertReservation(pool, { id: res3, lotId, customerId, status: 'active' });

    const detail = await repository.findDetailById(customerId);

    expect(detail).not.toBeNull();
    expect(detail!.reservationCount).toBe(3);
    expect(detail!.lifetimeSpendCents).toBe(2000);
    expect(detail!.reservations).toHaveLength(3);
  });

  it('list() aggregates the same way per customer and total reflects the search filter, not the join fan-out', async () => {
    const lotId = await insertLot(pool, 'List Lot');
    const alice = 'a0000000-0000-0000-0000-0000000000a1';
    const bob = 'a0000000-0000-0000-0000-0000000000b1';
    await insertCustomer(pool, { id: alice, name: 'Alice Example', email: 'alice@example.com', phone: '555-0100' });
    await insertCustomer(pool, { id: bob, name: 'Bob Nomatch', email: 'bob@example.com', phone: '555-0200' });

    const res1 = 'b0000000-0000-0000-0000-0000000000a1';
    await insertReservation(pool, { id: res1, lotId, customerId: alice });
    await insertPayment(pool, { reservationId: res1, amountCents: 1200, status: 'succeeded' });
    const res2 = 'b0000000-0000-0000-0000-0000000000a2';
    await insertReservation(pool, { id: res2, lotId, customerId: alice });
    await insertPayment(pool, { reservationId: res2, amountCents: 800, status: 'succeeded' });

    const { rows, total } = await repository.list({ search: 'alice' }, { page: 1, pageSize: 25 });

    expect(total).toBe(1);
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({
      id: alice,
      reservationCount: 2,
      lifetimeSpendCents: 2000,
      flagged: false,
      flagReason: null,
    });
  });

  it('paginates correctly: total counts distinct customers, not join rows', async () => {
    const lotId = await insertLot(pool, 'Page Lot');
    for (let i = 0; i < 5; i++) {
      const id = `a0000000-0000-0000-0000-00000000${String(10 + i).padStart(4, '0')}`;
      await insertCustomer(pool, { id, name: `Customer ${i}`, email: `customer${i}@example.com`, phone: '555-0000' });
      const resId = `b0000000-0000-0000-0000-00000000${String(10 + i).padStart(4, '0')}`;
      await insertReservation(pool, { id: resId, lotId, customerId: id });
      await insertPayment(pool, { reservationId: resId, amountCents: 100, status: 'succeeded' });
    }

    const page1 = await repository.list({}, { page: 1, pageSize: 2 });
    const page2 = await repository.list({}, { page: 2, pageSize: 2 });

    expect(page1.total).toBe(5);
    expect(page1.rows).toHaveLength(2);
    expect(page2.rows).toHaveLength(2);
  });

  it('setFlag sets flagged + flag_reason, and clears flag_reason on unflag; returns false for an unknown id', async () => {
    const customerId = 'a0000000-0000-0000-0000-000000000099';
    await insertCustomer(pool, { id: customerId, name: 'Carol Example', email: 'carol@example.com', phone: '555-0300' });

    const flagged = await repository.setFlag(customerId, true, 'chargeback history');
    expect(flagged).toBe(true);

    const afterFlag = await repository.findDetailById(customerId);
    expect(afterFlag).toMatchObject({ flagged: true, flagReason: 'chargeback history' });

    const unflagged = await repository.setFlag(customerId, false, null);
    expect(unflagged).toBe(true);

    const afterUnflag = await repository.findDetailById(customerId);
    expect(afterUnflag).toMatchObject({ flagged: false, flagReason: null });

    const unknown = await repository.setFlag('00000000-0000-0000-0000-000000000000', true, 'x');
    expect(unknown).toBe(false);
  });

  it('findDetailById returns null for an unknown customer', async () => {
    const detail = await repository.findDetailById('00000000-0000-0000-0000-000000000000');
    expect(detail).toBeNull();
  });
});
