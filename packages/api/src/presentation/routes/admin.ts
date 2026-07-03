import { Router } from 'express';
import { z } from 'zod';
import type { AnalyticsService } from '../../application/analyticsService.js';
import { ValidationError } from '../../domain/errors.js';
import { requireAdmin } from '../middleware/requireAdmin.js';

const DaysQuerySchema = z.coerce.number().int().min(1).max(90);

const DateParamSchema = z
  .string()
  .regex(/^\d{4}-\d{2}-\d{2}$/, 'date must be in YYYY-MM-DD format')
  .refine((value) => !Number.isNaN(Date.parse(`${value}T00:00:00Z`)), 'date must be a valid calendar date');

const LotIdQuerySchema = z.string().uuid();

/**
 * Admin-only dashboard, analytics, and CSV export routes. Mounted at /api/admin
 * so the endpoints resolve to /api/admin/dashboard, /api/admin/analytics,
 * /api/admin/analytics/day/:date, /api/admin/analytics/export, and the
 * analytics-2 endpoints below (heatmap, weekly-compare, lot-compare, forecast,
 * declines).
 */
export function createAdminAnalyticsRouter(analyticsService: AnalyticsService, jwtSecret: string): Router {
  const router = Router();
  const adminOnly = requireAdmin(jwtSecret);

  router.get('/dashboard', adminOnly, async (_req, res, next) => {
    try {
      res.json(await analyticsService.getDashboard());
    } catch (err) {
      next(err);
    }
  });

  router.get('/analytics', adminOnly, async (req, res, next) => {
    try {
      const daysResult = DaysQuerySchema.safeParse(req.query.days ?? 30);
      if (!daysResult.success) {
        throw new ValidationError('days must be an integer between 1 and 90');
      }
      let lotId: string | undefined;
      if (req.query.lotId !== undefined) {
        const lotIdResult = LotIdQuerySchema.safeParse(req.query.lotId);
        if (!lotIdResult.success) {
          throw new ValidationError('lotId must be a valid UUID');
        }
        lotId = lotIdResult.data;
      }
      res.json(await analyticsService.getAnalytics(daysResult.data, lotId));
    } catch (err) {
      next(err);
    }
  });

  router.get('/analytics/day/:date', adminOnly, async (req, res, next) => {
    try {
      const dateResult = DateParamSchema.safeParse(req.params.date);
      if (!dateResult.success) {
        throw new ValidationError(dateResult.error.issues[0]?.message ?? 'Invalid date');
      }
      let lotId: string | undefined;
      if (req.query.lotId !== undefined) {
        const lotIdResult = LotIdQuerySchema.safeParse(req.query.lotId);
        if (!lotIdResult.success) {
          throw new ValidationError('lotId must be a valid UUID');
        }
        lotId = lotIdResult.data;
      }
      res.json(await analyticsService.getDayBreakdown(dateResult.data, lotId));
    } catch (err) {
      next(err);
    }
  });

  router.get('/analytics/export', adminOnly, async (_req, res, next) => {
    try {
      const csv = await analyticsService.exportReservationsCsv();
      res.setHeader('Content-Type', 'text/csv; charset=utf-8');
      res.setHeader('Content-Disposition', 'attachment; filename="reservations.csv"');
      res.send(csv);
    } catch (err) {
      next(err);
    }
  });

  router.get('/analytics/heatmap', adminOnly, async (req, res, next) => {
    try {
      let lotId: string | undefined;
      if (req.query.lotId !== undefined) {
        const lotIdResult = LotIdQuerySchema.safeParse(req.query.lotId);
        if (!lotIdResult.success) {
          throw new ValidationError('lotId must be a valid UUID');
        }
        lotId = lotIdResult.data;
      }
      res.json(await analyticsService.getHeatmap(lotId));
    } catch (err) {
      next(err);
    }
  });

  router.get('/analytics/weekly-compare', adminOnly, async (_req, res, next) => {
    try {
      res.json(await analyticsService.getWeeklyCompare());
    } catch (err) {
      next(err);
    }
  });

  router.get('/analytics/lot-compare', adminOnly, async (req, res, next) => {
    try {
      const daysResult = DaysQuerySchema.safeParse(req.query.days ?? 30);
      if (!daysResult.success) {
        throw new ValidationError('days must be an integer between 1 and 90');
      }
      res.json(await analyticsService.getLotCompare(daysResult.data));
    } catch (err) {
      next(err);
    }
  });

  router.get('/analytics/forecast', adminOnly, async (req, res, next) => {
    try {
      const lotIdResult = LotIdQuerySchema.safeParse(req.query.lotId);
      if (!lotIdResult.success) {
        throw new ValidationError('lotId is required and must be a valid UUID');
      }
      res.json(await analyticsService.getForecast(lotIdResult.data));
    } catch (err) {
      next(err);
    }
  });

  router.get('/analytics/declines', adminOnly, async (req, res, next) => {
    try {
      const daysResult = DaysQuerySchema.safeParse(req.query.days ?? 30);
      if (!daysResult.success) {
        throw new ValidationError('days must be an integer between 1 and 90');
      }
      res.json(await analyticsService.getDeclines(daysResult.data));
    } catch (err) {
      next(err);
    }
  });

  return router;
}
