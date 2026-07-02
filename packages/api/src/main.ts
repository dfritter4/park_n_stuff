import { AnalyticsService } from './application/analyticsService.js';
import { CreateReservationService } from './application/createReservation.js';
import { LotService } from './application/lotService.js';
import type { Clock } from './application/ports.js';
import { loadConfig } from './config.js';
import { createPool } from './infrastructure/db.js';
import { MockPaymentGateway } from './infrastructure/mockPaymentGateway.js';
import { PostgresAdminCustomerRepository } from './infrastructure/postgres/adminCustomerRepository.js';
import { PostgresAdminReservationRepository } from './infrastructure/postgres/adminReservationRepository.js';
import { PostgresAdminUserRepository } from './infrastructure/postgres/adminUserRepository.js';
import { PostgresAnalyticsRepository } from './infrastructure/postgres/analyticsRepository.js';
import { PostgresCapacityOverrideRepository } from './infrastructure/postgres/capacityOverrideRepository.js';
import { PostgresDeclinedAttemptRepository } from './infrastructure/postgres/declinedAttemptRepository.js';
import { PostgresLotRepository } from './infrastructure/postgres/lotRepository.js';
import { PostgresPricingRuleRepository } from './infrastructure/postgres/pricingRuleRepository.js';
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
const analyticsRepository = new PostgresAnalyticsRepository(pool);
const pricingRuleRepository = new PostgresPricingRuleRepository(pool);
const capacityOverrideRepository = new PostgresCapacityOverrideRepository(pool);
const declinedAttemptRepository = new PostgresDeclinedAttemptRepository(pool);
const adminCustomerRepository = new PostgresAdminCustomerRepository(pool);
const adminReservationRepository = new PostgresAdminReservationRepository(pool);
const paymentGateway = new MockPaymentGateway();

const lotService = new LotService(lotRepository, capacityOverrideRepository, pricingRuleRepository, systemClock);
const createReservationService = new CreateReservationService(
  reservationUnitOfWork,
  paymentGateway,
  systemClock,
  pricingRuleRepository,
  declinedAttemptRepository,
);
const analyticsService = new AnalyticsService(analyticsRepository);

const app = createApp({
  lotService,
  createReservationService,
  reservationRepository,
  adminUserRepository,
  analyticsService,
  jwtSecret: config.jwtSecret,
  corsOrigins: config.corsOrigins,
  lotRepository,
  pricingRuleRepository,
  capacityOverrideRepository,
  declinedAttemptRepository,
  adminCustomerRepository,
  adminReservationRepository,
  clock: systemClock,
});

app.listen(config.port, () => {
  console.log(`@parking/api listening on port ${config.port}`);
});
