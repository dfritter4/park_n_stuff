import type { Pool } from 'pg';
import type { LotRecord, LotRepository } from '../../application/ports.js';

interface LotRow {
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

function mapLotRow(row: LotRow): LotRecord {
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

const UPDATABLE_COLUMNS: Record<string, string> = {
  name: 'name',
  address: 'address',
  neighborhood: 'neighborhood',
  lat: 'lat',
  lng: 'lng',
  capacity: 'capacity',
  hourlyRateCents: 'hourly_rate_cents',
  status: 'status',
};

export class PostgresLotRepository implements LotRepository {
  constructor(private readonly pool: Pool) {}

  async findAllActive(): Promise<Array<LotRecord & { activeReservations: number }>> {
    const result = await this.pool.query<LotRow & { active_reservations: string }>(
      `SELECT lots.*, COUNT(reservations.id) FILTER (WHERE reservations.status = 'active') AS active_reservations
       FROM lots
       LEFT JOIN reservations ON reservations.lot_id = lots.id
       WHERE lots.status != 'deleted'
       GROUP BY lots.id
       ORDER BY lots.created_at`,
    );
    return result.rows.map((row) => ({ ...mapLotRow(row), activeReservations: Number(row.active_reservations) }));
  }

  async findById(id: string): Promise<(LotRecord & { activeReservations: number }) | null> {
    const result = await this.pool.query<LotRow & { active_reservations: string }>(
      `SELECT lots.*, COUNT(reservations.id) FILTER (WHERE reservations.status = 'active') AS active_reservations
       FROM lots
       LEFT JOIN reservations ON reservations.lot_id = lots.id
       WHERE lots.id = $1
       GROUP BY lots.id`,
      [id],
    );
    const row = result.rows[0];
    return row ? { ...mapLotRow(row), activeReservations: Number(row.active_reservations) } : null;
  }

  async create(data: Omit<LotRecord, 'id' | 'createdAt' | 'status'>): Promise<LotRecord> {
    const result = await this.pool.query<LotRow>(
      `INSERT INTO lots (name, address, neighborhood, lat, lng, capacity, hourly_rate_cents)
       VALUES ($1, $2, $3, $4, $5, $6, $7)
       RETURNING *`,
      [data.name, data.address, data.neighborhood, data.lat, data.lng, data.capacity, data.hourlyRateCents],
    );
    return mapLotRow(result.rows[0]);
  }

  async update(id: string, data: Partial<Omit<LotRecord, 'id' | 'createdAt'>>): Promise<LotRecord | null> {
    const fields: string[] = [];
    const values: unknown[] = [];

    for (const [key, column] of Object.entries(UPDATABLE_COLUMNS)) {
      const value = (data as Record<string, unknown>)[key];
      if (value !== undefined) {
        values.push(value);
        fields.push(`${column} = $${values.length}`);
      }
    }

    if (fields.length === 0) {
      const existing = await this.pool.query<LotRow>('SELECT * FROM lots WHERE id = $1', [id]);
      return existing.rows[0] ? mapLotRow(existing.rows[0]) : null;
    }

    values.push(id);
    const result = await this.pool.query<LotRow>(
      `UPDATE lots SET ${fields.join(', ')} WHERE id = $${values.length} RETURNING *`,
      values,
    );
    return result.rows[0] ? mapLotRow(result.rows[0]) : null;
  }

  async softDelete(id: string): Promise<boolean> {
    const result = await this.pool.query(`UPDATE lots SET status = 'deleted' WHERE id = $1 AND status != 'deleted'`, [
      id,
    ]);
    return (result.rowCount ?? 0) > 0;
  }
}
