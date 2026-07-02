import cors from 'cors';
import express, { type Express } from 'express';
import helmet from 'helmet';
import type { AnalyticsService } from '../application/analyticsService.js';
import { AuthService } from '../application/authService.js';
import type { CreateReservationService } from '../application/createReservation.js';
import type { LotService } from '../application/lotService.js';
import type { AdminUserRepository, ReservationRepository } from '../application/ports.js';
import { errorHandler } from './middleware/errorHandler.js';
import { createAdminAnalyticsRouter } from './routes/admin.js';
import { createAdminAuthRouter } from './routes/adminAuth.js';
import { createLotsRouter } from './routes/lots.js';
import { createReservationsRouter, type ReservationsRateLimitOptions } from './routes/reservations.js';

export interface AppDeps {
  lotService: LotService;
  createReservationService: CreateReservationService;
  reservationRepository: ReservationRepository;
  adminUserRepository: AdminUserRepository;
  analyticsService: AnalyticsService;
  jwtSecret: string;
  corsOrigins?: string[];
  /** Override for tests so the 10/min limiter doesn't throttle a fast test suite. */
  reservationRateLimit?: ReservationsRateLimitOptions;
}

export function createApp(deps: AppDeps): Express {
  const app = express();

  app.use(helmet());
  app.use(cors({ origin: deps.corsOrigins && deps.corsOrigins.length > 0 ? deps.corsOrigins : false }));
  app.use(express.json());

  app.get('/api/health', (_req, res) => {
    res.json({ ok: true });
  });

  const authService = new AuthService(deps.adminUserRepository, deps.jwtSecret);

  app.use('/api/admin/auth', createAdminAuthRouter(authService));
  app.use('/api/admin', createAdminAnalyticsRouter(deps.analyticsService, deps.jwtSecret));
  app.use('/api/lots', createLotsRouter(deps.lotService, deps.jwtSecret));
  app.use(
    '/api/reservations',
    createReservationsRouter(deps.createReservationService, deps.reservationRepository, deps.reservationRateLimit),
  );

  app.use(errorHandler);

  return app;
}
