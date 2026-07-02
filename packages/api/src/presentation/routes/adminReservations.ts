import { Router, type RequestHandler } from 'express';
import { z } from 'zod';
import {
  ExtendReservationRequestSchema,
  type AdminReservation,
  type AdminReservationDetail,
  type CurrentInLotResponse,
} from '@parking/shared';
import { AdminReservationService } from '../../application/adminReservationService.js';
import type {
  AdminReservationDetailRecord,
  AdminReservationFilters,
  AdminReservationListItem,
  AdminReservationRepository,
  CapacityOverrideRepository,
  Clock,
  CurrentInLotRecord,
  PricingRuleRepository,
} from '../../application/ports.js';
import { validateBody, validateUuidParam } from '../middleware/validate.js';
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

/** `true`/`false` (case-sensitive) — anything else fails validation rather than silently coercing (unlike z.coerce.boolean, which treats the string "false" as truthy). */
const BooleanQuerySchema = z.enum(['true', 'false']).transform((v) => v === 'true');

const ListQuerySchema = z.object({
  lotId: z.string().uuid().optional(),
  status: z.enum(['active', 'completed', 'cancelled']).optional(),
  from: z.string().datetime().optional(),
  to: z.string().datetime().optional(),
  search: z.string().min(1).optional(),
  activeNow: BooleanQuerySchema.optional(),
  page: z.coerce.number().int().min(1).default(1),
  pageSize: z.coerce.number().int().min(1).max(100).default(25),
});

function toAdminReservation(item: AdminReservationListItem): AdminReservation {
  return {
    id: item.id,
    reservationNumber: item.reservationNumber,
    lotId: item.lotId,
    lotName: item.lotName,
    customerName: item.customerName,
    vehicleMake: item.vehicleMake,
    vehicleModel: item.vehicleModel,
    licensePlate: item.licensePlate,
    startTime: item.startTime.toISOString(),
    endTime: item.endTime.toISOString(),
    totalCostCents: item.totalCostCents,
    status: item.status,
    createdAt: item.createdAt.toISOString(),
  };
}

function toAdminReservationDetail(detail: AdminReservationDetailRecord): AdminReservationDetail {
  return {
    ...toAdminReservation(detail),
    customer: detail.customer,
    payments: detail.payments.map((p) => ({
      amountCents: p.amountCents,
      status: p.status,
      transactionId: p.transactionId,
      cardLast4: p.cardLast4,
      createdAt: p.createdAt.toISOString(),
    })),
  };
}

function toCurrentInLotItem(item: CurrentInLotRecord): CurrentInLotResponse[number] {
  return {
    reservationNumber: item.reservationNumber,
    licensePlate: item.licensePlate,
    vehicleMake: item.vehicleMake,
    vehicleModel: item.vehicleModel,
    customerName: item.customerName,
    startTime: item.startTime.toISOString(),
    endTime: item.endTime.toISOString(),
  };
}

/**
 * Admin reservation management: list/detail/cancel/extend, plus the
 * "in lot now" view. Mounted at /api/admin so routes resolve to
 * /api/admin/reservations[...] and /api/admin/lots/:id/current, alongside
 * the admin analytics router. Falls back to 501 NOT_IMPLEMENTED (matching
 * the pre-P3 stub) if adminReservationRepository/pricingRuleRepository
 * aren't wired — this keeps other tests/tasks that build an app without
 * them (e.g. route-stub wiring tests for sibling routers) working
 * unchanged.
 */
export function createAdminReservationsRouter(deps: AdminReservationsRouterDeps, jwtSecret: string): Router {
  const router = Router();
  const adminOnly = requireAdmin(jwtSecret);

  if (!deps.adminReservationRepository || !deps.pricingRuleRepository) {
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

  const service = new AdminReservationService(deps.adminReservationRepository, deps.pricingRuleRepository);
  const clock: Clock = deps.clock ?? { now: () => new Date() };

  router.get('/reservations', adminOnly, async (req, res, next) => {
    try {
      const query = ListQuerySchema.parse(req.query);
      const filters: AdminReservationFilters = {
        lotId: query.lotId,
        status: query.status,
        from: query.from ? new Date(query.from) : undefined,
        to: query.to ? new Date(query.to) : undefined,
        search: query.search,
        activeNow: query.activeNow,
      };
      const { rows, total } = await service.list(filters, { page: query.page, pageSize: query.pageSize });
      res.json({ rows: rows.map(toAdminReservation), total });
    } catch (err) {
      next(err);
    }
  });

  router.get('/reservations/:id', adminOnly, validateUuidParam('id'), async (req, res, next) => {
    try {
      const detail = await service.getDetail(req.params.id);
      res.json(toAdminReservationDetail(detail));
    } catch (err) {
      next(err);
    }
  });

  router.post('/reservations/:id/cancel', adminOnly, validateUuidParam('id'), async (req, res, next) => {
    try {
      const detail = await service.cancel(req.params.id);
      res.json(toAdminReservationDetail(detail));
    } catch (err) {
      next(err);
    }
  });

  router.post(
    '/reservations/:id/extend',
    adminOnly,
    validateUuidParam('id'),
    validateBody(ExtendReservationRequestSchema),
    async (req, res, next) => {
      try {
        const detail = await service.extend(req.params.id, new Date(req.body.newEndTime));
        res.json(toAdminReservationDetail(detail));
      } catch (err) {
        next(err);
      }
    },
  );

  router.get('/lots/:id/current', adminOnly, validateUuidParam('id'), async (req, res, next) => {
    try {
      const rows = await service.currentInLot(req.params.id, clock.now());
      res.json(rows.map(toCurrentInLotItem));
    } catch (err) {
      next(err);
    }
  });

  return router;
}
