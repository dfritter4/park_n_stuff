import type { CreateReservationRequest } from '@parking/shared';
import { isReservable } from '../domain/lot.js';
import { calculateCostCents } from '../domain/pricing.js';
import { generateReservationNumber } from '../domain/reservationNumber.js';
import { LotFullError, LotNotFoundError, LotNotReservableError, PaymentDeclinedError } from '../domain/errors.js';
import type { Clock, PaymentGateway, ReservationUnitOfWork } from './ports.js';

export class CreateReservationService {
  constructor(
    private readonly uow: ReservationUnitOfWork,
    private readonly gateway: PaymentGateway,
    private readonly clock: Clock,
  ) {}

  async execute(req: CreateReservationRequest): Promise<{ reservationId: string }> {
    const startTime = new Date(req.startTime);
    const endTime = new Date(req.endTime);

    const reservationId = await this.uow.execute(req.lotId, async (txn) => {
      const lot = await txn.getLotForUpdate(req.lotId);
      if (!lot || lot.status === 'deleted') {
        throw new LotNotFoundError();
      }
      if (!isReservable(lot.status)) {
        throw new LotNotReservableError();
      }

      const overlapping = await txn.countActiveOverlapping(req.lotId, startTime, endTime);
      if (overlapping >= lot.capacity) {
        throw new LotFullError();
      }

      const totalCostCents = calculateCostCents(lot.hourlyRateCents, startTime, endTime);

      const chargeResult = await this.gateway.charge({
        cardNumber: req.payment.cardNumber,
        amountCents: totalCostCents,
      });
      if (!chargeResult.success) {
        throw new PaymentDeclinedError();
      }

      const customer = await txn.upsertCustomer({
        name: req.customer.name,
        email: req.customer.email,
        phone: req.customer.phone,
      });

      const reservation = await txn.insertReservation({
        reservationNumber: generateReservationNumber(this.clock.now()),
        lotId: req.lotId,
        customerId: customer.id,
        vehicleMake: req.vehicle.make,
        vehicleModel: req.vehicle.model,
        licensePlate: req.vehicle.licensePlate,
        startTime,
        endTime,
        totalCostCents,
        status: 'active',
      });

      await txn.insertPayment({
        reservationId: reservation.id,
        amountCents: totalCostCents,
        status: 'succeeded',
        transactionId: chargeResult.transactionId,
        cardLast4: req.payment.cardNumber.slice(-4),
      });

      return reservation.id;
    });

    return { reservationId };
  }
}
