import { Router } from 'express';
import rateLimit, { type Options as RateLimitOptions } from 'express-rate-limit';
import { CreateReservationRequestSchema, type Reservation } from '@parking/shared';
import type { CreateReservationService } from '../../application/createReservation.js';
import type { ReservationRecord, ReservationRepository } from '../../application/ports.js';
import { ReservationNotFoundError } from '../../domain/errors.js';
import { validateBody, validateUuidParam } from '../middleware/validate.js';

const DEFAULT_RATE_LIMIT_WINDOW_MS = 60_000;
const DEFAULT_RATE_LIMIT_MAX = 10;

export interface ReservationsRateLimitOptions {
  windowMs?: number;
  max?: number;
}

type ReservationDetails = ReservationRecord & {
  lotName: string;
  lotAddress: string;
  customerName: string;
  cardLast4: string;
};

function toReservationResponse(details: ReservationDetails): Reservation {
  return {
    id: details.id,
    reservationNumber: details.reservationNumber,
    lotId: details.lotId,
    lotName: details.lotName,
    lotAddress: details.lotAddress,
    customerName: details.customerName,
    vehicleMake: details.vehicleMake,
    vehicleModel: details.vehicleModel,
    licensePlate: details.licensePlate,
    startTime: details.startTime.toISOString(),
    endTime: details.endTime.toISOString(),
    totalCostCents: details.totalCostCents,
    status: details.status,
    cardLast4: details.cardLast4,
    createdAt: details.createdAt.toISOString(),
  };
}

async function findReservationOrThrow(
  reservationRepository: ReservationRepository,
  id: string,
): Promise<ReservationDetails> {
  const details = await reservationRepository.findByIdWithDetails(id);
  if (!details) {
    throw new ReservationNotFoundError();
  }
  return details;
}

export function createReservationsRouter(
  createReservationService: CreateReservationService,
  reservationRepository: ReservationRepository,
  rateLimitOptions: ReservationsRateLimitOptions = {},
): Router {
  const router = Router();

  const limiter = rateLimit({
    windowMs: rateLimitOptions.windowMs ?? DEFAULT_RATE_LIMIT_WINDOW_MS,
    limit: rateLimitOptions.max ?? DEFAULT_RATE_LIMIT_MAX,
    standardHeaders: true,
    legacyHeaders: false,
    handler: (_req, res) => {
      res.status(429).json({
        error: { code: 'RATE_LIMITED', message: 'Too many reservation requests. Please try again later.' },
      });
    },
  } satisfies Partial<RateLimitOptions>);

  router.post('/', limiter, validateBody(CreateReservationRequestSchema), async (req, res, next) => {
    try {
      const { reservationId } = await createReservationService.execute(req.body);
      const details = await findReservationOrThrow(reservationRepository, reservationId);
      res.status(201).json(toReservationResponse(details));
    } catch (err) {
      next(err);
    }
  });

  router.get('/:id', validateUuidParam('id'), async (req, res, next) => {
    try {
      const details = await findReservationOrThrow(reservationRepository, req.params.id);
      res.json(toReservationResponse(details));
    } catch (err) {
      next(err);
    }
  });

  return router;
}
