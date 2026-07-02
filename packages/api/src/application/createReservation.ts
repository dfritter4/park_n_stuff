import type { CreateReservationRequest } from '@parking/shared';
import { effectiveCapacity, isReservable } from '../domain/lot.js';
import { calculateWindowCostCents, type HourlyRateRule } from '../domain/pricing.js';
import { generateReservationNumber } from '../domain/reservationNumber.js';
import { CustomerFlaggedError, LotFullError, LotNotFoundError, LotNotReservableError, PaymentDeclinedError } from '../domain/errors.js';
import type {
  Clock,
  DeclinedAttemptRepository,
  PaymentGateway,
  PricingRuleRecord,
  PricingRuleRepository,
  ReservationUnitOfWork,
} from './ports.js';

function toHourlyRateRule(rule: PricingRuleRecord): HourlyRateRule {
  return {
    dayType: rule.dayType,
    startHour: rule.startHour,
    endHour: rule.endHour,
    hourlyRateCents: rule.hourlyRateCents,
  };
}

export class CreateReservationService {
  constructor(
    private readonly uow: ReservationUnitOfWork,
    private readonly gateway: PaymentGateway,
    private readonly clock: Clock,
    private readonly pricingRules: PricingRuleRepository,
    private readonly declinedAttempts: DeclinedAttemptRepository,
  ) {}

  async execute(req: CreateReservationRequest): Promise<{ reservationId: string }> {
    const startTime = new Date(req.startTime);
    const endTime = new Date(req.endTime);

    // Captured from inside the transaction closure so the catch block below
    // can record a declined_attempts row with the actual quoted amount even
    // though the transaction that computed it has already rolled back.
    let quotedCostCents: number | undefined;

    try {
      const reservationId = await this.uow.execute(req.lotId, async (txn) => {
        const lot = await txn.getLotForUpdate(req.lotId);
        if (!lot || lot.status === 'deleted') {
          throw new LotNotFoundError();
        }
        if (!isReservable(lot.status)) {
          throw new LotNotReservableError();
        }

        // Capacity gate uses the requested [startTime, endTime) window: an
        // override overlapping any part of the requested window counts
        // fully against capacity for this reservation. Read via the same
        // client as the lot's FOR UPDATE lock (ReservationTxn extension) so
        // this stays inside the unit of work.
        const overrides = await txn.listActiveCapacityOverrides(req.lotId, startTime, endTime);
        const capacity = effectiveCapacity(lot.capacity, overrides, { start: startTime, end: endTime });

        const overlapping = await txn.countActiveOverlapping(req.lotId, startTime, endTime);
        if (overlapping >= capacity) {
          throw new LotFullError();
        }

        // Flagged-customer gate is checked before any cost is computed or
        // charged, per the plan's "checked before charging" requirement.
        const existingCustomer = await txn.findCustomerByEmail(req.customer.email);
        if (existingCustomer?.flagged) {
          throw new CustomerFlaggedError();
        }

        const rules = await this.pricingRules.listByLot(req.lotId);
        const totalCostCents = calculateWindowCostCents(
          lot.hourlyRateCents,
          rules.map(toHourlyRateRule),
          startTime,
          endTime,
        );
        quotedCostCents = totalCostCents;

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
    } catch (err) {
      if (err instanceof PaymentDeclinedError) {
        // Recorded after the transaction has rolled back, per the plan: the
        // decline itself must not be part of the reservation's transaction.
        // A failure here must never replace the original PaymentDeclinedError
        // that the caller needs to see, so it's swallowed and logged instead.
        try {
          await this.declinedAttempts.insert({
            lotId: req.lotId,
            amountCents: quotedCostCents ?? 0,
            cardLast4: req.payment.cardNumber.slice(-4),
          });
        } catch (insertErr) {
          console.error('Failed to record declined attempt', insertErr);
        }
      }
      throw err;
    }
  }
}
