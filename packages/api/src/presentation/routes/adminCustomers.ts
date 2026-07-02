import { Router, type RequestHandler } from 'express';
import { z } from 'zod';
import { FlagCustomerRequestSchema } from '@parking/shared';
import { AdminCustomerService } from '../../application/adminCustomerService.js';
import type { AdminCustomerRepository } from '../../application/ports.js';
import { ValidationError } from '../../domain/errors.js';
import { requireAdmin } from '../middleware/requireAdmin.js';
import { validateBody, validateUuidParam } from '../middleware/validate.js';

export interface AdminCustomersRouterDeps {
  adminCustomerRepository?: AdminCustomerRepository;
}

const DEFAULT_PAGE_SIZE = 25;
const MAX_PAGE_SIZE = 100;

const PageQuerySchema = z.coerce.number().int().min(1);
const PageSizeQuerySchema = z.coerce.number().int().min(1).max(MAX_PAGE_SIZE);

function notImplemented(message: string): RequestHandler {
  return (_req, res) => {
    res.status(501).json({ error: { code: 'NOT_IMPLEMENTED', message } });
  };
}

/**
 * Admin customer management: list/detail/flag/unflag, mounted at
 * /api/admin/customers. Flag/unflag both return the refreshed
 * AdminCustomerDetail shape (mirrors the admin-reservations cancel/extend
 * convention of returning the updated detail rather than a bespoke ack).
 *
 * `adminCustomerRepository` stays optional (falling back to the original
 * 501 stub behavior when absent) purely so callers that build `createApp`
 * without it — other tasks' test fixtures predating this router's real
 * implementation — keep compiling and passing unchanged.
 */
export function createAdminCustomersRouter(deps: AdminCustomersRouterDeps, jwtSecret: string): Router {
  const router = Router();
  const adminOnly = requireAdmin(jwtSecret);
  const adminCustomerService = deps.adminCustomerRepository
    ? new AdminCustomerService(deps.adminCustomerRepository)
    : undefined;

  if (!adminCustomerService) {
    router.get('/', adminOnly, notImplemented('Admin customer listing is not implemented yet'));
    router.get('/:id', adminOnly, notImplemented('Admin customer detail is not implemented yet'));
    router.post('/:id/flag', adminOnly, notImplemented('Flagging a customer is not implemented yet'));
    router.post('/:id/unflag', adminOnly, notImplemented('Unflagging a customer is not implemented yet'));
    return router;
  }

  router.get('/', adminOnly, async (req, res, next) => {
    try {
      const pageResult = PageQuerySchema.safeParse(req.query.page ?? 1);
      if (!pageResult.success) {
        throw new ValidationError('page must be a positive integer');
      }
      const pageSizeResult = PageSizeQuerySchema.safeParse(req.query.pageSize ?? DEFAULT_PAGE_SIZE);
      if (!pageSizeResult.success) {
        throw new ValidationError(`pageSize must be between 1 and ${MAX_PAGE_SIZE}`);
      }
      const search = typeof req.query.search === 'string' && req.query.search.length > 0 ? req.query.search : undefined;

      const result = await adminCustomerService.list(
        { search },
        { page: pageResult.data, pageSize: pageSizeResult.data },
      );
      res.json(result);
    } catch (err) {
      next(err);
    }
  });

  router.get('/:id', adminOnly, validateUuidParam('id'), async (req, res, next) => {
    try {
      res.json(await adminCustomerService.getDetail(req.params.id));
    } catch (err) {
      next(err);
    }
  });

  router.post(
    '/:id/flag',
    adminOnly,
    validateUuidParam('id'),
    validateBody(FlagCustomerRequestSchema),
    async (req, res, next) => {
      try {
        res.json(await adminCustomerService.flag(req.params.id, req.body.reason));
      } catch (err) {
        next(err);
      }
    },
  );

  router.post('/:id/unflag', adminOnly, validateUuidParam('id'), async (req, res, next) => {
    try {
      res.json(await adminCustomerService.unflag(req.params.id));
    } catch (err) {
      next(err);
    }
  });

  return router;
}
