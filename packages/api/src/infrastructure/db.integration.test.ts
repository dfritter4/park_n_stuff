import { afterAll, afterEach, beforeAll, describe, expect, it } from 'vitest';
import type { Pool } from 'pg';
import { createPool, withTransaction } from './db';

const DATABASE_URL =
  process.env.DATABASE_URL ?? 'postgres://parking:parking@localhost:5433/parking_test';

describe('withTransaction', () => {
  let pool: Pool;

  beforeAll(() => {
    pool = createPool(DATABASE_URL);
  });

  afterEach(async () => {
    await pool.query('DELETE FROM lots');
  });

  afterAll(async () => {
    await pool.end();
  });

  it('commits the transaction when the callback resolves', async () => {
    await withTransaction(pool, async (client) => {
      await client.query(
        `INSERT INTO lots (name, address, neighborhood, lat, lng, capacity, hourly_rate_cents)
         VALUES ('Test Lot', '123 Main St', 'Downtown', 47.6, -122.3, 10, 500)`,
      );
    });

    const result = await pool.query("SELECT * FROM lots WHERE name = 'Test Lot'");
    expect(result.rowCount).toBe(1);
  });

  it('rolls back the transaction when the callback throws', async () => {
    await expect(
      withTransaction(pool, async (client) => {
        await client.query(
          `INSERT INTO lots (name, address, neighborhood, lat, lng, capacity, hourly_rate_cents)
           VALUES ('Rollback Lot', '456 Elm St', 'Uptown', 47.6, -122.3, 10, 500)`,
        );
        throw new Error('boom');
      }),
    ).rejects.toThrow('boom');

    const result = await pool.query("SELECT * FROM lots WHERE name = 'Rollback Lot'");
    expect(result.rowCount).toBe(0);
  });
});
