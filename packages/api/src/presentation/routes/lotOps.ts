import { Router, type RequestHandler } from 'express';
import type { CapacityOverrideRepository, LotRepository, PricingRuleRepository } from '../../application/ports.js';
import { requireAdmin } from '../middleware/requireAdmin.js';

export interface LotOpsRouterDeps {
  pricingRuleRepository?: PricingRuleRepository;
  capacityOverrideRepository?: CapacityOverrideRepository;
  lotRepository?: LotRepository;
}

function notImplemented(message: string): RequestHandler {
  return (_req, res) => {
    res.status(501).json({ error: { code: 'NOT_IMPLEMENTED', message } });
  };
}

/**
 * Pricing-rule and capacity-override CRUD for lots. All six endpoints are
 * stubs (501 NOT_IMPLEMENTED) until P6 (pricing/ops backend) replaces them.
 * Mounted at /api so routes resolve to /api/lots/:id/pricing-rules,
 * /api/pricing-rules/:ruleId, /api/lots/:id/capacity-overrides, and
 * /api/capacity-overrides/:id — alongside (not inside) the /api/lots CRUD
 * router, which only owns /api/lots and /api/lots/:id.
 */
export function createLotOpsRouter(_deps: LotOpsRouterDeps, jwtSecret: string): Router {
  const router = Router();
  const adminOnly = requireAdmin(jwtSecret);

  router.get('/lots/:id/pricing-rules', notImplemented('Listing pricing rules is not implemented yet'));
  router.post(
    '/lots/:id/pricing-rules',
    adminOnly,
    notImplemented('Creating a pricing rule is not implemented yet'),
  );
  router.delete(
    '/pricing-rules/:ruleId',
    adminOnly,
    notImplemented('Deleting a pricing rule is not implemented yet'),
  );

  router.get(
    '/lots/:id/capacity-overrides',
    adminOnly,
    notImplemented('Listing capacity overrides is not implemented yet'),
  );
  router.post(
    '/lots/:id/capacity-overrides',
    adminOnly,
    notImplemented('Creating a capacity override is not implemented yet'),
  );
  router.delete(
    '/capacity-overrides/:id',
    adminOnly,
    notImplemented('Deleting a capacity override is not implemented yet'),
  );

  return router;
}
