import { randomUUID } from 'node:crypto';
import bcrypt from 'bcryptjs';
import type { Pool } from 'pg';
import { createPool } from '../db.js';
import { generateHistory, type SeedDeclinedAttempt, type SeedReservation } from './generateHistory.js';
import { LOTS } from './lots.js';
import { createMulberry32 } from './mulberry32.js';

const DEFAULT_DATABASE_URL = 'postgres://parking:parking@localhost:5432/parking';
const ADMIN_EMAIL = 'admin@parknstuff.dev';
const ADMIN_PASSWORD = 'admin123';
const BCRYPT_ROUNDS = 10;

const CUSTOMER_FIRST_NAMES = [
  'James',
  'Maria',
  'Robert',
  'Linda',
  'Michael',
  'Patricia',
  'David',
  'Jennifer',
  'William',
  'Elizabeth',
  'Carlos',
  'Aisha',
  'Wei',
  'Fatima',
  'Noah',
] as const;
const CUSTOMER_LAST_NAMES = ['Johnson', 'Garcia'] as const;
const CUSTOMER_COUNT = CUSTOMER_FIRST_NAMES.length * CUSTOMER_LAST_NAMES.length;

const RESERVATION_INSERT_BATCH_SIZE = 1000;
const DECLINED_ATTEMPT_INSERT_BATCH_SIZE = 1000;

// Deterministic subset of seeded customers flagged for admin-workflow demo purposes.
const FLAGGED_CUSTOMERS: ReadonlyArray<{ index: number; reason: string }> = [
  { index: 0, reason: 'Multiple declined payment attempts in a short window' },
  { index: 1, reason: 'Chargeback dispute opened by card issuer' },
];

interface CustomerSeed {
  name: string;
  email: string;
  phone: string;
  flagged: boolean;
  flagReason: string | null;
}

function buildCustomers(): CustomerSeed[] {
  const flagsByIndex = new Map(FLAGGED_CUSTOMERS.map((f) => [f.index, f.reason]));
  const customers: CustomerSeed[] = [];
  for (const lastName of CUSTOMER_LAST_NAMES) {
    for (const firstName of CUSTOMER_FIRST_NAMES) {
      const index = customers.length;
      const flagReason = flagsByIndex.get(index) ?? null;
      customers.push({
        name: `${firstName} ${lastName}`,
        email: `${firstName.toLowerCase()}.${lastName.toLowerCase()}${index}@example.com`,
        phone: `312555${(1000 + index).toString().padStart(4, '0')}`,
        flagged: flagReason !== null,
        flagReason,
      });
    }
  }
  return customers;
}

async function truncateAll(pool: Pool): Promise<void> {
  await pool.query('TRUNCATE TABLE payments, reservations, customers, admin_users, lots RESTART IDENTITY CASCADE');
}

async function seedAdminUser(pool: Pool): Promise<void> {
  const passwordHash = await bcrypt.hash(ADMIN_PASSWORD, BCRYPT_ROUNDS);
  await pool.query('INSERT INTO admin_users (email, password_hash) VALUES ($1, $2)', [ADMIN_EMAIL, passwordHash]);
}

async function seedLots(pool: Pool): Promise<string[]> {
  const lotIds: string[] = [];
  for (const lot of LOTS) {
    const result = await pool.query<{ id: string }>(
      `INSERT INTO lots (name, address, neighborhood, lat, lng, capacity, hourly_rate_cents)
       VALUES ($1, $2, $3, $4, $5, $6, $7)
       RETURNING id`,
      [lot.name, lot.address, lot.neighborhood, lot.lat, lot.lng, lot.capacity, lot.hourlyRateCents],
    );
    lotIds.push(result.rows[0].id);
  }
  return lotIds;
}

async function seedCustomers(pool: Pool): Promise<string[]> {
  const customerIds: string[] = [];
  for (const customer of buildCustomers()) {
    const result = await pool.query<{ id: string }>(
      'INSERT INTO customers (name, email, phone, flagged, flag_reason) VALUES ($1, $2, $3, $4, $5) RETURNING id',
      [customer.name, customer.email, customer.phone, customer.flagged, customer.flagReason],
    );
    customerIds.push(result.rows[0].id);
  }
  return customerIds;
}

async function seedPricingRules(pool: Pool, lotIds: string[]): Promise<number> {
  const params: unknown[] = [];
  const valueGroups: string[] = [];
  let count = 0;

  LOTS.forEach((lot, lotIndex) => {
    for (const rule of lot.rules ?? []) {
      const base = count * 5;
      valueGroups.push(`($${base + 1},$${base + 2},$${base + 3},$${base + 4},$${base + 5})`);
      params.push(lotIds[lotIndex], rule.dayType, rule.startHour, rule.endHour, rule.hourlyRateCents);
      count += 1;
    }
  });

  if (count === 0) return 0;

  await pool.query(
    `INSERT INTO pricing_rules (lot_id, day_type, start_hour, end_hour, hourly_rate_cents)
     VALUES ${valueGroups.join(', ')}`,
    params,
  );
  return count;
}

