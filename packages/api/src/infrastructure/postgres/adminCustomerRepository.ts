import type { Pool } from 'pg';
import type {
  AdminCustomerDetailRecord,
  AdminCustomerListItem,
  AdminCustomerRepository,
  AdminReservationListItem,
  Pagination,
} from '../../application/ports.js';

interface CustomerAggregateRow {
  id: string;
  name: string;
  email: string;
  phone: string;
  flagged: boolean;
  flag_reason: string | null;
  reservation_count: string;
  lifetime_spend_cents: string;
}

function mapCustomerAggregateRow(row: CustomerAggregateRow): AdminCustomerListItem {
  return {
    id: row.id,
    name: row.name,
    email: row.email,
    phone: row.phone,
    flagged: row.flagged,
    flagReason: row.flag_reason,
    reservationCount: Number(row.reservation_count),
    lifetimeSpendCents: Number(row.lifetime_spend_cents),
  };
}

interface CustomerReservationRow {
  id: string;
  reservation_number: string;
  lot_id: string;
  lot_name: string;
  vehicle_make: string;
  vehicle_model: string;
  license_plate: string;
  start_time: Date;
  end_time: Date;
  total_cost_cents: number;
  status: 'active' | 'completed' | 'cancelled';
  created_at: Date;
}

function mapCustomerReservationRow(row: CustomerReservationRow, customerName: string): AdminReservationListItem {
  return {
    id: row.id,
    reservationNumber: row.reservation_number,
    lotId: row.lot_id,
    lotName: row.lot_name,
    customerName,
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

const LATEST_RESERVATIONS_LIMIT = 50;

/**
 * The list/detail aggregate query joins customers -> reservations ->
 * payments so reservationCount (all statuses) and lifetimeSpendCents
 * (succeeded payments only) can be computed in one round trip. The join
 * fans out one row per (reservation, payment) pair per customer;
 * COUNT(DISTINCT r.id) and SUM(...) over the payment-status filter both stay
 * correct across that fan-out because every payment row is only counted
 * once, and every reservation id is deduplicated before counting.
 */
const CUSTOMER_AGGREGATE_SELECT = `
  SELECT
    c.id,
    c.name,
    c.email,
    c.phone,
    c.flagged,
    c.flag_reason,
    COUNT(DISTINCT r.id) AS reservation_count,
    COALESCE(SUM(CASE WHEN p.status = 'succeeded' THEN p.amount_cents ELSE 0 END), 0) AS lifetime_spend_cents
  FROM customers c
  LEFT JOIN reservations r ON r.customer_id = c.id
  LEFT JOIN payments p ON p.reservation_id = r.id
`;

export class PostgresAdminCustomerRepository implements AdminCustomerRepository {
  constructor(private readonly pool: Pool) {}

  async list(
    filters: { search?: string },
    pagination: Pagination,
  ): Promise<{ rows: AdminCustomerListItem[]; total: number }> {
    const search = filters.search ? `%${filters.search}%` : null;
    const offset = (pagination.page - 1) * pagination.pageSize;

    const rowsResult = await this.pool.query<CustomerAggregateRow>(
      `${CUSTOMER_AGGREGATE_SELECT}
       WHERE ($1::text IS NULL OR c.name ILIKE $1 OR c.email ILIKE $1 OR c.phone ILIKE $1)
       GROUP BY c.id
       ORDER BY c.name ASC
       LIMIT $2 OFFSET $3`,
      [search, pagination.pageSize, offset],
    );

    const totalResult = await this.pool.query<{ count: string }>(
      `SELECT COUNT(*) FROM customers c
       WHERE ($1::text IS NULL OR c.name ILIKE $1 OR c.email ILIKE $1 OR c.phone ILIKE $1)`,
      [search],
    );

    return {
      rows: rowsResult.rows.map(mapCustomerAggregateRow),
      total: Number(totalResult.rows[0].count),
    };
  }

  async findDetailById(id: string): Promise<AdminCustomerDetailRecord | null> {
    const aggregateResult = await this.pool.query<CustomerAggregateRow>(
      `${CUSTOMER_AGGREGATE_SELECT}
       WHERE c.id = $1
       GROUP BY c.id`,
      [id],
    );
    const aggregateRow = aggregateResult.rows[0];
    if (!aggregateRow) return null;
    const customer = mapCustomerAggregateRow(aggregateRow);

    const reservationsResult = await this.pool.query<CustomerReservationRow>(
      `SELECT r.id, r.reservation_number, r.lot_id, l.name AS lot_name, r.vehicle_make, r.vehicle_model,
              r.license_plate, r.start_time, r.end_time, r.total_cost_cents, r.status, r.created_at
       FROM reservations r
       JOIN lots l ON l.id = r.lot_id
       WHERE r.customer_id = $1
       ORDER BY r.created_at DESC
       LIMIT $2`,
      [id, LATEST_RESERVATIONS_LIMIT],
    );

    return {
      ...customer,
      reservations: reservationsResult.rows.map((row) => mapCustomerReservationRow(row, customer.name)),
    };
  }

  async setFlag(id: string, flagged: boolean, reason: string | null): Promise<boolean> {
    const result = await this.pool.query(
      'UPDATE customers SET flagged = $2, flag_reason = $3 WHERE id = $1',
      [id, flagged, reason],
    );
    return (result.rowCount ?? 0) > 0;
  }
}
