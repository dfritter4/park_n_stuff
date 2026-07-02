import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    environment: 'node',
    // Integration tests share one live Postgres test database with no per-file
    // schema isolation (see infrastructure/db.integration.test.ts and
    // infrastructure/postgres/repositories.integration.test.ts, both of which
    // truncate/delete shared tables). Running test files in parallel workers
    // causes them to stomp on each other's fixtures. Serializing file execution
    // trades some wall-clock time for correctness, which integration tests need.
    fileParallelism: false,
  },
});
