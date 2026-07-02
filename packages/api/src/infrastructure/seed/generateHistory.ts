import { calculateWindowCostCents, type HourlyRateRule } from '../../domain/pricing.js';
import { generateReservationNumber } from '../../domain/reservationNumber.js';

const HISTORY_DAYS = 30;
const HOURS_PER_DAY = 24;
const MS_PER_HOUR = 60 * 60 * 1000;
const DURATIONS_HOURS = [1, 2, 4, 8] as const;
const CANCELLED_REFUND_RATE = 0.5;
const DECLINED_ATTEMPT_RATE = 0.025;

const PEAK_HOURS = new Set([8, 9, 12, 13, 17, 18]);
const PEAK_HOUR_WEIGHT = 3;
const OFF_PEAK_HOUR_WEIGHT = 1;
const WEEKEND_MULTIPLIER = 0.5;

// Neighborhoods within Chicago's central business district; every other
// neighborhood in the static lot list is treated as a residential/neighborhood lot.
const DOWNTOWN_NEIGHBORHOODS = new Set(['Loop', 'River North', 'West Loop']);
// Chosen so that base * PEAK_HOUR_WEIGHT lands within the brief's target peak
// utilization bands (70-90% downtown, 40-60% neighborhood).
const DOWNTOWN_BASE_UTILIZATION = 0.27;
const NEIGHBORHOOD_BASE_UTILIZATION = 0.167;

const CUSTOMER_COUNT = 30;
const COMPLETED_RATE = 0.92;

const MIN_ACTIVE_RESERVATIONS = 6;
const MAX_ACTIVE_RESERVATIONS = 12;

const VEHICLES: ReadonlyArray<{ make: string; model: string }> = [
  { make: 'Toyota', model: 'Camry' },
  { make: 'Honda', model: 'Civic' },
  { make: 'Ford', model: 'F-150' },
  { make: 'Chevrolet', model: 'Malibu' },
  { make: 'Nissan', model: 'Altima' },
  { make: 'Jeep', model: 'Grand Cherokee' },
  { make: 'BMW', model: '3 Series' },
  { make: 'Tesla', model: 'Model 3' },
  { make: 'Subaru', model: 'Outback' },
  { make: 'Hyundai', model: 'Elantra' },
];

const LICENSE_PLATE_LETTERS = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ';
const TRANSACTION_ID_ALPHABET = '0123456789abcdefghijklmnopqrstuvwxyz';
const TRANSACTION_ID_SUFFIX_LENGTH = 12;

export interface SeedLot {
  name: string;
  address: string;
  neighborhood: string;
  lat: number;
  lng: number;
  capacity: number;
  hourlyRateCents: number;
  rules?: HourlyRateRule[];
}

export interface SeedPayment {
  amountCents: number;
  cardLast4: string;
  transactionId: string;
  status: 'succeeded' | 'refunded';
}

export interface SeedDeclinedAttempt {
  lotIndex: number;
  amountCents: number;
  cardLast4: string;
  createdAt: Date;
}

export interface SeedHistory {
  reservations: SeedReservation[];
  declinedAttempts: SeedDeclinedAttempt[];
}

export interface SeedReservation {
  lotIndex: number;
  customerIndex: number;
  reservationNumber: string;
  vehicleMake: string;
  vehicleModel: string;
  licensePlate: string;
  startTime: Date;
  endTime: Date;
  totalCostCents: number;
  status: 'active' | 'completed' | 'cancelled';
  payment: SeedPayment;
}

function isDowntown(lot: SeedLot): boolean {
  return DOWNTOWN_NEIGHBORHOODS.has(lot.neighborhood);
}

function hourWeight(hourOfDay: number): number {
  return PEAK_HOURS.has(hourOfDay) ? PEAK_HOUR_WEIGHT : OFF_PEAK_HOUR_WEIGHT;
}

function isWeekend(dayOfWeek: number): boolean {
  return dayOfWeek === 0 || dayOfWeek === 6;
}

