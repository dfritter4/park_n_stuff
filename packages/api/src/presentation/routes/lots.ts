import { Router } from 'express';
import { CreateLotRequestSchema, UpdateLotRequestSchema } from '@parking/shared';
import type { LotService } from '../../application/lotService.js';
import { ValidationError } from '../../domain/errors.js';
import { haversineDistanceKm } from '../geo.js';
import { requireAdmin } from '../middleware/requireAdmin.js';
import { validateBody, validateUuidParam } from '../middleware/validate.js';

function parseCoordinate(value: unknown, paramName: string): number {
  const num = Number(value);
  if (typeof value !== 'string' || value.trim() === '' || Number.isNaN(num)) {
    throw new ValidationError(`${paramName} must be a number`);
  }
  return num;
}

export function createLotsRouter(lotService: LotService, jwtSecret: string): Router {
  const router = Router();
  const adminOnly = requireAdmin(jwtSecret);

  router.get('/', async (req, res, next) => {
    try {
      let lots = await lotService.list();

      const { search, lat, lng } = req.query;

      if (typeof search === 'string' && search.trim() !== '') {
        const term = search.trim().toLowerCase();
        lots = lots.filter(
          (lot) =>
            lot.name.toLowerCase().includes(term) ||
            lot.address.toLowerCase().includes(term) ||
            lot.neighborhood.toLowerCase().includes(term),
        );
      }

      if (lat !== undefined || lng !== undefined) {
        const origin = { lat: parseCoordinate(lat, 'lat'), lng: parseCoordinate(lng, 'lng') };
        lots = [...lots].sort(
          (a, b) =>
            haversineDistanceKm(origin, { lat: a.lat, lng: a.lng }) -
            haversineDistanceKm(origin, { lat: b.lat, lng: b.lng }),
        );
      }

      res.json(lots);
    } catch (err) {
      next(err);
    }
  });

  router.get('/:id', validateUuidParam('id'), async (req, res, next) => {
    try {
      const lot = await lotService.getById(req.params.id);
      res.json(lot);
    } catch (err) {
      next(err);
    }
  });

  router.post('/', adminOnly, validateBody(CreateLotRequestSchema), async (req, res, next) => {
    try {
      const lot = await lotService.create(req.body);
      res.status(201).json(lot);
    } catch (err) {
      next(err);
    }
  });

  router.put('/:id', adminOnly, validateUuidParam('id'), validateBody(UpdateLotRequestSchema), async (req, res, next) => {
    try {
      const lot = await lotService.update(req.params.id, req.body);
      res.json(lot);
    } catch (err) {
      next(err);
    }
  });

  router.delete('/:id', adminOnly, validateUuidParam('id'), async (req, res, next) => {
    try {
      await lotService.remove(req.params.id);
      res.status(204).send();
    } catch (err) {
      next(err);
    }
  });

  return router;
}
