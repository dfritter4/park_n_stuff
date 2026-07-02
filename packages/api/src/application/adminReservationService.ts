import { randomUUID } from 'node:crypto';
import { effectiveCapacity } from '../domain/lot.js';
import { calculateWindowCostCents, type HourlyRateRule } from '../domain/pricing.js';
import { InvalidExtensionError, LotFullError, ReservationNotActiveError, ReservationNotFoundError } from '../domain/errors.js';
import type {
  AdminReservationDetailRecord,
  AdminReservationFilters,
  AdminReservationListItem,
  AdminReservationRepository,
  CurrentInLotRecord,
  Pagination,
  PricingRuleRecord,
  PricingRuleRepository,
} from './ports.js';

function toHourlyRateRule(rule: PricingRuleRecord): HourlyRateRule {
  return {
    dayType: rule.dayType,
    startHour: rule.startHour,
    endHour: rule.endHour,
    hourlyRateCents: rule.hourlyRateCents,
  };
}

/** Mock transaction id for admin-initiated payments (extend charges), mirroring MockPaymentGateway's `txn_` prefix without going through the customer-facing gateway. */
function generateMockTransactionId(): string {
  return `txn_ext_${randomUUID().replace(/-/g, '').slice(0, 16)}`;
}

export class AdminReservationService {
  constructor(
    private readonly repository: AdminReservationRepository,
    private readonly pricingRules: PricingRuleRepository,
  ) {}

  async list(
    filters: AdminReservationFilters,
    pagination: Pagination,
  ): Promise<{ rows: AdminReservationListItem[]; total: number }> {
    return this.repository.list(filters, pagination);
  }

  async getDetail(id: string): Promise<AdminReservationDetailRecord> {
    const detail = await this.repository.findDetailById(id);
    if (!detail) {
      throw new ReservationNotFoundError();
    }
    return detail;
  }

  async currentInLot(lotId: string, now: Date): Promise<CurrentInLotRecord[]> {
    return this.repository.listCurrentInLot(lotId, now);
  }

  async cancel(id: string): Promise<AdminReservationDetailRecord> {
    await this.repository.withTransaction(async (txn) => {
      const reservation = await txn.getReservationForUpdate(id);
      if (!reservation) {
        throw new ReservationNotFoundError();
      }
      if (reservation.status !== 'active') {
        throw new ReservationNotActiveError();
      }

      await txn.cancelReservation(id);
      await txn.refundSucceededPayments(id);
    });

    return this.getDetail(id);
  }

  async extend(id: string, newEndTime: Date): Promise<AdminReservationDetailRecord> {
    await this.repository.withTransaction(async (txn) => {
      const reservation = await txn.getReservationForUpdate(id);
      if (!reservation) {
        throw new ReservationNotFoundError();
      }
      if (reservation.status !== 'active') {
        throw new ReservationNotActiveError();
      }
      if (newEndTime <= reservation.endTime) {
        throw new InvalidExtensionError('newEndTime must be after the reservation’s current end time');
      }

      const lot = await txn.getLotForUpdate(reservation.lotId);
      if (!lot) {
        // A reservation's lot is never hard-deleted (only soft-deleted), so this
        // should be unreachable in practice; guarded defensively regardless.
        throw new ReservationNotFoundError('Reservation refers to an unknown lot');
      }

      // Capacity gate over the delta window [oldEnd, newEnd), mirroring
      // CreateReservationService's create-time gate exactly: effective
      // capacity (lot capacity minus overlapping overrides) compared against
      // other active reservations overlapping that window. The reservation
      // being extended is excluded from the overlap count since it's the
      // same booking continuing, not a competing one.
      const overrides = await txn.listActiveCapacityOverrides(reservation.lotId, reservation.endTime, newEndTime);
      const capacity = effectiveCapacity(lot.capacity, overrides, { start: reservation.endTime, end: newEndTime });
      const overlapping = await txn.countActiveOverlapping(reservation.lotId, reservation.endTime, newEndTime, id);
      if (overlapping >= capacity) {
        throw new LotFullError();
      }

      const rules = await this.pricingRules.listByLot(reservation.lotId);
      const deltaCostCents = calculateWindowCostCents(
        lot.hourlyRateCents,
        rules.map(toHourlyRateRule),
        reservation.endTime,
        newEndTime,
      );

      const cardLast4 = await txn.getOriginalCardLast4(id);

      await txn.extendReservation(id, newEndTime, reservation.totalCostCents + deltaCostCents);
      await txn.insertPayment({
        reservationId: id,
        amountCents: deltaCostCents,
        status: 'succeeded',
        transactionId: generateMockTransactionId(),
        cardLast4: cardLast4 ?? '',
      });
    });

    return this.getDetail(id);
  }
}
