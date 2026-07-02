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
  PaymentStatusSchema,
  QuoteResponseSchema,
  AdminReservationSchema,
  AdminReservationDetailSchema,
  AdminReservationListResponseSchema,
  ExtendReservationRequestSchema,
  CurrentInLotResponseSchema,
  AdminCustomerSchema,
  AdminCustomerListResponseSchema,
  AdminCustomerDetailSchema,
  FlagCustomerRequestSchema,
  DayTypeSchema,
  PricingRuleSchema,
  CreatePricingRuleRequestSchema,
  CapacityOverrideSchema,
  CreateCapacityOverrideRequestSchema,
  HeatmapResponseSchema,
  WeeklyCompareResponseSchema,
  LotCompareResponseSchema,
  ForecastResponseSchema,
  DeclinesResponseSchema,
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

describe('PaymentStatusSchema', () => {
  it('accepts succeeded, declined, refunded', () => {
    for (const status of ['succeeded', 'declined', 'refunded']) {
      expect(PaymentStatusSchema.safeParse(status).success).toBe(true);
    }
  });

  it('rejects unknown status values', () => {
    expect(PaymentStatusSchema.safeParse('pending').success).toBe(false);
  });
});

describe('QuoteResponseSchema', () => {
  it('accepts a valid quote response', () => {
    expect(QuoteResponseSchema.safeParse({ totalCostCents: 2000, billedHours: 2 }).success).toBe(true);
  });

  it('rejects a negative totalCostCents', () => {
    expect(QuoteResponseSchema.safeParse({ totalCostCents: -100, billedHours: 2 }).success).toBe(false);
  });

  it('rejects a non-integer billedHours', () => {
    expect(QuoteResponseSchema.safeParse({ totalCostCents: 2000, billedHours: 1.5 }).success).toBe(false);
  });
});

const validAdminReservation = {
  id: 'a2f4c1a0-1b2c-4d3e-8f4a-5b6c7d8e9f0a',
  reservationNumber: 'RES-1001',
  lotId: 'a2f4c1a0-1b2c-4d3e-8f4a-5b6c7d8e9f0a',
  lotName: 'Loop Garage',
  customerName: 'Jane Doe',
  vehicleMake: 'Toyota',
  vehicleModel: 'Corolla',
  licensePlate: 'ABC1234',
  startTime: '2026-07-02T10:00:00.000Z',
  endTime: '2026-07-02T12:00:00.000Z',
  totalCostCents: 2400,
  status: 'active',
  createdAt: new Date().toISOString(),
};

describe('AdminReservationSchema', () => {
  it('accepts a valid admin reservation', () => {
    expect(AdminReservationSchema.safeParse(validAdminReservation).success).toBe(true);
  });

  it('rejects an admin reservation with an invalid status', () => {
    expect(AdminReservationSchema.safeParse({ ...validAdminReservation, status: 'bogus' }).success).toBe(false);
  });
});

describe('AdminReservationDetailSchema', () => {
  const validDetail = {
    ...validAdminReservation,
    customer: { name: 'Jane Doe', email: 'jane@example.com', phone: '3125551234', flagged: false },
    payments: [
      {
        amountCents: 2400,
        status: 'succeeded',
        transactionId: 'txn_1',
        cardLast4: '4242',
        createdAt: new Date().toISOString(),
      },
    ],
  };

  it('accepts a valid admin reservation detail', () => {
    expect(AdminReservationDetailSchema.safeParse(validDetail).success).toBe(true);
  });

  it('rejects a detail with an invalid customer email', () => {
    const invalid = { ...validDetail, customer: { ...validDetail.customer, email: 'nope' } };
    expect(AdminReservationDetailSchema.safeParse(invalid).success).toBe(false);
  });

  it('rejects a detail with an invalid payment status', () => {
    const invalid = { ...validDetail, payments: [{ ...validDetail.payments[0], status: 'pending' }] };
    expect(AdminReservationDetailSchema.safeParse(invalid).success).toBe(false);
  });
});

describe('AdminReservationListResponseSchema', () => {
  it('accepts a valid list response', () => {
    expect(
      AdminReservationListResponseSchema.safeParse({ rows: [validAdminReservation], total: 1 }).success,
    ).toBe(true);
  });

  it('rejects a list response with a negative total', () => {
    expect(AdminReservationListResponseSchema.safeParse({ rows: [], total: -1 }).success).toBe(false);
  });
});

describe('ExtendReservationRequestSchema', () => {
  it('accepts a valid extend request', () => {
    expect(
      ExtendReservationRequestSchema.safeParse({ newEndTime: '2026-07-02T14:00:00.000Z' }).success,
    ).toBe(true);
  });

  it('rejects a non-datetime newEndTime', () => {
    expect(ExtendReservationRequestSchema.safeParse({ newEndTime: 'not-a-date' }).success).toBe(false);
  });
});

