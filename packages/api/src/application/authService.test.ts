import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';
import { beforeEach, describe, expect, it } from 'vitest';
import { AuthService } from './authService.js';
import { InvalidCredentialsError } from '../domain/errors.js';
import { FakeAdminUserRepository } from './testing/fakes.js';

const JWT_SECRET = 'test-secret';
const PLAINTEXT_PASSWORD = 'correct-horse-battery-staple';

describe('AuthService', () => {
  let adminUsers: FakeAdminUserRepository;
  let service: AuthService;

  beforeEach(() => {
    adminUsers = new FakeAdminUserRepository();
    service = new AuthService(adminUsers, JWT_SECRET);
  });

  describe('login', () => {
    it('returns a signed JWT and expiresInSeconds for a matching email/password', async () => {
      const passwordHash = await bcrypt.hash(PLAINTEXT_PASSWORD, 10);
      const admin = adminUsers.seedAdmin({ email: 'admin@example.com', passwordHash });

      const result = await service.login('admin@example.com', PLAINTEXT_PASSWORD);

      expect(result.expiresInSeconds).toBe(1800);
      const decoded = jwt.verify(result.token, JWT_SECRET) as jwt.JwtPayload;
      expect(decoded.sub).toBe(admin.id);
      expect(decoded.email).toBe(admin.email);
      expect(decoded.exp! - decoded.iat!).toBe(1800);
    });

    it('throws InvalidCredentialsError when the email is not registered', async () => {
      await expect(service.login('nobody@example.com', PLAINTEXT_PASSWORD)).rejects.toThrow(InvalidCredentialsError);
    });

    it('throws InvalidCredentialsError when the password does not match the stored hash', async () => {
      const passwordHash = await bcrypt.hash(PLAINTEXT_PASSWORD, 10);
      adminUsers.seedAdmin({ email: 'admin@example.com', passwordHash });

      await expect(service.login('admin@example.com', 'wrong-password')).rejects.toThrow(InvalidCredentialsError);
    });
  });
});
