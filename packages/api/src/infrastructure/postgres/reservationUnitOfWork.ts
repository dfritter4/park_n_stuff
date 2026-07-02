import type { Pool, PoolClient } from 'pg';
import { withTransaction } from '../db.js';
import type {
  CapacityOverrideRecord,
  LotRecord,
  ReservationRecord,
  ReservationTxn,
  ReservationUnitOfWork,
} from '../../application/ports.js';
import { queryActiveCapacityOverrides } from './capacityOverrideRepository.js';

export interface LotRow {
  id: string;
  name: string;
  address: string;
  neighborhood: string;
  lat: number;
  lng: number;
  capacity: number;
  hourly_rate_cents: number;
  status: 'active' | 'maintenance' | 'deleted';
  created_at: Date;
}

/** Exported so other admin/postgres repositories (e.g. AdminReservationRepository) reuse this mapping instead of duplicating it. */
export function mapLotRow(row: LotRow): LotRecord {
  return {
    id: row.id,
    name: row.name,
    address: row.address,
    neighborhood: row.neighborhood,
    lat: Number(row.lat),
    lng: Number(row.lng),
    capacity: row.capacity,
    hourlyRateCents: row.hourly_rate_cents,
    status: row.status,
    createdAt: row.created_at,
  };
}

export interface ReservationRow {
  id: string;
  reservation_number: string;
  lot_id: string;
  customer_id: string;
  vehicle_make: string;
  vehicle_model: string;
  license_plate: string;
  start_time: Date;
  end_time: Date;
  total_cost_cents: number;
  status: 'active' | 'completed' | 'cancelled';
  created_at: Date;
}

/** Exported so other admin/postgres repositories (e.g. AdminReservationRepository) reuse this mapping instead of duplicating it. */
export function mapReservationRow(row: ReservationRow): ReservationRecord {
  return {
    id: row.id,
    reservationNumber: row.reservation_number,
    lotId: row.lot_id,
    customerId: row.customer_id,
    vehicleMake: row.vehicle_make,
    vehicleModel: row.vehicle_model,
    licensePlate: row.license_plate,
    startTime: row.start_time,
    endTime: row.end_time,
    totalCostCents: row.total_cost_cents,
    status: row.status,
    createdAt: row.created_at,
  };
}

class PostgresReservationTxn implements ReservationTxn {
  constructor(private readonly client: PoolClient) {}

  async getLotForUpdate(lotId: string): Promise<LotRecord | null> {
    const result = await this.client.query<LotRow>('SELECT * FROM lots WHERE id = $1 FOR UPDATE', [lotId]);
    return result.rows[0] ? mapLotRow(result.rows[0]) : null;
  }

  async countActiveOverlapping(lotId: string, start: Date, end: Date): Promise<number> {
    const result = await this.client.query<{ count: string }>(
      `SELECT COUNT(*) FROM reservations
       WHERE lot_id = $1 AND status = 'active' AND start_time < $3 AND end_time > $2`,
      [lotId, start, end],
    );
    return Number(result.rows[0].count);
  }

  async listActiveCapacityOverrides(lotId: string, start: Date, end: Date): Promise<CapacityOverrideRecord[]> {
    return queryActiveCapacityOverrides(this.client, lotId, start, end);
  }

  async findCustomerByEmail(email: string): Promise<{ id: string; flagged: boolean } | null> {
    const result = await this.client.query<{ id: string; flagged: boolean }>(
      'SELECT id, flagged FROM customers WHERE email = $1',
      [email],
    );
    return result.rows[0] ? { id: result.rows[0].id, flagged: result.rows[0].flagged } : null;
  }

  async upsertCustomer(c: { name: string; email: string; phone: string }): Promise<{ id: string }> {
    const result = await this.client.query<{ id: string }>(
      `INSERT INTO customers (name, email, phone) VALUES ($1, $2, $3)
       ON CONFLICT (email) DO UPDATE SET name = EXCLUDED.name, phone = EXCLUDED.phone
       RETURNING id`,
      [c.name, c.email, c.phone],
    );
    return { id: result.rows[0].id };
  }

  async insertReservation(r: Omit<ReservationRecord, 'id' | 'createdAt'>): Promise<ReservationRecord> {
    const result = await this.client.query<ReservationRow>(
      `INSERT INTO reservations
         (reservation_number, lot_id, customer_id, vehicle_make, vehicle_model, license_plate, start_time, end_time, total_cost_cents, status)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)
       RETURNING *`,
      [
        r.reservationNumber,
        r.lotId,
        r.customerId,
        r.vehicleMake,
        r.vehicleModel,
        r.licensePlate,
        r.startTime,
        r.endTime,
        r.totalCostCents,
        r.status,
      ],
    );
    return mapReservationRow(result.rows[0]);
  }

  async insertPayment(p: {
    reservationId: string;
    amountCents: number;
    status: 'succeeded' | 'declined';
    transactionId: string;
    cardLast4: string;
  }): Promise<void> {
    await this.client.query(
      `INSERT INTO payments (reservation_id, amount_cents, status, transaction_id, card_last4)
       VALUES ($1, $2, $3, $4, $5)`,
      [p.reservationId, p.amountCents, p.status, p.transactionId, p.cardLast4],
    );
  }
}

export class PostgresReservationUnitOfWork implements ReservationUnitOfWork {
  constructor(private readonly pool: Pool) {}

  async execute<T>(_lotId: string, fn: (txn: ReservationTxn) => Promise<T>): Promise<T> {
    return withTransaction(this.pool, (client) => fn(new PostgresReservationTxn(client)));
  }
}
