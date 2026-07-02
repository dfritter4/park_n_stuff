import type { Pool, PoolClient } from 'pg';
import { withTransaction } from '../db.js';
import type {
  AdminReservationDetailRecord,
  AdminReservationFilters,
  AdminReservationListItem,
  AdminReservationRepository,
  AdminReservationTxn,
  CapacityOverrideRecord,
  CurrentInLotRecord,
  LotRecord,
  Pagination,
  ReservationRecord,
} from '../../application/ports.js';
import { queryActiveCapacityOverrides } from './capacityOverrideRepository.js';
import { mapLotRow, mapReservationRow, type LotRow, type ReservationRow } from './reservationUnitOfWork.js';

interface AdminReservationListRow {
  id: string;
  reservation_number: string;
  lot_id: string;
  lot_name: string;
  customer_name: string;
  vehicle_make: string;
  vehicle_model: string;
  license_plate: string;
  start_time: Date;
  end_time: Date;
  total_cost_cents: number;
  status: 'active' | 'completed' | 'cancelled';
  created_at: Date;
}

function mapListRow(row: AdminReservationListRow): AdminReservationListItem {
  return {
    id: row.id,
    reservationNumber: row.reservation_number,
    lotId: row.lot_id,
    lotName: row.lot_name,
    customerName: row.customer_name,
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

/**
 * Builds the shared WHERE clause (and its positional params) for the admin
 * reservation list/count queries. `from`/`to` bound `reservations.start_time`
 * inclusively on both ends — the admin UI passes exact datetimes (not bare
 * calendar dates), so an inclusive range is unambiguous. `search` matches
 * (case-insensitively) the reservation number, license plate, or the
 * customer's name/email.
 */
function buildFilterClause(filters: AdminReservationFilters): { clause: string; params: unknown[] } {
  const conditions: string[] = [];
  const params: unknown[] = [];

  if (filters.lotId !== undefined) {
    params.push(filters.lotId);
    conditions.push(`reservations.lot_id = $${params.length}`);
  }
  if (filters.status !== undefined) {
    params.push(filters.status);
    conditions.push(`reservations.status = $${params.length}`);
  }
  if (filters.from !== undefined) {
    params.push(filters.from);
    conditions.push(`reservations.start_time >= $${params.length}`);
  }
  if (filters.to !== undefined) {
    params.push(filters.to);
    conditions.push(`reservations.start_time <= $${params.length}`);
  }
  if (filters.search !== undefined) {
    params.push(`%${filters.search}%`);
    const p = params.length;
    conditions.push(
      `(reservations.reservation_number ILIKE $${p} OR reservations.license_plate ILIKE $${p} OR customers.name ILIKE $${p} OR customers.email ILIKE $${p})`,
    );
  }
  if (filters.activeNow) {
    conditions.push(`reservations.status = 'active' AND now() BETWEEN reservations.start_time AND reservations.end_time`);
  }

  return {
    clause: conditions.length > 0 ? `WHERE ${conditions.join(' AND ')}` : '',
    params,
  };
}

class PostgresAdminReservationTxn implements AdminReservationTxn {
  constructor(private readonly client: PoolClient) {}

  async getReservationForUpdate(id: string): Promise<(ReservationRecord & { lotId: string }) | null> {
    const result = await this.client.query<ReservationRow>('SELECT * FROM reservations WHERE id = $1 FOR UPDATE', [
      id,
    ]);
    return result.rows[0] ? mapReservationRow(result.rows[0]) : null;
  }

  async getLotForUpdate(lotId: string): Promise<LotRecord | null> {
    const result = await this.client.query<LotRow>('SELECT * FROM lots WHERE id = $1 FOR UPDATE', [lotId]);
    return result.rows[0] ? mapLotRow(result.rows[0]) : null;
  }

  async countActiveOverlapping(
    lotId: string,
    start: Date,
    end: Date,
    excludeReservationId?: string,
  ): Promise<number> {
    const params: unknown[] = [lotId, start, end];
    let exclusion = '';
    if (excludeReservationId !== undefined) {
      params.push(excludeReservationId);
      exclusion = `AND id != $${params.length}`;
    }
    const result = await this.client.query<{ count: string }>(
      `SELECT COUNT(*) FROM reservations
       WHERE lot_id = $1 AND status = 'active' AND start_time < $3 AND end_time > $2 ${exclusion}`,
      params,
    );
    return Number(result.rows[0].count);
  }

  async listActiveCapacityOverrides(lotId: string, start: Date, end: Date): Promise<CapacityOverrideRecord[]> {
    return queryActiveCapacityOverrides(this.client, lotId, start, end);
  }

  async getOriginalCardLast4(reservationId: string): Promise<string | null> {
    const result = await this.client.query<{ card_last4: string }>(
      `SELECT card_last4 FROM payments WHERE reservation_id = $1 ORDER BY created_at ASC LIMIT 1`,
      [reservationId],
    );
    return result.rows[0]?.card_last4 ?? null;
  }

  async cancelReservation(id: string): Promise<void> {
    await this.client.query(`UPDATE reservations SET status = 'cancelled' WHERE id = $1`, [id]);
  }

  async refundSucceededPayments(reservationId: string): Promise<void> {
    await this.client.query(
      `UPDATE payments SET status = 'refunded' WHERE reservation_id = $1 AND status = 'succeeded'`,
      [reservationId],
    );
  }

  async extendReservation(id: string, newEndTime: Date, newTotalCostCents: number): Promise<void> {
    await this.client.query(`UPDATE reservations SET end_time = $2, total_cost_cents = $3 WHERE id = $1`, [
      id,
      newEndTime,
      newTotalCostCents,
    ]);
  }

  async insertPayment(p: {
    reservationId: string;
    amountCents: number;
    status: 'succeeded' | 'declined' | 'refunded';
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

export class PostgresAdminReservationRepository implements AdminReservationRepository {
  constructor(private readonly pool: Pool) {}

  async list(
    filters: AdminReservationFilters,
    pagination: Pagination,
  ): Promise<{ rows: AdminReservationListItem[]; total: number }> {
    const { clause, params } = buildFilterClause(filters);
    const offset = (pagination.page - 1) * pagination.pageSize;

    const [rowsResult, countResult] = await Promise.all([
      this.pool.query<AdminReservationListRow>(
        `SELECT
           reservations.id,
           reservations.reservation_number,
           reservations.lot_id,
           lots.name AS lot_name,
           customers.name AS customer_name,
           reservations.vehicle_make,
           reservations.vehicle_model,
           reservations.license_plate,
           reservations.start_time,
           reservations.end_time,
           reservations.total_cost_cents,
           reservations.status,
           reservations.created_at
         FROM reservations
         JOIN lots ON lots.id = reservations.lot_id
         JOIN customers ON customers.id = reservations.customer_id
         ${clause}
         ORDER BY reservations.created_at DESC
         LIMIT $${params.length + 1} OFFSET $${params.length + 2}`,
        [...params, pagination.pageSize, offset],
      ),
      this.pool.query<{ count: string }>(
        `SELECT COUNT(*) FROM reservations
         JOIN lots ON lots.id = reservations.lot_id
         JOIN customers ON customers.id = reservations.customer_id
         ${clause}`,
        params,
      ),
    ]);

    return {
      rows: rowsResult.rows.map(mapListRow),
      total: Number(countResult.rows[0].count),
    };
  }

  async findDetailById(id: string): Promise<AdminReservationDetailRecord | null> {
    const reservationResult = await this.pool.query<
      AdminReservationListRow & { customer_email: string; customer_phone: string; customer_flagged: boolean }
    >(
      `SELECT
         reservations.id,
         reservations.reservation_number,
         reservations.lot_id,
         lots.name AS lot_name,
         customers.name AS customer_name,
         customers.email AS customer_email,
         customers.phone AS customer_phone,
         customers.flagged AS customer_flagged,
         reservations.vehicle_make,
         reservations.vehicle_model,
         reservations.license_plate,
         reservations.start_time,
         reservations.end_time,
         reservations.total_cost_cents,
         reservations.status,
         reservations.created_at
       FROM reservations
       JOIN lots ON lots.id = reservations.lot_id
       JOIN customers ON customers.id = reservations.customer_id
       WHERE reservations.id = $1`,
      [id],
    );
    const row = reservationResult.rows[0];
    if (!row) return null;

    const paymentsResult = await this.pool.query<{
      amount_cents: number;
      status: 'succeeded' | 'declined' | 'refunded';
      transaction_id: string;
      card_last4: string;
      created_at: Date;
    }>(
      `SELECT amount_cents, status, transaction_id, card_last4, created_at
       FROM payments WHERE reservation_id = $1 ORDER BY created_at ASC`,
      [id],
    );

    return {
      ...mapListRow(row),
      customer: {
        name: row.customer_name,
        email: row.customer_email,
        phone: row.customer_phone,
        flagged: row.customer_flagged,
      },
      payments: paymentsResult.rows.map((p) => ({
        amountCents: p.amount_cents,
        status: p.status,
        transactionId: p.transaction_id,
        cardLast4: p.card_last4,
        createdAt: p.created_at,
      })),
    };
  }

  async listCurrentInLot(lotId: string, now: Date): Promise<CurrentInLotRecord[]> {
    const result = await this.pool.query<{
      reservation_number: string;
      license_plate: string;
      vehicle_make: string;
      vehicle_model: string;
      customer_name: string;
      start_time: Date;
      end_time: Date;
    }>(
      `SELECT
         reservations.reservation_number,
         reservations.license_plate,
         reservations.vehicle_make,
         reservations.vehicle_model,
         customers.name AS customer_name,
         reservations.start_time,
         reservations.end_time
       FROM reservations
       JOIN customers ON customers.id = reservations.customer_id
       WHERE reservations.lot_id = $1 AND reservations.status = 'active' AND $2 BETWEEN reservations.start_time AND reservations.end_time
       ORDER BY reservations.start_time ASC`,
      [lotId, now],
    );
    return result.rows.map((row) => ({
      reservationNumber: row.reservation_number,
      licensePlate: row.license_plate,
      vehicleMake: row.vehicle_make,
      vehicleModel: row.vehicle_model,
      customerName: row.customer_name,
      startTime: row.start_time,
      endTime: row.end_time,
    }));
  }

  async withTransaction<T>(fn: (txn: AdminReservationTxn) => Promise<T>): Promise<T> {
    return withTransaction(this.pool, (client) => fn(new PostgresAdminReservationTxn(client)));
  }
}
