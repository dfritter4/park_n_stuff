import { z } from 'zod';

export const LotStatusSchema = z.enum(['active', 'maintenance', 'deleted']);
export type LotStatus = z.infer<typeof LotStatusSchema>;

export const LotSchema = z.object({
  id: z.string().uuid(),
  name: z.string(),
  address: z.string(),
  neighborhood: z.string(),
  lat: z.number(),
  lng: z.number(),
  capacity: z.number().int().positive(),
  hourlyRateCents: z.number().int().positive(),
  status: LotStatusSchema,
  availableSpaces: z.number().int().min(0),
  createdAt: z.string(),
});
export type Lot = z.infer<typeof LotSchema>;

export const CreateLotRequestSchema = z.object({
  name: z.string().min(1).max(120),
  address: z.string().min(1).max(300),
  neighborhood: z.string().min(1).max(80),
  lat: z.number().min(-90).max(90),
  lng: z.number().min(-180).max(180),
  capacity: z.number().int().positive().max(10000),
  hourlyRateCents: z.number().int().positive().max(100000),
});
export type CreateLotRequest = z.infer<typeof CreateLotRequestSchema>;

export const UpdateLotRequestSchema = CreateLotRequestSchema.partial().extend({
  status: z.enum(['active', 'maintenance']).optional(),
});
export type UpdateLotRequest = z.infer<typeof UpdateLotRequestSchema>;

export const CreateReservationRequestSchema = z
  .object({
    lotId: z.string().uuid(),
    customer: z.object({
      name: z.string().min(1).max(120),
      email: z.string().email(),
      phone: z.string().min(7).max(20),
    }),
    vehicle: z.object({
      make: z.string().min(1).max(60),
      model: z.string().min(1).max(60),
      licensePlate: z.string().min(2).max(12),
    }),
    startTime: z.string().datetime(),
    endTime: z.string().datetime(),
    payment: z.object({
      cardNumber: z.string().regex(/^\d{13,19}$/),
      expiry: z.string().regex(/^(0[1-9]|1[0-2])\/\d{2}$/),
      cvc: z.string().regex(/^\d{3,4}$/),
      cardholderName: z.string().min(1),
    }),
  })
  .refine((d) => new Date(d.endTime) > new Date(d.startTime), {
    message: 'endTime must be after startTime',
  });
export type CreateReservationRequest = z.infer<typeof CreateReservationRequestSchema>;

export const ReservationStatusSchema = z.enum(['active', 'completed', 'cancelled']);
export type ReservationStatus = z.infer<typeof ReservationStatusSchema>;

export const ReservationSchema = z.object({
  id: z.string().uuid(),
  reservationNumber: z.string(),
  lotId: z.string().uuid(),
  lotName: z.string(),
  lotAddress: z.string(),
  customerName: z.string(),
  vehicleMake: z.string(),
  vehicleModel: z.string(),
  licensePlate: z.string(),
  startTime: z.string(),
  endTime: z.string(),
  totalCostCents: z.number().int(),
  status: ReservationStatusSchema,
  cardLast4: z.string(),
  createdAt: z.string(),
});
export type Reservation = z.infer<typeof ReservationSchema>;

export const LoginRequestSchema = z.object({
  email: z.string().email(),
  password: z.string().min(1),
});
export type LoginRequest = z.infer<typeof LoginRequestSchema>;

export const LoginResponseSchema = z.object({
  token: z.string(),
  expiresInSeconds: z.number(),
});
export type LoginResponse = z.infer<typeof LoginResponseSchema>;

export const DashboardResponseSchema = z.object({
  revenueTodayCents: z.number().int(),
  activeReservations: z.number().int(),
  averageOccupancyPct: z.number(),
  lots: z.array(
    z.object({
      lotId: z.string(),
      name: z.string(),
      capacity: z.number(),
      occupied: z.number(),
      revenueTodayCents: z.number(),
    }),
  ),
  recentReservations: z.array(
    z.object({
      reservationNumber: z.string(),
      lotName: z.string(),
      startTime: z.string(),
      endTime: z.string(),
      totalCostCents: z.number(),
      createdAt: z.string(),
    }),
  ),
});
export type DashboardResponse = z.infer<typeof DashboardResponseSchema>;

