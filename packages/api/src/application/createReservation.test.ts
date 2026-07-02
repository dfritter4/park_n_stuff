import { beforeEach, describe, expect, it } from 'vitest';
import type { CreateReservationRequest } from '@parking/shared';
import { CreateReservationService } from './createReservation.js';
import { calculateCostCents } from '../domain/pricing.js';
import { LotFullError, LotNotFoundError, LotNotReservableError, PaymentDeclinedError } from '../domain/errors.js';
import {
  FakeClock,
  FakePaymentGateway,
  FakeReservationUnitOfWork,
  InMemoryDatabase,
} from './testing/fakes.js';

function buildRequest(overrides: Partial<CreateReservationRequest> = {}, lotId: string): CreateReservationRequest {
  return {
    lotId,
    customer: { name: 'Jane Doe', email: 'jane@example.com', phone: '5551234567' },
    vehicle: { make: 'Honda', model: 'Civic', licensePlate: 'ABC123' },
    startTime: '2026-01-01T10:00:00.000Z',
    endTime: '2026-01-01T12:00:00.000Z',
    payment: {
      cardNumber: '4242424242424242',
      expiry: '12/30',
      cvc: '123',
      cardholderName: 'Jane Doe',
    },
    ...overrides,
  };
}

describe('CreateReservationService', () => {
  let db: InMemoryDatabase;

  beforeEach(() => {
    db = new InMemoryDatabase();
  });

  it('persists a reservation and payment, returning the reservation id on the happy path', async () => {
    const lot = db.seedLot({ capacity: 5, hourlyRateCents: 500, status: 'active' });
    const gateway = new FakePaymentGateway(true);
    const clock = new FakeClock(new Date('2026-01-01T00:00:00.000Z'));
    const service = new CreateReservationService(new FakeReservationUnitOfWork(db), gateway, clock);

    const result = await service.execute(buildRequest({}, lot.id));

    expect(result.reservationId).toBeTruthy();
    expect(db.reservations.size).toBe(1);
    const reservation = [...db.reservations.values()][0];
    expect(reservation.id).toBe(result.reservationId);
    expect(reservation.lotId).toBe(lot.id);
    expect(reservation.status).toBe('active');
    expect(reservation.reservationNumber).toMatch(/^LOT-\d{8}-[0-9A-Z]{5}$/);
    expect(db.payments).toHaveLength(1);
    expect(db.payments[0]?.status).toBe('succeeded');
    expect(db.payments[0]?.cardLast4).toBe('4242');
    expect(db.payments[0]?.reservationId).toBe(result.reservationId);
    expect(db.customers.size).toBe(1);
  });

  it('computes total cost using the domain pricing rules', async () => {
    const lot = db.seedLot({ capacity: 5, hourlyRateCents: 750, status: 'active' });
    const gateway = new FakePaymentGateway(true);
    const clock = new FakeClock();
    const service = new CreateReservationService(new FakeReservationUnitOfWork(db), gateway, clock);

    const startTime = '2026-01-01T10:00:00.000Z';
    const endTime = '2026-01-01T13:30:00.000Z';
    const result = await service.execute(buildRequest({ startTime, endTime }, lot.id));

    const expectedCost = calculateCostCents(750, new Date(startTime), new Date(endTime));
    const reservation = db.reservations.get(result.reservationId);
    expect(reservation?.totalCostCents).toBe(expectedCost);
    expect(db.payments[0]?.amountCents).toBe(expectedCost);
  });

  it('throws LotFullError and persists nothing when the lot is at capacity', async () => {
    const lot = db.seedLot({ capacity: 1, status: 'active' });
    db.reservations.set('existing', {
      id: 'existing',
      reservationNumber: 'LOT-20260101-AAAAA',
      lotId: lot.id,
      customerId: 'cust-1',
      vehicleMake: 'Toyota',
      vehicleModel: 'Corolla',
      licensePlate: 'XYZ999',
      startTime: new Date('2026-01-01T09:00:00.000Z'),
      endTime: new Date('2026-01-01T13:00:00.000Z'),
      totalCostCents: 500,
      status: 'active',
      createdAt: new Date(),
    });
    const gateway = new FakePaymentGateway(true);
    const service = new CreateReservationService(new FakeReservationUnitOfWork(db), gateway, new FakeClock());

    await expect(service.execute(buildRequest({}, lot.id))).rejects.toThrow(LotFullError);
    expect(db.reservations.size).toBe(1);
    expect(db.payments).toHaveLength(0);
    expect(db.customers.size).toBe(0);
    expect(gateway.calls).toHaveLength(0);
  });

  it('throws LotNotReservableError for a lot under maintenance', async () => {
    const lot = db.seedLot({ status: 'maintenance' });
    const gateway = new FakePaymentGateway(true);
    const service = new CreateReservationService(new FakeReservationUnitOfWork(db), gateway, new FakeClock());

    await expect(service.execute(buildRequest({}, lot.id))).rejects.toThrow(LotNotReservableError);
    expect(db.reservations.size).toBe(0);
    expect(db.payments).toHaveLength(0);
    expect(gateway.calls).toHaveLength(0);
  });

  it('throws PaymentDeclinedError and persists nothing when the charge is declined', async () => {
    const lot = db.seedLot({ capacity: 5, status: 'active' });
    const gateway = new FakePaymentGateway(false);
    const service = new CreateReservationService(new FakeReservationUnitOfWork(db), gateway, new FakeClock());

    await expect(service.execute(buildRequest({}, lot.id))).rejects.toThrow(PaymentDeclinedError);
    expect(db.reservations.size).toBe(0);
    expect(db.payments).toHaveLength(0);
    expect(db.customers.size).toBe(0);
  });

  it('throws LotNotFoundError for an unknown lot', async () => {
    const gateway = new FakePaymentGateway(true);
    const service = new CreateReservationService(new FakeReservationUnitOfWork(db), gateway, new FakeClock());

    await expect(service.execute(buildRequest({}, 'nonexistent-lot-id'))).rejects.toThrow(LotNotFoundError);
    expect(db.reservations.size).toBe(0);
    expect(gateway.calls).toHaveLength(0);
  });

  it('throws LotNotFoundError for a soft-deleted lot', async () => {
    const lot = db.seedLot({ status: 'deleted' });
    const gateway = new FakePaymentGateway(true);
    const service = new CreateReservationService(new FakeReservationUnitOfWork(db), gateway, new FakeClock());

    await expect(service.execute(buildRequest({}, lot.id))).rejects.toThrow(LotNotFoundError);
  });
});
