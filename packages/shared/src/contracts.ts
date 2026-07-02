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
