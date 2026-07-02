import { Router, type RequestHandler } from 'express';
import type {
  AdminReservationRepository,
  CapacityOverrideRepository,
  Clock,
  PricingRuleRepository,
} from '../../application/ports.js';
import { requireAdmin } from '../middleware/requireAdmin.js';

export interface AdminReservationsRouterDeps {
  adminReservationRepository?: AdminReservationRepository;
  capacityOverrideRepository?: CapacityOverrideRepository;
  pricingRuleRepository?: PricingRuleRepository;
  clock?: Clock;
}

function notImplemented(message: string): RequestHandler {
  return (_req, res) => {
    res.status(501).json({ error: { code: 'NOT_IMPLEMENTED', message } });
  };
}

/**
 * Admin reservation management: list/detail/cancel/extend, plus the
 * "in lot now" view. All five endpoints are stubs (501 NOT_IMPLEMENTED)
 * until P3 (admin reservations backend) replaces them. Mounted at
 * /api/admin so routes resolve to /api/admin/reservations[...] and
 * /api/admin/lots/:id/current, alongside the admin analytics router.
 */
export function createAdminReservationsRouter(_deps: AdminReservationsRouterDeps, jwtSecret: string): Router {
  const router = Router();
  const adminOnly = requireAdmin(jwtSecret);

  router.get('/reservations', adminOnly, notImplemented('Admin reservation listing is not implemented yet'));
  router.get('/reservations/:id', adminOnly, notImplemented('Admin reservation detail is not implemented yet'));
  router.post(
    '/reservations/:id/cancel',
    adminOnly,
    notImplemented('Admin reservation cancellation is not implemented yet'),
  );
  router.post(
    '/reservations/:id/extend',
    adminOnly,
    notImplemented('Admin reservation extension is not implemented yet'),
  );
  router.get('/lots/:id/current', adminOnly, notImplemented('Current-in-lot listing is not implemented yet'));

  return router;
}