async function insertReservationBatch(
  pool: Pool,
  batch: SeedReservation[],
  lotIds: string[],
  customerIds: string[],
): Promise<number> {
  const reservationParams: unknown[] = [];
  const reservationValueGroups: string[] = [];
  const paymentParams: unknown[] = [];
  const paymentValueGroups: string[] = [];
  let batchRevenueCents = 0;

  batch.forEach((reservation, index) => {
    const reservationId = randomUUID();

    const rBase = index * 12;
    reservationValueGroups.push(
      `($${rBase + 1},$${rBase + 2},$${rBase + 3},$${rBase + 4},$${rBase + 5},$${rBase + 6},$${rBase + 7},$${rBase + 8},$${rBase + 9},$${rBase + 10},$${rBase + 11},$${rBase + 12})`,
    );
    reservationParams.push(
      reservationId,
      reservation.reservationNumber,
      lotIds[reservation.lotIndex],
      customerIds[reservation.customerIndex],
      reservation.vehicleMake,
      reservation.vehicleModel,
      reservation.licensePlate,
      reservation.startTime,
      reservation.endTime,
      reservation.totalCostCents,
      reservation.status,
      reservation.startTime,
    );

    const pBase = index * 7;
    paymentValueGroups.push(
      `($${pBase + 1},$${pBase + 2},$${pBase + 3},$${pBase + 4},$${pBase + 5},$${pBase + 6},$${pBase + 7})`,
    );
    paymentParams.push(
      randomUUID(),
      reservationId,
      reservation.payment.amountCents,
      reservation.payment.status,
      reservation.payment.transactionId,
      reservation.payment.cardLast4,
      reservation.startTime,
    );

    if (reservation.payment.status === 'succeeded') {
      batchRevenueCents += reservation.payment.amountCents;
    }
  });

  await pool.query(
    `INSERT INTO reservations
       (id, reservation_number, lot_id, customer_id, vehicle_make, vehicle_model, license_plate, start_time, end_time, total_cost_cents, status, created_at)
     VALUES ${reservationValueGroups.join(', ')}`,
    reservationParams,
  );
  await pool.query(
    `INSERT INTO payments (id, reservation_id, amount_cents, status, transaction_id, card_last4, created_at)
     VALUES ${paymentValueGroups.join(', ')}`,
    paymentParams,
  );

  return batchRevenueCents;
}

async function seedReservationsAndPayments(
  pool: Pool,
  reservations: SeedReservation[],
  lotIds: string[],
  customerIds: string[],
): Promise<number> {
  let revenueTotalCents = 0;
  for (let start = 0; start < reservations.length; start += RESERVATION_INSERT_BATCH_SIZE) {
    const batch = reservations.slice(start, start + RESERVATION_INSERT_BATCH_SIZE);
    revenueTotalCents += await insertReservationBatch(pool, batch, lotIds, customerIds);
  }
  return revenueTotalCents;
}

async function insertDeclinedAttemptBatch(pool: Pool, batch: SeedDeclinedAttempt[], lotIds: string[]): Promise<void> {
  const params: unknown[] = [];
  const valueGroups: string[] = [];

  batch.forEach((attempt, index) => {
    const base = index * 4;
    valueGroups.push(`($${base + 1},$${base + 2},$${base + 3},$${base + 4})`);
    params.push(lotIds[attempt.lotIndex], attempt.amountCents, attempt.cardLast4, attempt.createdAt);
  });

  await pool.query(
    `INSERT INTO declined_attempts (lot_id, amount_cents, card_last4, created_at)
     VALUES ${valueGroups.join(', ')}`,
    params,
  );
}

async function seedDeclinedAttempts(pool: Pool, declinedAttempts: SeedDeclinedAttempt[], lotIds: string[]): Promise<void> {
  for (let start = 0; start < declinedAttempts.length; start += DECLINED_ATTEMPT_INSERT_BATCH_SIZE) {
    const batch = declinedAttempts.slice(start, start + DECLINED_ATTEMPT_INSERT_BATCH_SIZE);
    await insertDeclinedAttemptBatch(pool, batch, lotIds);
  }
}

async function seed(): Promise<void> {
  const databaseUrl = process.env.DATABASE_URL ?? DEFAULT_DATABASE_URL;
  const pool = createPool(databaseUrl);
  const now = new Date();
  const random = createMulberry32(Date.now());

  try {
    await truncateAll(pool);
    await seedAdminUser(pool);

    const lotIds = await seedLots(pool);
    const customerIds = await seedCustomers(pool);

    if (customerIds.length !== CUSTOMER_COUNT) {
      throw new Error(`Expected ${CUSTOMER_COUNT} seeded customers, got ${customerIds.length}`);
    }

    const pricingRuleCount = await seedPricingRules(pool, lotIds);

    const { reservations, declinedAttempts } = generateHistory([...LOTS], now, random);
    const revenueTotalCents = await seedReservationsAndPayments(pool, reservations, lotIds, customerIds);
    await seedDeclinedAttempts(pool, declinedAttempts, lotIds);

    const activeCount = reservations.filter((r) => r.status === 'active').length;
    const completedCount = reservations.filter((r) => r.status === 'completed').length;
    const cancelledCount = reservations.filter((r) => r.status === 'cancelled').length;
    const refundedCount = reservations.filter((r) => r.payment.status === 'refunded').length;
    const flaggedCount = FLAGGED_CUSTOMERS.length;

    console.log('Seed complete:');
    console.log(`  Lots: ${lotIds.length}`);
    console.log(`  Customers: ${customerIds.length} (flagged: ${flaggedCount})`);
    console.log(`  Pricing rules: ${pricingRuleCount}`);
    console.log(
      `  Reservations: ${reservations.length} (completed: ${completedCount}, cancelled: ${cancelledCount}, active: ${activeCount})`,
    );
    console.log(`  Refunded payments: ${refundedCount}`);
    console.log(`  Declined attempts: ${declinedAttempts.length}`);
    console.log(`  Revenue (succeeded payments): $${(revenueTotalCents / 100).toFixed(2)}`);
    console.log(`  Admin login: ${ADMIN_EMAIL} / ${ADMIN_PASSWORD}`);
  } finally {
    await pool.end();
  }
}

seed().catch((error: unknown) => {
  console.error('Seed failed:', error);
  process.exitCode = 1;
});
