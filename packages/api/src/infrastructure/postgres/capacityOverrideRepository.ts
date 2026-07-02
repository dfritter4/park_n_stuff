import type { Pool, PoolClient } from 'pg';
import type { CapacityOverrideRecord, CapacityOverrideRepository } from '../../application/ports.js';

export interface CapacityOverrideRow {
  id: string;
  lot_id: string;
  spaces_closed: number;
  reason: string | null;
  starts_at: Date;
  ends_at: Date | null;
  created_at: Date;
}

export function mapCapacityOverrideRow(row: CapacityOverrideRow): CapacityOverrideRecord {
  return {
    id: row.id,
    lotId: row.lot_id,
    spacesClosed: row.spaces_closed,
    reason: row.reason,
    startsAt: row.starts_at,
    endsAt: row.ends_at,
    createdAt: row.created_at,
  };
}

/**
 * Overrides overlapping [start, end) for a lot. Exported as a standalone
 * query (not just a PostgresCapacityOverrideRepository method) so
 * PostgresReservationTxn can run the exact same query against its own
 * transaction client, keeping the reservation capacity gate's override read
 * inside the unit of work instead of a separate pool connection.
 */
export async function queryActiveCapacityOverrides(
  queryable: Pool | PoolClient,
  lotId: string,
  start: Date,
  end: Date,
): Promise<CapacityOverrideRecord[]> {
  const result = await queryable.query<CapacityOverrideRow>(
    `SELECT * FROM capacity_overrides WHERE lot_id = $1 AND starts_at < $3 AND (ends_at IS NULL OR ends_at > $2)`,
    [lotId, start, end],
  );
  return result.rows.map(mapCapacityOverrideRow);
}

export class PostgresCapacityOverrideRepository implements CapacityOverrideRepository {
  constructor(private readonly pool: Pool) {}

  async listByLot(lotId: string): Promise<CapacityOverrideRecord[]> {
    const result = await this.pool.query<CapacityOverrideRow>(
      'SELECT * FROM capacity_overrides WHERE lot_id = $1 ORDER BY starts_at',
      [lotId],
    );
    return result.rows.map(mapCapacityOverrideRow);
  }

  async listActiveForWindow(lotId: string, start: Date, end: Date): Promise<CapacityOverrideRecord[]> {
    return queryActiveCapacityOverrides(this.pool, lotId, start, end);
  }

  async create(
    lotId: string,
    data: Omit<CapacityOverrideRecord, 'id' | 'lotId' | 'createdAt'>,
  ): Promise<CapacityOverrideRecord> {
    const result = await this.pool.query<CapacityOverrideRow>(
      `INSERT INTO capacity_overrides (lot_id, spaces_closed, reason, starts_at, ends_at)
       VALUES ($1, $2, $3, $4, $5)
       RETURNING *`,
      [lotId, data.spacesClosed, data.reason, data.startsAt, data.endsAt],
    );
    return mapCapacityOverrideRow(result.rows[0]);
  }

  async delete(id: string): Promise<boolean> {
    const result = await this.pool.query('DELETE FROM capacity_overrides WHERE id = $1', [id]);
    return (result.rowCount ?? 0) > 0;
  }
}
