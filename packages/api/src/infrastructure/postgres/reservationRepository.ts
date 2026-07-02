import type { Pool } from 'pg';
import type { ReservationRecord, ReservationRepository } from '../../application/ports.js';

interface ReservationDetailsRow {
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
  lot_name: string;
  lot_address: string;
  customer_name: string;
  card_last4: string | null;
}

export class PostgresReservationRepository implements ReservationRepository {
  constructor(private readonly pool: Pool) {}

  async findByIdWithDetails(
    id: string,
  ): Promise<
    (ReservationRecord & { lotName: string; lotAddress: string; customerName: string; cardLast4: string }) | null
  > {
    const result = await this.pool.query<ReservationDetailsRow>(
      `SELECT
         reservations.*,
         lots.name AS lot_name,
         lots.address AS lot_address,
         customers.name AS customer_name,
         payments.card_last4 AS card_last4
       FROM reservations
       JOIN lots ON lots.id = reservations.lot_id
       JOIN customers ON customers.id = reservations.customer_id
       LEFT JOIN payments ON payments.reservation_id = reservations.id
       WHERE reservations.id = $1
       ORDER BY payments.created_at DESC NULLS LAST
       LIMIT 1`,
      [id],
    );
    const row = result.rows[0];
    if (!row) return null;

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
      lotName: row.lot_name,
      lotAddress: row.lot_address,
      customerName: row.customer_name,
      cardLast4: row.card_last4 ?? '',
    };
  }
}
