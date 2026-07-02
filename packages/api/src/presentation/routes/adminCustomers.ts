import { Router, type RequestHandler } from 'express';
import type { AdminCustomerRepository } from '../../application/ports.js';
import { requireAdmin } from '../middleware/requireAdmin.js';

export interface AdminCustomersRouterDeps {
  adminCustomerRepository?: AdminCustomerRepository;
}

function notImplemented(message: string): RequestHandler {
  return (_req, res) => {
    res.status(501).json({ error: { code: 'NOT_IMPLEMENTED', message } });
  };
}

/**
 * Admin customer management: list/detail/flag/unflag. All four endpoints
 * are stubs (501 NOT_IMPLEMENTED) until P4 (admin customers backend)
 * replaces them. Mounted at /api/admin/customers.
 */
export function createAdminCustomersRouter(_deps: AdminCustomersRouterDeps, jwtSecret: string): Router {
  const router = Router();
  const adminOnly = requireAdmin(jwtSecret);

  router.get('/', adminOnly, notImplemented('Admin customer listing is not implemented yet'));
  router.get('/:id', adminOnly, notImplemented('Admin customer detail is not implemented yet'));
  router.post('/:id/flag', adminOnly, notImplemented('Flagging a customer is not implemented yet'));
  router.post('/:id/unflag', adminOnly, notImplemented('Unflagging a customer is not implemented yet'));

  return router;
}
