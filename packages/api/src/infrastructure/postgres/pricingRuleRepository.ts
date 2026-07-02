import type { Pool } from 'pg';
import type { PricingRuleRecord, PricingRuleRepository } from '../../application/ports.js';

interface PricingRuleRow {
  id: string;
  lot_id: string;
  day_type: 'weekday' | 'weekend' | 'all';
  start_hour: number;
  end_hour: number;
  hourly_rate_cents: number;
  created_at: Date;
}

function mapRow(row: PricingRuleRow): PricingRuleRecord {
  return {
    id: row.id,
    lotId: row.lot_id,
    dayType: row.day_type,
    startHour: row.start_hour,
    endHour: row.end_hour,
    hourlyRateCents: row.hourly_rate_cents,
    createdAt: row.created_at,
  };
}

export class PostgresPricingRuleRepository implements PricingRuleRepository {
  constructor(private readonly pool: Pool) {}

  async listByLot(lotId: string): Promise<PricingRuleRecord[]> {
    const result = await this.pool.query<PricingRuleRow>(
      'SELECT * FROM pricing_rules WHERE lot_id = $1 ORDER BY start_hour',
      [lotId],
    );
    return result.rows.map(mapRow);
  }

  async create(
    lotId: string,
    data: Omit<PricingRuleRecord, 'id' | 'lotId' | 'createdAt'>,
  ): Promise<PricingRuleRecord> {
    const result = await this.pool.query<PricingRuleRow>(
      `INSERT INTO pricing_rules (lot_id, day_type, start_hour, end_hour, hourly_rate_cents)
       VALUES ($1, $2, $3, $4, $5)
       RETURNING *`,
      [lotId, data.dayType, data.startHour, data.endHour, data.hourlyRateCents],
    );
    return mapRow(result.rows[0]);
  }

  async delete(id: string): Promise<boolean> {
    const result = await this.pool.query('DELETE FROM pricing_rules WHERE id = $1', [id]);
    return (result.rowCount ?? 0) > 0;
  }
}
