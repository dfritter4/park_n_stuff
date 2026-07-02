import type { Pool } from 'pg';

export interface AdminUserRecord {
  id: string;
  email: string;
  passwordHash: string;
}

interface AdminUserRow {
  id: string;
  email: string;
  password_hash: string;
}

function mapAdminUserRow(row: AdminUserRow): AdminUserRecord {
  return { id: row.id, email: row.email, passwordHash: row.password_hash };
}

export class PostgresAdminUserRepository {
  constructor(private readonly pool: Pool) {}

  async findByEmail(email: string): Promise<AdminUserRecord | null> {
    const result = await this.pool.query<AdminUserRow>(
      'SELECT id, email, password_hash FROM admin_users WHERE email = $1',
      [email],
    );
    return result.rows[0] ? mapAdminUserRow(result.rows[0]) : null;
  }

  async create(email: string, passwordHash: string): Promise<AdminUserRecord> {
    const result = await this.pool.query<AdminUserRow>(
      'INSERT INTO admin_users (email, password_hash) VALUES ($1, $2) RETURNING id, email, password_hash',
      [email, passwordHash],
    );
    return mapAdminUserRow(result.rows[0]);
  }
}
