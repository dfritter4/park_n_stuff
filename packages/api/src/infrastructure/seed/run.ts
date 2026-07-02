import { randomUUID } from 'node:crypto';
import bcrypt from 'bcryptjs';
import type { Pool } from 'pg';
import { createPool } from '../db.js';
import { generateHistory, type SeedReservation } from './generateHistory.js';
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

interface CustomerSeed {
  name: string;
  email: string;
  phone: string;
}

function buildCustomers(): CustomerSeed[] {
  const customers: CustomerSeed[] = [];
  for (const lastName of CUSTOMER_LAST_NAMES) {
    for (const firstName of CUSTOMER_FIRST_NAMES) {
      const index = customers.length;
      customers.push({
        name: `${firstName} ${lastName}`,
        email: `${firstName.toLowerCase()}.${lastName.toLowerCase()}${index}@example.com`,
        phone: `312555${(1000 + index).toString().padStart(4, '0')}`,
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
      'INSERT INTO customers (name, email, phone) VALUES ($1, $2, $3) RETURNING id',
      [customer.name, customer.email, customer.phone],
    );
    customerIds.push(result.rows[0].id);
  }
  return customerIds;
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

    const rBase = index * 11;
    reservationValueGroups.push(
      `($${rBase + 1},$${rBase + 2},$${rBase + 3},$${rBase + 4},$${rBase + 5},$${rBase + 6},$${rBase + 7},$${rBase + 8},$${rBase + 9},$${rBase + 10},$${rBase + 11})`,
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
    );

    const pBase = index * 6;
    paymentValueGroups.push(`($${pBase + 1},$${pBase + 2},$${pBase + 3},$${pBase + 4},$${pBase + 5},$${pBase + 6})`);
    paymentParams.push(
      randomUUID(),
      reservationId,
      reservation.payment.amountCents,
      'succeeded',
      reservation.payment.transactionId,
      reservation.payment.cardLast4,
    );

    batchRevenueCents += reservation.payment.amountCents;
  });

  await pool.query(
    `INSERT INTO reservations
       (id, reservation_number, lot_id, customer_id, vehicle_make, vehicle_model, license_plate, start_time, end_time, total_cost_cents, status)
     VALUES ${reservationValueGroups.join(', ')}`,
    reservationParams,
  );
  await pool.query(
    `INSERT INTO payments (id, reservation_id, amount_cents, status, transaction_id, card_last4)
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

    const reservations = generateHistory([...LOTS], now, random);
    const revenueTotalCents = await seedReservationsAndPayments(pool, reservations, lotIds, customerIds);

    const activeCount = reservations.filter((r) => r.status === 'active').length;
    const completedCount = reservations.filter((r) => r.status === 'completed').length;
    const cancelledCount = reservations.filter((r) => r.status === 'cancelled').length;

    console.log('Seed complete:');
    console.log(`  Lots: ${lotIds.length}`);
    console.log(`  Customers: ${customerIds.length}`);
    console.log(
      `  Reservations: ${reservations.length} (completed: ${completedCount}, cancelled: ${cancelledCount}, active: ${activeCount})`,
    );
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