export const AnalyticsResponseSchema = z.object({
  dailyRevenue: z.array(
    z.object({
      date: z.string(),
      revenueCents: z.number().int(),
      reservations: z.number().int(),
    }),
  ),
  hourlyOccupancy: z.array(
    z.object({
      date: z.string(),
      hour: z.number().int(),
      occupancyPct: z.number(),
    }),
  ),
});
export type AnalyticsResponse = z.infer<typeof AnalyticsResponseSchema>;

export const DayBreakdownResponseSchema = z.object({
  rows: z.array(
    z.object({
      hour: z.number().int(),
      reservations: z.number().int(),
      revenueCents: z.number().int(),
      occupancyPct: z.number(),
    }),
  ),
});
export type DayBreakdownResponse = z.infer<typeof DayBreakdownResponseSchema>;

export const ErrorResponseSchema = z.object({
  error: z.object({
    code: z.string(),
    message: z.string(),
    details: z.unknown().optional(),
  }),
});
export type ErrorResponse = z.infer<typeof ErrorResponseSchema>;

export const PaymentStatusSchema = z.enum(['succeeded', 'declined', 'refunded']);
export type PaymentStatus = z.infer<typeof PaymentStatusSchema>;

export const QuoteResponseSchema = z.object({
  totalCostCents: z.number().int().positive(),
  billedHours: z.number().int().positive(),
});
export type QuoteResponse = z.infer<typeof QuoteResponseSchema>;

export const AdminReservationSchema = z.object({
  id: z.string().uuid(),
  reservationNumber: z.string(),
  lotId: z.string().uuid(),
  lotName: z.string(),
  customerName: z.string(),
  vehicleMake: z.string(),
  vehicleModel: z.string(),
  licensePlate: z.string(),
  startTime: z.string(),
  endTime: z.string(),
  totalCostCents: z.number().int(),
  status: ReservationStatusSchema,
  createdAt: z.string(),
});
export type AdminReservation = z.infer<typeof AdminReservationSchema>;

/**
 * AdminReservationDetailSchema also doubles as the response shape for
 * POST /api/admin/reservations/:id/cancel and .../extend — both return the
 * refreshed detail rather than a bespoke response schema.
 */
export const AdminReservationDetailSchema = AdminReservationSchema.extend({
  customer: z.object({
    name: z.string(),
    email: z.string().email(),
    phone: z.string(),
    flagged: z.boolean(),
  }),
  payments: z.array(
    z.object({
      amountCents: z.number().int(),
      status: PaymentStatusSchema,
      transactionId: z.string(),
      cardLast4: z.string(),
      createdAt: z.string(),
    }),
  ),
});
export type AdminReservationDetail = z.infer<typeof AdminReservationDetailSchema>;

export const AdminReservationListResponseSchema = z.object({
  rows: z.array(AdminReservationSchema),
  total: z.number().int().min(0),
});
export type AdminReservationListResponse = z.infer<typeof AdminReservationListResponseSchema>;

export const ExtendReservationRequestSchema = z.object({
  newEndTime: z.string().datetime(),
});
export type ExtendReservationRequest = z.infer<typeof ExtendReservationRequestSchema>;

export const CurrentInLotResponseSchema = z.array(
  z.object({
    reservationNumber: z.string(),
    licensePlate: z.string(),
    vehicleMake: z.string(),
    vehicleModel: z.string(),
    customerName: z.string(),
    startTime: z.string(),
    endTime: z.string(),
  }),
);
export type CurrentInLotResponse = z.infer<typeof CurrentInLotResponseSchema>;

export const AdminCustomerSchema = z.object({
  id: z.string().uuid(),
  name: z.string(),
  email: z.string().email(),
  phone: z.string(),
  flagged: z.boolean(),
  flagReason: z.string().nullable(),
  reservationCount: z.number().int().min(0),
  lifetimeSpendCents: z.number().int().min(0),
});
export type AdminCustomer = z.infer<typeof AdminCustomerSchema>;

export const AdminCustomerListResponseSchema = z.object({
  rows: z.array(AdminCustomerSchema),
  total: z.number().int().min(0),
});
export type AdminCustomerListResponse = z.infer<typeof AdminCustomerListResponseSchema>;