describe('CurrentInLotResponseSchema', () => {
  it('accepts a valid current-in-lot response', () => {
    const rows = [
      {
        reservationNumber: 'RES-1001',
        licensePlate: 'ABC1234',
        vehicleMake: 'Toyota',
        vehicleModel: 'Corolla',
        customerName: 'Jane Doe',
        startTime: '2026-07-02T10:00:00.000Z',
        endTime: '2026-07-02T12:00:00.000Z',
      },
    ];
    expect(CurrentInLotResponseSchema.safeParse(rows).success).toBe(true);
  });

  it('rejects a non-array payload', () => {
    expect(CurrentInLotResponseSchema.safeParse({ rows: [] }).success).toBe(false);
  });
});

const validAdminCustomer = {
  id: 'a2f4c1a0-1b2c-4d3e-8f4a-5b6c7d8e9f0a',
  name: 'Jane Doe',
  email: 'jane@example.com',
  phone: '3125551234',
  flagged: false,
  flagReason: null,
  reservationCount: 3,
  lifetimeSpendCents: 9000,
};

describe('AdminCustomerSchema', () => {
  it('accepts a valid admin customer', () => {
    expect(AdminCustomerSchema.safeParse(validAdminCustomer).success).toBe(true);
  });

  it('accepts a flagged customer with a flagReason', () => {
    expect(
      AdminCustomerSchema.safeParse({ ...validAdminCustomer, flagged: true, flagReason: 'Chargeback risk' })
        .success,
    ).toBe(true);
  });

  it('rejects a negative lifetimeSpendCents', () => {
    expect(AdminCustomerSchema.safeParse({ ...validAdminCustomer, lifetimeSpendCents: -1 }).success).toBe(false);
  });
});

describe('AdminCustomerListResponseSchema', () => {
  it('accepts a valid list response', () => {
    expect(
      AdminCustomerListResponseSchema.safeParse({ rows: [validAdminCustomer], total: 1 }).success,
    ).toBe(true);
  });
});

describe('AdminCustomerDetailSchema', () => {
  it('accepts a valid customer detail with reservations', () => {
    expect(
      AdminCustomerDetailSchema.safeParse({ ...validAdminCustomer, reservations: [validAdminReservation] })
        .success,
    ).toBe(true);
  });

  it('rejects a customer detail with an invalid reservation', () => {
    expect(
      AdminCustomerDetailSchema.safeParse({
        ...validAdminCustomer,
        reservations: [{ ...validAdminReservation, status: 'bogus' }],
      }).success,
    ).toBe(false);
  });
});

describe('FlagCustomerRequestSchema', () => {
  it('accepts a valid flag request', () => {
    expect(FlagCustomerRequestSchema.safeParse({ reason: 'Chargeback risk' }).success).toBe(true);
  });

  it('rejects an empty reason', () => {
    expect(FlagCustomerRequestSchema.safeParse({ reason: '' }).success).toBe(false);
  });

  it('rejects a reason over 300 characters', () => {
    expect(FlagCustomerRequestSchema.safeParse({ reason: 'x'.repeat(301) }).success).toBe(false);
  });
});

describe('DayTypeSchema', () => {
  it('accepts weekday, weekend, all', () => {
    for (const dayType of ['weekday', 'weekend', 'all']) {
      expect(DayTypeSchema.safeParse(dayType).success).toBe(true);
    }
  });

  it('rejects an unknown dayType', () => {
    expect(DayTypeSchema.safeParse('holiday').success).toBe(false);
  });
});

const validPricingRule = {
  id: 'a2f4c1a0-1b2c-4d3e-8f4a-5b6c7d8e9f0a',
  lotId: 'a2f4c1a0-1b2c-4d3e-8f4a-5b6c7d8e9f0a',
  dayType: 'weekday',
  startHour: 7,
  endHour: 19,
  hourlyRateCents: 1500,
  createdAt: new Date().toISOString(),
};

describe('PricingRuleSchema', () => {
  it('accepts a valid pricing rule', () => {
    expect(PricingRuleSchema.safeParse(validPricingRule).success).toBe(true);
  });

  it('rejects a rule where endHour is not greater than startHour', () => {
    expect(PricingRuleSchema.safeParse({ ...validPricingRule, startHour: 10, endHour: 10 }).success).toBe(false);
  });

  it('rejects a rule with startHour out of range', () => {
    expect(PricingRuleSchema.safeParse({ ...validPricingRule, startHour: 24 }).success).toBe(false);
  });

  it('rejects a rule with a non-positive hourlyRateCents', () => {
    expect(PricingRuleSchema.safeParse({ ...validPricingRule, hourlyRateCents: 0 }).success).toBe(false);
  });
});

describe('CreatePricingRuleRequestSchema', () => {
  it('accepts a valid create-pricing-rule request', () => {
    expect(
      CreatePricingRuleRequestSchema.safeParse({
        dayType: 'weekend',
        startHour: 17,
        endHour: 24,
        hourlyRateCents: 1200,
      }).success,
    ).toBe(true);
  });

  it('rejects endHour <= startHour', () => {
    expect(
      CreatePricingRuleRequestSchema.safeParse({
        dayType: 'all',
        startHour: 12,
        endHour: 12,
        hourlyRateCents: 1000,
      }).success,
    ).toBe(false);
  });
});

