import { Router } from 'express';
import { LoginRequestSchema } from '@parking/shared';
import type { AuthService } from '../../application/authService.js';
import { validateBody } from '../middleware/validate.js';

export function createAdminAuthRouter(authService: AuthService): Router {
  const router = Router();

  router.post('/login', validateBody(LoginRequestSchema), async (req, res, next) => {
    try {
      const { email, password } = req.body;
      const result = await authService.login(email, password);
      res.json(result);
    } catch (err) {
      next(err);
    }
  });

  return router;
}