function targetOccupancy(lot: SeedLot, slotStart: Date): number {
  const baseUtilization = isDowntown(lot) ? DOWNTOWN_BASE_UTILIZATION : NEIGHBORHOOD_BASE_UTILIZATION;
  const weight = hourWeight(slotStart.getUTCHours());
  const weekendFactor = isWeekend(slotStart.getUTCDay()) ? WEEKEND_MULTIPLIER : 1;
  return Math.round(lot.capacity * baseUtilization * weight * weekendFactor);
}

function pickFrom<T>(random: () => number, items: readonly T[]): T {
  const index = Math.floor(random() * items.length) % items.length;
  return items[index];
}

function randomDigits(random: () => number, length: number): string {
  let digits = '';
  for (let i = 0; i < length; i++) {
    digits += Math.floor(random() * 10).toString();
  }
  return digits;
}

function randomLicensePlate(random: () => number): string {
  let letters = '';
  for (let i = 0; i < 3; i++) {
    letters += pickFrom(random, LICENSE_PLATE_LETTERS.split(''));
  }
  return `${letters}${randomDigits(random, 4)}`;
}

function randomTransactionId(random: () => number): string {
  let suffix = '';
  for (let i = 0; i < TRANSACTION_ID_SUFFIX_LENGTH; i++) {
    suffix += pickFrom(random, TRANSACTION_ID_ALPHABET.split(''));
  }
  return `txn_${suffix}`;
}

function nextReservationNumber(usedNumbers: Set<string>, at: Date, random: () => number): string {
  let candidate = generateReservationNumber(at, random);
  while (usedNumbers.has(candidate)) {
    candidate = generateReservationNumber(at, random);
  }
  usedNumbers.add(candidate);
  return candidate;
}

interface GenerationContext {
  usedReservationNumbers: Set<string>;
  customerCounter: number;
  random: () => number;
}

function buildReservation(
  ctx: GenerationContext,
  lot: SeedLot,
  lotIndex: number,
  startTime: Date,
  endTime: Date,
  status: SeedReservation['status'],
): SeedReservation {
  const totalCostCents = calculateWindowCostCents(lot.hourlyRateCents, lot.rules ?? [], startTime, endTime);
  const vehicle = pickFrom(ctx.random, VEHICLES);
  const customerIndex = ctx.customerCounter % CUSTOMER_COUNT;
  ctx.customerCounter += 1;
  const paymentStatus: SeedPayment['status'] =
    status === 'cancelled' && ctx.random() < CANCELLED_REFUND_RATE ? 'refunded' : 'succeeded';

  return {
    lotIndex,
    customerIndex,
    reservationNumber: nextReservationNumber(ctx.usedReservationNumbers, startTime, ctx.random),
    vehicleMake: vehicle.make,
    vehicleModel: vehicle.model,
    licensePlate: randomLicensePlate(ctx.random),
    startTime,
    endTime,
    totalCostCents,
    status,
    payment: {
      amountCents: totalCostCents,
      cardLast4: randomDigits(ctx.random, 4),
      transactionId: randomTransactionId(ctx.random),
      status: paymentStatus,
    },
  };
}

/**
 * Emits a declined_attempts row for ~DECLINED_ATTEMPT_RATE of the payment
 * attempts represented by `reservations`, reusing each sampled
 * reservation's lot and cost as the failed attempt's profile (same
 * hypothetical booking, different outcome) and its startTime as the
 * decline's timestamp so declines are spread across the history window the
 * same way reservations are.
 */
function generateDeclinedAttempts(ctx: GenerationContext, reservations: SeedReservation[]): SeedDeclinedAttempt[] {
  const declinedAttempts: SeedDeclinedAttempt[] = [];

  for (const reservation of reservations) {
    if (ctx.random() >= DECLINED_ATTEMPT_RATE) continue;
    declinedAttempts.push({
      lotIndex: reservation.lotIndex,
      amountCents: reservation.totalCostCents,
      cardLast4: randomDigits(ctx.random, 4),
      createdAt: reservation.startTime,
    });
  }

  return declinedAttempts;
}