const validCapacityOverride = {
  id: 'a2f4c1a0-1b2c-4d3e-8f4a-5b6c7d8e9f0a',
  lotId: 'a2f4c1a0-1b2c-4d3e-8f4a-5b6c7d8e9f0a',
  spacesClosed: 5,
  reason: 'Resurfacing',
  startsAt: '2026-07-02T00:00:00.000Z',
  endsAt: '2026-07-03T00:00:00.000Z',
  createdAt: new Date().toISOString(),
};

describe('CapacityOverrideSchema', () => {
  it('accepts a valid capacity override', () => {
    expect(CapacityOverrideSchema.safeParse(validCapacityOverride).success).toBe(true);
  });

  it('accepts a capacity override with a null endsAt (open-ended)', () => {
    expect(CapacityOverrideSchema.safeParse({ ...validCapacityOverride, endsAt: null }).success).toBe(true);
  });

  it('rejects a non-positive spacesClosed', () => {
    expect(CapacityOverrideSchema.safeParse({ ...validCapacityOverride, spacesClosed: 0 }).success).toBe(false);
  });
});

describe('CreateCapacityOverrideRequestSchema', () => {
  it('accepts a valid create-capacity-override request', () => {
    expect(
      CreateCapacityOverrideRequestSchema.safeParse({
        spacesClosed: 5,
        reason: 'Resurfacing',
        startsAt: '2026-07-02T00:00:00.000Z',
        endsAt: '2026-07-03T00:00:00.000Z',
      }).success,
    ).toBe(true);
  });

  it('accepts a request without endsAt (open-ended)', () => {
    expect(
      CreateCapacityOverrideRequestSchema.safeParse({
        spacesClosed: 5,
        reason: 'Resurfacing',
        startsAt: '2026-07-02T00:00:00.000Z',
      }).success,
    ).toBe(true);
  });

  it('rejects endsAt at/before startsAt', () => {
    expect(
      CreateCapacityOverrideRequestSchema.safeParse({
        spacesClosed: 5,
        reason: 'Resurfacing',
        startsAt: '2026-07-02T00:00:00.000Z',
        endsAt: '2026-07-01T00:00:00.000Z',
      }).success,
    ).toBe(false);
  });

  it('rejects spacesClosed <= 0', () => {
    expect(
      CreateCapacityOverrideRequestSchema.safeParse({
        spacesClosed: 0,
        reason: 'Resurfacing',
        startsAt: '2026-07-02T00:00:00.000Z',
      }).success,
    ).toBe(false);
  });
});

describe('HeatmapResponseSchema', () => {
  it('accepts a valid heatmap response', () => {
    expect(
      HeatmapResponseSchema.safeParse({ cells: [{ dow: 0, hour: 9, occupancyPct: 42.5 }] }).success,
    ).toBe(true);
  });

  it('rejects a cell with dow out of range', () => {
    expect(HeatmapResponseSchema.safeParse({ cells: [{ dow: 7, hour: 9, occupancyPct: 42.5 }] }).success).toBe(
      false,
    );
  });
});

describe('WeeklyCompareResponseSchema', () => {
  it('accepts a valid weekly-compare response', () => {
    const dayPoint = { date: '2026-07-01', revenueCents: 10000, reservations: 5 };
    expect(
      WeeklyCompareResponseSchema.safeParse({ thisWeek: [dayPoint], lastWeek: [dayPoint] }).success,
    ).toBe(true);
  });

  it('rejects a response missing lastWeek', () => {
    const dayPoint = { date: '2026-07-01', revenueCents: 10000, reservations: 5 };
    expect(WeeklyCompareResponseSchema.safeParse({ thisWeek: [dayPoint] }).success).toBe(false);
  });
});

describe('LotCompareResponseSchema', () => {
  it('accepts a valid lot-compare response', () => {
    const row = { lotId: 'abc', name: 'Loop Garage', revenueCents: 10000, reservations: 5, avgOccupancyPct: 60 };
    expect(LotCompareResponseSchema.safeParse({ rows: [row] }).success).toBe(true);
  });
});

describe('ForecastResponseSchema', () => {
  it('accepts a valid forecast response', () => {
    const point = { date: '2026-07-09', hour: 14, projectedOccupancyPct: 55.2 };
    expect(ForecastResponseSchema.safeParse({ points: [point] }).success).toBe(true);
  });

  it('rejects a point with hour out of range', () => {
    const point = { date: '2026-07-09', hour: 24, projectedOccupancyPct: 55.2 };
    expect(ForecastResponseSchema.safeParse({ points: [point] }).success).toBe(false);
  });
});

describe('DeclinesResponseSchema', () => {
  it('accepts a valid declines response', () => {
    const declines = {
      total: 3,
      byDay: [{ date: '2026-07-01', count: 1, amountCents: 1200 }],
      recent: [
        { lotName: 'Loop Garage', amountCents: 1200, cardLast4: '0002', createdAt: new Date().toISOString() },
      ],
    };
    expect(DeclinesResponseSchema.safeParse(declines).success).toBe(true);
  });

  it('rejects a negative total', () => {
    expect(
      DeclinesResponseSchema.safeParse({ total: -1, byDay: [], recent: [] }).success,
    ).toBe(false);
  });
});
