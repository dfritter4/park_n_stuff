import type { Pool } from 'pg';
import type { DeclinedAttemptRecord, DeclinedAttemptRepository } from '../../application/ports.js';

interface DeclinedAttemptRow {
  id: string;
  lot_id: string;
  lot_name: string;
  amount_cents: number;
  card_last4: string;
  created_at: Date;
}

function mapRow(row: DeclinedAttemptRow): DeclinedAttemptRecord {
  return {
    id: row.id,
    lotId: row.lot_id,
    lotName: row.lot_name,
    amountCents: row.amount_cents,
    cardLast4: row.card_last4,
    createdAt: row.created_at,
  };
}

export class PostgresDeclinedAttemptRepository implements DeclinedAttemptRepository {
  constructor(private readonly pool: Pool) {}

  async insert(data: { lotId: string; amountCents: number; cardLast4: string }): Promise<void> {
    await this.pool.query('INSERT INTO declined_attempts (lot_id, amount_cents, card_last4) VALUES ($1, $2, $3)', [
      data.lotId,
      data.amountCents,
      data.cardLast4,
    ]);
  }

  async listSince(since: Date): Promise<DeclinedAttemptRecord[]> {
    const result = await this.pool.query<DeclinedAttemptRow>(
      `SELECT da.id, da.lot_id, l.name AS lot_name, da.amount_cents, da.card_last4, da.created_at
       FROM declined_attempts da
       JOIN lots l ON l.id = da.lot_id
       WHERE da.created_at >= $1
       ORDER BY da.created_at DESC`,
      [since],
    );
    return result.rows.map(mapRow);
  }
}
