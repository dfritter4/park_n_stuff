import { Router, type RequestHandler } from 'express';
import { CreateCapacityOverrideRequestSchema, CreatePricingRuleRequestSchema } from '@parking/shared';
import type { CapacityOverrideRepository, LotRepository, PricingRuleRepository } from '../../application/ports.js';
import { LotOpsService } from '../../application/lotOpsService.js';
import { requireAdmin } from '../middleware/requireAdmin.js';
import { validateBody, validateUuidParam } from '../middleware/validate.js';

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
 * Pricing-rule and capacity-override CRUD for lots (P6). Mounted at /api so
 * routes resolve to /api/lots/:id/pricing-rules, /api/pricing-rules/:ruleId,
 * /api/lots/:id/capacity-overrides, and /api/capacity-overrides/:id —
 * alongside (not inside) the /api/lots CRUD router, which only owns
 * /api/lots and /api/lots/:id.
 *
 * GET pricing-rules is public (the customer app may surface it later);
 * every other route requires an admin JWT. If the composition root hasn't
 * supplied all three repositories, every route falls back to the 501
 * NOT_IMPLEMENTED envelope — mirrors the "nullable deps OK" contract the
 * other phase-2 routers use before their owning task lands.
 */
export function createLotOpsRouter(deps: LotOpsRouterDeps, jwtSecret: string): Router {
  const router = Router();
  const adminOnly = requireAdmin(jwtSecret);

  const service =
    deps.lotRepository && deps.pricingRuleRepository && deps.capacityOverrideRepository
      ? new LotOpsService(deps.lotRepository, deps.pricingRuleRepository, deps.capacityOverrideRepository)
      : undefined;

  router.get('/lots/:id/pricing-rules', validateUuidParam('id'), async (req, res, next) => {
    if (!service) {
      notImplemented('Listing pricing rules is not implemented yet')(req, res, next);
      return;
    }
    try {
      res.json(await service.listPricingRules(req.params.id));
    } catch (err) {
      next(err);
    }
  });

  router.post(
    '/lots/:id/pricing-rules',
    adminOnly,
    validateUuidParam('id'),
    validateBody(CreatePricingRuleRequestSchema),
    async (req, res, next) => {
      if (!service) {
        notImplemented('Creating a pricing rule is not implemented yet')(req, res, next);
        return;
      }
      try {
        const rule = await service.createPricingRule(req.params.id, req.body);
        res.status(201).json(rule);
      } catch (err) {
        next(err);
      }
    },
  );

  router.delete('/pricing-rules/:ruleId', adminOnly, validateUuidParam('ruleId'), async (req, res, next) => {
    if (!service) {
      notImplemented('Deleting a pricing rule is not implemented yet')(req, res, next);
      return;
    }
    try {
      await service.deletePricingRule(req.params.ruleId);
      res.status(204).send();
    } catch (err) {
      next(err);
    }
  });

  router.get('/lots/:id/capacity-overrides', adminOnly, validateUuidParam('id'), async (req, res, next) => {
    if (!service) {
      notImplemented('Listing capacity overrides is not implemented yet')(req, res, next);
      return;
    }
    try {
      res.json(await service.listCapacityOverrides(req.params.id));
    } catch (err) {
      next(err);
    }
  });

  router.post(
    '/lots/:id/capacity-overrides',
    adminOnly,
    validateUuidParam('id'),
    validateBody(CreateCapacityOverrideRequestSchema),
    async (req, res, next) => {
      if (!service) {
        notImplemented('Creating a capacity override is not implemented yet')(req, res, next);
        return;
      }
      try {
        const override = await service.createCapacityOverride(req.params.id, {
          spacesClosed: req.body.spacesClosed,
          reason: req.body.reason,
          startsAt: new Date(req.body.startsAt),
          endsAt: req.body.endsAt ? new Date(req.body.endsAt) : null,
        });
        res.status(201).json(override);
      } catch (err) {
        next(err);
      }
    },
  );

  router.delete('/capacity-overrides/:id', adminOnly, validateUuidParam('id'), async (req, res, next) => {
    if (!service) {
      notImplemented('Deleting a capacity override is not implemented yet')(req, res, next);
      return;
    }
    try {
      await service.deleteCapacityOverride(req.params.id);
      res.status(204).send();
    } catch (err) {
      next(err);
    }
  });

  return router;
}