function generateLotHistory(
  ctx: GenerationContext,
  lot: SeedLot,
  lotIndex: number,
  windowStart: Date,
  now: Date,
): SeedReservation[] {
  const reservations: SeedReservation[] = [];
  const occupancy = new Map<number, number>();
  const totalSlots = HISTORY_DAYS * HOURS_PER_DAY;

  for (let slot = 0; slot < totalSlots; slot++) {
    const slotStart = new Date(windowStart.getTime() + slot * MS_PER_HOUR);
    const target = targetOccupancy(lot, slotStart);
    const current = occupancy.get(slot) ?? 0;
    const need = Math.max(0, target - current);

    for (let i = 0; i < need; i++) {
      const validDurations = DURATIONS_HOURS.filter(
        (duration) => slotStart.getTime() + duration * MS_PER_HOUR <= now.getTime(),
      );
      if (validDurations.length === 0) break;

      const duration = pickFrom(ctx.random, validDurations);
      const spanSlots = Array.from({ length: duration }, (_, offset) => slot + offset);
      const fitsCapacity = spanSlots.every((s) => (occupancy.get(s) ?? 0) < lot.capacity);
      if (!fitsCapacity) continue;

      for (const s of spanSlots) {
        occupancy.set(s, (occupancy.get(s) ?? 0) + 1);
      }

      const endTime = new Date(slotStart.getTime() + duration * MS_PER_HOUR);
      const status: SeedReservation['status'] = ctx.random() < COMPLETED_RATE ? 'completed' : 'cancelled';
      reservations.push(buildReservation(ctx, lot, lotIndex, slotStart, endTime, status));
    }
  }

  return reservations;
}

function generateActiveReservations(ctx: GenerationContext, lots: SeedLot[], now: Date): SeedReservation[] {
  const reservations: SeedReservation[] = [];
  const count =
    MIN_ACTIVE_RESERVATIONS +
    Math.floor(ctx.random() * (MAX_ACTIVE_RESERVATIONS - MIN_ACTIVE_RESERVATIONS + 1));

  for (let i = 0; i < count; i++) {
    const lotIndex = Math.floor(ctx.random() * lots.length) % lots.length;
    const lot = lots[lotIndex];
    const duration = pickFrom(ctx.random, DURATIONS_HOURS);
    const offsetHours = ctx.random() * duration;
    const startTime = new Date(now.getTime() - offsetHours * MS_PER_HOUR);
    const endTime = new Date(startTime.getTime() + duration * MS_PER_HOUR);
    reservations.push(buildReservation(ctx, lot, lotIndex, startTime, endTime, 'active'));
  }

  return reservations;
}

/**
 * Pure generator for 30 days of realistic reservation history plus a handful of
 * currently-active reservations spanning `now`, along with a scattering of
 * declined_attempts rows. Deterministic for a given `lots`/`now`/`random`
 * triple so it can be unit tested without a database. Costs are priced via
 * `calculateWindowCostCents` against each lot's `rules`, so seeded totals
 * reflect any lot-specific pricing rules.
 */
export function generateHistory(lots: SeedLot[], now: Date, random: () => number = Math.random): SeedHistory {
  const windowStart = new Date(now.getTime() - HISTORY_DAYS * HOURS_PER_DAY * MS_PER_HOUR);
  const ctx: GenerationContext = { usedReservationNumbers: new Set(), customerCounter: 0, random };

  const reservations = lots.flatMap((lot, lotIndex) => generateLotHistory(ctx, lot, lotIndex, windowStart, now));
  reservations.push(...generateActiveReservations(ctx, lots, now));
  const declinedAttempts = generateDeclinedAttempts(ctx, reservations);

  return { reservations, declinedAttempts };
}
