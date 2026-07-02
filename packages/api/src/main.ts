import { CreateReservationService } from './application/createReservation.js';
import { LotService } from './application/lotService.js';
import type { Clock } from './application/ports.js';
import { loadConfig } from './config.js';
import { createPool } from './infrastructure/db.js';
import { MockPaymentGateway } from './infrastructure/mockPaymentGateway.js';
import { PostgresAdminUserRepository } from './infrastructure/postgres/adminUserRepository.js';
import { PostgresLotRepository } from './infrastructure/postgres/lotRepository.js';
import { PostgresReservationRepository } from './infrastructure/postgres/reservationRepository.js';
import { PostgresReservationUnitOfWork } from './infrastructure/postgres/reservationUnitOfWork.js';
import { createApp } from './presentation/app.js';

const systemClock: Clock = { now: () => new Date() };

const config = loadConfig();
const pool = createPool(config.databaseUrl);

const lotRepository = new PostgresLotRepository(pool);
const reservationUnitOfWork = new PostgresReservationUnitOfWork(pool);
const reservationRepository = new PostgresReservationRepository(pool);
const adminUserRepository = new PostgresAdminUserRepository(pool);
const paymentGateway = new MockPaymentGateway();

const lotService = new LotService(lotRepository);
const createReservationService = new CreateReservationService(reservationUnitOfWork, paymentGateway, systemClock);

const app = createApp({
  lotService,
  createReservationService,
  reservationRepository,
  adminUserRepository,
  jwtSecret: config.jwtSecret,
  corsOrigins: config.corsOrigins,
});

app.listen(config.port, () => {
  console.log(`@parking/api listening on port ${config.port}`);
});
