import { randomUUID } from 'node:crypto';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import type { Pool } from 'pg';
import { createPool, withTransaction } from './db';

const DATABASE_URL =
  process.env.DATABASE_URL ?? 'postgres://parking:parking@localhost:5433/parking_test';

describe('withTransaction', () => {
  let pool: Pool;

  beforeAll(() => {
    pool = createPool(DATABASE_URL);
  });

  afterAll(async () => {
    await pool.end();
  });

  // Names are unique per test run (not a shared literal like 'Test Lot') so
  // this file's assertions can't collide with lot rows other integration
  // test files insert/delete concurrently against the same shared test DB.
  it('commits the transaction when the callback resolves', async () => {
    const name = `Test Lot ${randomUUID()}`;
    await withTransaction(pool, async (client) => {
      await client.query(
        `INSERT INTO lots (name, address, neighborhood, lat, lng, capacity, hourly_rate_cents)
         VALUES ($1, '123 Main St', 'Downtown', 47.6, -122.3, 10, 500)`,
        [name],
      );
    });

    const result = await pool.query('SELECT * FROM lots WHERE name = $1', [name]);
    expect(result.rowCount).toBe(1);

    await pool.query('DELETE FROM lots WHERE name = $1', [name]);
  });

  it('rolls back the transaction when the callback throws', async () => {
    const name = `Rollback Lot ${randomUUID()}`;
    await expect(
      withTransaction(pool, async (client) => {
        await client.query(
          `INSERT INTO lots (name, address, neighborhood, lat, lng, capacity, hourly_rate_cents)
           VALUES ($1, '456 Elm St', 'Uptown', 47.6, -122.3, 10, 500)`,
          [name],
        );
        throw new Error('boom');
      }),
    ).rejects.toThrow('boom');

    const result = await pool.query('SELECT * FROM lots WHERE name = $1', [name]);
    expect(result.rowCount).toBe(0);
  });
});
