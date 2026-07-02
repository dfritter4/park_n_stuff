import type { NextFunction, Request, Response } from 'express';
import jwt from 'jsonwebtoken';

const BEARER_PREFIX = 'Bearer ';

function unauthorized(res: Response): void {
  res.status(401).json({ error: { code: 'UNAUTHORIZED', message: 'Missing or invalid admin credentials' } });
}

/**
 * Verifies a `Bearer <jwt>` Authorization header signed with `jwtSecret`.
 * Rejects with the shared 401 UNAUTHORIZED envelope when the header is
 * missing, malformed, or the token is invalid/expired.
 */
export function requireAdmin(jwtSecret: string) {
  return (req: Request, res: Response, next: NextFunction): void => {
    const header = req.headers.authorization;
    if (!header || !header.startsWith(BEARER_PREFIX)) {
      unauthorized(res);
      return;
    }

    const token = header.slice(BEARER_PREFIX.length);
    try {
      jwt.verify(token, jwtSecret);
      next();
    } catch {
      unauthorized(res);
    }
  };
}
