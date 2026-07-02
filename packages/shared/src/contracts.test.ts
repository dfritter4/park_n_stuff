import { describe, it, expect } from 'vitest';
import {
  LotStatusSchema,
  LotSchema,
  CreateLotRequestSchema,
  UpdateLotRequestSchema,
  CreateReservationRequestSchema,
  ReservationStatusSchema,
  ReservationSchema,
  LoginRequestSchema,
  LoginResponseSchema,
  DashboardResponseSchema,
  AnalyticsResponseSchema,
  DayBreakdownResponseSchema,
  ErrorResponseSchema,
} from './contracts';

const validLot = {
  id: 'a2f4c1a0-1b2c-4d3e-8f4a-5b6c7d8e9f0a',
  name: 'Loop Garage',
  address: '1 W Adams St, Chicago, IL',
  neighborhood: 'Loop',
  lat: 41.879,
  lng: -87.63,
  capacity: 100,
  hourlyRateCents: 1200,
  status: 'active',
  availableSpaces: 42,
  createdAt: new Date().toISOString(),
};

const validCreateLot = {
  name: 'Loop Garage',
  address: '1 W Adams St, Chicago, IL',
  neighborhood: 'Loop',
  lat: 41.879,
  lng: -87.63,
  capacity: 100,
  hourlyRateCents: 1200,
};

const validCreateReservation = {
  lotId: 'a2f4c1a0-1b2c-4d3e-8f4a-5b6c7d8e9f0a',
  customer: { name: 'Jane Doe', email: 'jane@example.com', phone: '3125551234' },
  vehicle: { make: 'Toyota', model: 'Corolla', licensePlate: 'ABC1234' },
  startTime: '2026-07-02T10:00:00.000Z',
  endTime: '2026-07-02T12:00:00.000Z',
  payment: {
    cardNumber: '4242424242424242',
    expiry: '12/29',
    cvc: '123',
    cardholderName: 'Jane Doe',
  },
};

describe('LotSchema', () => {
  it('accepts a valid lot', () => {
    expect(LotSchema.safeParse(validLot).success).toBe(true);
  });

  it('rejects a lot with a non-uuid id', () => {
    expect(LotSchema.safeParse({ ...validLot, id: 'not-a-uuid' }).success).toBe(false);
  });

  it('rejects a lot with invalid status', () => {
    expect(LotSchema.safeParse({ ...validLot, status: 'bogus' }).success).toBe(false);
  });
});

describe('LotStatusSchema', () => {
  it('accepts active, maintenance, deleted', () => {
    for (const status of ['active', 'maintenance', 'deleted']) {
      expect(LotStatusSchema.safeParse(status).success).toBe(true);
    }
  });

  it('rejects unknown status values', () => {
    expect(LotStatusSchema.safeParse('closed').success).toBe(false);
  });
});

describe('CreateLotRequestSchema', () => {
  it('accepts a valid create-lot request', () => {
    expect(CreateLotRequestSchema.safeParse(validCreateLot).success).toBe(true);
  });

  it('rejects lot with zero capacity', () => {
    expect(CreateLotRequestSchema.safeParse({ ...validCreateLot, capacity: 0 }).success).toBe(false);
  });

  it('rejects lot with capacity over max', () => {
    expect(CreateLotRequestSchema.safeParse({ ...validCreateLot, capacity: 10001 }).success).toBe(false);
  });

  it('rejects lot with non-positive hourlyRateCents', () => {
    expect(CreateLotRequestSchema.safeParse({ ...validCreateLot, hourlyRateCents: 0 }).success).toBe(false);
  });

  it('rejects lot with hourlyRateCents over max', () => {
    expect(CreateLotRequestSchema.safeParse({ ...validCreateLot, hourlyRateCents: 100001 }).success).toBe(false);
  });

  it('rejects lot with out-of-range latitude', () => {
    expect(CreateLotRequestSchema.safeParse({ ...validCreateLot, lat: 91 }).success).toBe(false);
  });

  it('rejects lot with out-of-range longitude', () => {
    expect(CreateLotRequestSchema.safeParse({ ...validCreateLot, lng: -181 }).success).toBe(false);
  });

  it('rejects lot with empty name', () => {
    expect(CreateLotRequestSchema.safeParse({ ...validCreateLot, name: '' }).success).toBe(false);
  });
});

describe('UpdateLotRequestSchema', () => {
  it('accepts an empty partial update', () => {
    expect(UpdateLotRequestSchema.safeParse({}).success).toBe(true);
  });

  it('accepts a partial update with status', () => {
    expect(UpdateLotRequestSchema.safeParse({ status: 'maintenance' }).success).toBe(true);
  });

  it('rejects status of deleted (not allowed via update)', () => {
    expect(UpdateLotRequestSchema.safeParse({ status: 'deleted' }).success).toBe(false);
  });
});

