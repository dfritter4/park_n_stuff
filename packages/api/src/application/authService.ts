import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';
import { InvalidCredentialsError } from '../domain/errors.js';
import type { AdminUserRepository } from './ports.js';

const TOKEN_EXPIRY_SECONDS = 1800;

export interface LoginResult {
  token: string;
  expiresInSeconds: number;
}

export class AuthService {
  constructor(
    private readonly adminUsers: AdminUserRepository,
    private readonly jwtSecret: string,
  ) {}

  async login(email: string, password: string): Promise<LoginResult> {
    const admin = await this.adminUsers.findByEmail(email);
    if (!admin) {
      throw new InvalidCredentialsError();
    }

    const passwordMatches = await bcrypt.compare(password, admin.passwordHash);
    if (!passwordMatches) {
      throw new InvalidCredentialsError();
    }

    const token = jwt.sign({ sub: admin.id, email: admin.email }, this.jwtSecret, {
      algorithm: 'HS256',
      expiresIn: TOKEN_EXPIRY_SECONDS,
    });

    return { token, expiresInSeconds: TOKEN_EXPIRY_SECONDS };
  }
}