export const AdminCustomerDetailSchema = AdminCustomerSchema.extend({
  reservations: z.array(AdminReservationSchema),
});
export type AdminCustomerDetail = z.infer<typeof AdminCustomerDetailSchema>;

export const FlagCustomerRequestSchema = z.object({
  reason: z.string().min(1).max(300),
});
export type FlagCustomerRequest = z.infer<typeof FlagCustomerRequestSchema>;

export const DayTypeSchema = z.enum(['weekday', 'weekend', 'all']);
export type DayType = z.infer<typeof DayTypeSchema>;

export const PricingRuleSchema = z
  .object({
    id: z.string().uuid(),
    lotId: z.string().uuid(),
    dayType: DayTypeSchema,
    startHour: z.number().int().min(0).max(23),
    endHour: z.number().int().min(1).max(24),
    hourlyRateCents: z.number().int().positive(),
    createdAt: z.string(),
  })
  .refine((d) => d.endHour > d.startHour, { message: 'endHour must be greater than startHour' });
export type PricingRule = z.infer<typeof PricingRuleSchema>;

export const CreatePricingRuleRequestSchema = z
  .object({
    dayType: DayTypeSchema,
    startHour: z.number().int().min(0).max(23),
    endHour: z.number().int().min(1).max(24),
    hourlyRateCents: z.number().int().positive(),
  })
  .refine((d) => d.endHour > d.startHour, { message: 'endHour must be greater than startHour' });
export type CreatePricingRuleRequest = z.infer<typeof CreatePricingRuleRequestSchema>;

export const CapacityOverrideSchema = z.object({
  id: z.string().uuid(),
  lotId: z.string().uuid(),
  spacesClosed: z.number().int().positive(),
  reason: z.string(),
  startsAt: z.string(),
  endsAt: z.string().nullable(),
  createdAt: z.string(),
});
export type CapacityOverride = z.infer<typeof CapacityOverrideSchema>;

export const CreateCapacityOverrideRequestSchema = z
  .object({
    spacesClosed: z.number().int().positive(),
    reason: z.string().min(1).max(300),
    startsAt: z.string().datetime(),
    endsAt: z.string().datetime().optional(),
  })
  .refine((d) => d.endsAt === undefined || new Date(d.endsAt) > new Date(d.startsAt), {
    message: 'endsAt must be after startsAt',
  });
export type CreateCapacityOverrideRequest = z.infer<typeof CreateCapacityOverrideRequestSchema>;

export const HeatmapResponseSchema = z.object({
  cells: z.array(
    z.object({
      dow: z.number().int().min(0).max(6),
      hour: z.number().int().min(0).max(23),
      occupancyPct: z.number(),
    }),
  ),
});
export type HeatmapResponse = z.infer<typeof HeatmapResponseSchema>;

const DayPointSchema = z.object({
  date: z.string(),
  revenueCents: z.number().int(),
  reservations: z.number().int(),
});

export const WeeklyCompareResponseSchema = z.object({
  thisWeek: z.array(DayPointSchema),
  lastWeek: z.array(DayPointSchema),
});
export type WeeklyCompareResponse = z.infer<typeof WeeklyCompareResponseSchema>;

export const LotCompareResponseSchema = z.object({
  rows: z.array(
    z.object({
      lotId: z.string(),
      name: z.string(),
      revenueCents: z.number().int(),
      reservations: z.number().int(),
      avgOccupancyPct: z.number(),
    }),
  ),
});
export type LotCompareResponse = z.infer<typeof LotCompareResponseSchema>;

export const ForecastResponseSchema = z.object({
  points: z.array(
    z.object({
      date: z.string(),
      hour: z.number().int().min(0).max(23),
      projectedOccupancyPct: z.number(),
    }),
  ),
});
export type ForecastResponse = z.infer<typeof ForecastResponseSchema>;

export const DeclinesResponseSchema = z.object({
  total: z.number().int().min(0),
  byDay: z.array(
    z.object({
      date: z.string(),
      count: z.number().int().min(0),
      amountCents: z.number().int().min(0),
    }),
  ),
  recent: z.array(
    z.object({
      lotName: z.string(),
      amountCents: z.number().int().min(0),
      cardLast4: z.string(),
      createdAt: z.string(),
    }),
  ),
});
export type DeclinesResponse = z.infer<typeof DeclinesResponseSchema>;