describe('CreateReservationRequestSchema', () => {
  it('accepts a valid reservation request', () => {
    expect(CreateReservationRequestSchema.safeParse(validCreateReservation).success).toBe(true);
  });

  it('rejects reservation with invalid email', () => {
    const r = CreateReservationRequestSchema.safeParse({
      ...validCreateReservation,
      customer: { ...validCreateReservation.customer, email: 'nope' },
    });
    expect(r.success).toBe(false);
  });

  it('rejects reservation where endTime is before startTime', () => {
    const r = CreateReservationRequestSchema.safeParse({
      ...validCreateReservation,
      startTime: '2026-07-02T12:00:00.000Z',
      endTime: '2026-07-02T10:00:00.000Z',
    });
    expect(r.success).toBe(false);
  });

  it('rejects reservation with invalid card number', () => {
    const r = CreateReservationRequestSchema.safeParse({
      ...validCreateReservation,
      payment: { ...validCreateReservation.payment, cardNumber: '123' },
    });
    expect(r.success).toBe(false);
  });

  it('rejects reservation with invalid expiry format', () => {
    const r = CreateReservationRequestSchema.safeParse({
      ...validCreateReservation,
      payment: { ...validCreateReservation.payment, expiry: '13/29' },
    });
    expect(r.success).toBe(false);
  });

  it('rejects reservation with invalid cvc', () => {
    const r = CreateReservationRequestSchema.safeParse({
      ...validCreateReservation,
      payment: { ...validCreateReservation.payment, cvc: '12' },
    });
    expect(r.success).toBe(false);
  });

  it('rejects reservation with non-uuid lotId', () => {
    const r = CreateReservationRequestSchema.safeParse({ ...validCreateReservation, lotId: 'not-a-uuid' });
    expect(r.success).toBe(false);
  });
});

describe('ReservationStatusSchema', () => {
  it('accepts active, completed, cancelled', () => {
    for (const status of ['active', 'completed', 'cancelled']) {
      expect(ReservationStatusSchema.safeParse(status).success).toBe(true);
    }
  });
});

describe('ReservationSchema', () => {
  it('accepts a valid reservation', () => {
    const reservation = {
      id: 'a2f4c1a0-1b2c-4d3e-8f4a-5b6c7d8e9f0a',
      reservationNumber: 'RES-1001',
      lotId: 'a2f4c1a0-1b2c-4d3e-8f4a-5b6c7d8e9f0a',
      lotName: 'Loop Garage',
      lotAddress: '1 W Adams St, Chicago, IL',
      customerName: 'Jane Doe',
      vehicleMake: 'Toyota',
      vehicleModel: 'Corolla',
      licensePlate: 'ABC1234',
      startTime: '2026-07-02T10:00:00.000Z',
      endTime: '2026-07-02T12:00:00.000Z',
      totalCostCents: 2400,
      status: 'active',
      cardLast4: '4242',
      createdAt: new Date().toISOString(),
    };
    expect(ReservationSchema.safeParse(reservation).success).toBe(true);
  });
});

describe('LoginRequestSchema / LoginResponseSchema', () => {
  it('accepts a valid login request', () => {
    expect(LoginRequestSchema.safeParse({ email: 'admin@example.com', password: 'secret' }).success).toBe(true);
  });

  it('rejects login request with invalid email', () => {
    expect(LoginRequestSchema.safeParse({ email: 'nope', password: 'secret' }).success).toBe(false);
  });

  it('rejects login request with empty password', () => {
    expect(LoginRequestSchema.safeParse({ email: 'admin@example.com', password: '' }).success).toBe(false);
  });

  it('accepts a valid login response', () => {
    expect(LoginResponseSchema.safeParse({ token: 'jwt-token', expiresInSeconds: 3600 }).success).toBe(true);
  });
});

describe('DashboardResponseSchema', () => {
  it('accepts a valid dashboard response', () => {
    const dashboard = {
      revenueTodayCents: 50000,
      activeReservations: 12,
      averageOccupancyPct: 63.5,
      lots: [{ lotId: 'abc', name: 'Loop Garage', capacity: 100, occupied: 40, revenueTodayCents: 12000 }],
      recentReservations: [
        {
          reservationNumber: 'RES-1001',
          lotName: 'Loop Garage',
          startTime: '2026-07-02T10:00:00.000Z',
          endTime: '2026-07-02T12:00:00.000Z',
          totalCostCents: 2400,
          createdAt: new Date().toISOString(),
        },
      ],
    };
    expect(DashboardResponseSchema.safeParse(dashboard).success).toBe(true);
  });
});

describe('AnalyticsResponseSchema', () => {
  it('accepts a valid analytics response', () => {
    const analytics = {
      dailyRevenue: [{ date: '2026-07-01', revenueCents: 10000, reservations: 5 }],
      hourlyOccupancy: [{ date: '2026-07-01', hour: 9, occupancyPct: 45.2 }],
    };
    expect(AnalyticsResponseSchema.safeParse(analytics).success).toBe(true);
  });
});

describe('DayBreakdownResponseSchema', () => {
  it('accepts a valid day breakdown response', () => {
    const breakdown = {
      rows: [{ hour: 9, reservations: 3, revenueCents: 3600, occupancyPct: 30 }],
    };
    expect(DayBreakdownResponseSchema.safeParse(breakdown).success).toBe(true);
  });
});

describe('ErrorResponseSchema', () => {
  it('accepts a valid error response', () => {
    expect(
      ErrorResponseSchema.safeParse({ error: { code: 'NOT_FOUND', message: 'Lot not found' } }).success
    ).toBe(true);
  });

  it('accepts an error response with details', () => {
    expect(
      ErrorResponseSchema.safeParse({
        error: { code: 'VALIDATION_ERROR', message: 'Invalid input', details: { field: 'email' } },
      }).success
    ).toBe(true);
  });

  it('rejects an error response missing message', () => {
    expect(ErrorResponseSchema.safeParse({ error: { code: 'NOT_FOUND' } }).success).toBe(false);
  });
});
