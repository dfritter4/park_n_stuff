import { describe, expect, it } from 'vitest';
import { calculateWindowCostCents } from '../../domain/pricing.js';
import { createMulberry32 } from './mulberry32.js';
import { generateHistory, type SeedLot } from './generateHistory.js';

const DOWNTOWN_LOT: SeedLot = {
  name: 'Loop Premier Garage',
  address: '200 W Madison St, Chicago, IL',
  neighborhood: 'Loop',
  lat: 41.879,
  lng: -87.6298,
  capacity: 250,
  hourlyRateCents: 1200,
};

const NEIGHBORHOOD_LOT: SeedLot = {
  name: 'Wicker Park Lot',
  address: '1500 N Milwaukee Ave, Chicago, IL',
  neighborhood: 'Wicker Park',
  lat: 41.9088,
  lng: -87.6796,
  capacity: 80,
  hourlyRateCents: 500,
};

const RULED_LOT: SeedLot = {
  name: 'Loop Premier Garage (Ruled)',
  address: '200 W Madison St, Chicago, IL',
  neighborhood: 'Loop',
  lat: 41.879,
  lng: -87.6298,
  capacity: 250,
  hourlyRateCents: 1200,
  rules: [{ dayType: 'weekday', startHour: 7, endHour: 19, hourlyRateCents: 1500 }],
};

const FIXTURE_LOTS: SeedLot[] = [DOWNTOWN_LOT, NEIGHBORHOOD_LOT];
const NOW = new Date('2026-07-02T15:00:00.000Z');
const PEAK_HOURS = new Set([8, 9, 12, 13, 17, 18]);
const HISTORY_WINDOW_MS = 30 * 24 * 60 * 60 * 1000;
const HOUR_MS = 60 * 60 * 1000;

describe('generateHistory', () => {
  it('places every reservation within the past 30 days of `now`', () => {
    const { reservations } = generateHistory(FIXTURE_LOTS, NOW, createMulberry32(42));
    const windowStart = new Date(NOW.getTime() - HISTORY_WINDOW_MS);

    expect(reservations.length).toBeGreaterThan(0);
    for (const reservation of reservations) {
      expect(reservation.startTime.getTime()).toBeGreaterThanOrEqual(windowStart.getTime());
      expect(reservation.startTime.getTime()).toBeLessThanOrEqual(NOW.getTime());
    }
  });

  it('generates more reservations in peak hours than off-peak hours for a downtown lot', () => {
    const { reservations } = generateHistory(FIXTURE_LOTS, NOW, createMulberry32(7));
    const downtownLotIndex = FIXTURE_LOTS.indexOf(DOWNTOWN_LOT);
    const downtownReservations = reservations.filter((reservation) => reservation.lotIndex === downtownLotIndex);

    const peakCount = downtownReservations.filter((reservation) => PEAK_HOURS.has(reservation.startTime.getUTCHours())).length;
    const offPeakCount = downtownReservations.length - peakCount;

    expect(peakCount).toBeGreaterThan(offPeakCount);
  });

  it('never schedules more concurrent reservations at a lot than its capacity', () => {
    const { reservations } = generateHistory(FIXTURE_LOTS, NOW, createMulberry32(99));
    const occupancyByLotHour = new Map<string, number>();

    for (const reservation of reservations) {
      for (let cursor = reservation.startTime.getTime(); cursor < reservation.endTime.getTime(); cursor += HOUR_MS) {
        const key = `${reservation.lotIndex}|${cursor}`;
        occupancyByLotHour.set(key, (occupancyByLotHour.get(key) ?? 0) + 1);
      }
    }

    for (const [key, count] of occupancyByLotHour) {
      const lotIndex = Number(key.split('|')[0]);
      expect(count).toBeLessThanOrEqual(FIXTURE_LOTS[lotIndex].capacity);
    }
  });

  it('is deterministic when given the same seeded random source', () => {
    const first = generateHistory(FIXTURE_LOTS, NOW, createMulberry32(123));
    const second = generateHistory(FIXTURE_LOTS, NOW, createMulberry32(123));

    expect(first).toEqual(second);
  });

  it('prices every reservation for a ruled lot via calculateWindowCostCents against that lot\'s rules', () => {
    const { reservations } = generateHistory([RULED_LOT], NOW, createMulberry32(11));
    expect(reservations.length).toBeGreaterThan(0);

    for (const reservation of reservations) {
      const expectedCost = calculateWindowCostCents(
        RULED_LOT.hourlyRateCents,
        RULED_LOT.rules ?? [],
        reservation.startTime,
        reservation.endTime,
      );
      expect(reservation.totalCostCents).toBe(expectedCost);
      expect(reservation.payment.amountCents).toBe(expectedCost);
    }

    const weekdayDaytimeReservation = reservations.find(
      (r) => r.startTime.getUTCDay() !== 0 && r.startTime.getUTCDay() !== 6 && r.startTime.getUTCHours() >= 7 && r.startTime.getUTCHours() < 19,
    );
    expect(weekdayDaytimeReservation).toBeDefined();
    const flatRateCost =
      Math.max(1, Math.ceil((weekdayDaytimeReservation!.endTime.getTime() - weekdayDaytimeReservation!.startTime.getTime()) / (60 * 60 * 1000))) *
      RULED_LOT.hourlyRateCents;
    expect(weekdayDaytimeReservation!.totalCostCents).toBeGreaterThan(flatRateCost);
  });

  it('marks roughly half of cancelled reservations as refunded', () => {
    const { reservations } = generateHistory(FIXTURE_LOTS, NOW, createMulberry32(321));
    const cancelled = reservations.filter((r) => r.status === 'cancelled');
    const refunded = cancelled.filter((r) => r.payment.status === 'refunded');

    expect(cancelled.length).toBeGreaterThan(20);
    const refundRate = refunded.length / cancelled.length;
    expect(refundRate).toBeGreaterThan(0.35);
    expect(refundRate).toBeLessThan(0.65);

    for (const reservation of reservations) {
      if (reservation.status !== 'cancelled') {
        expect(reservation.payment.status).toBe('succeeded');
      }
    }
  });

  it('emits declined_attempts rows spread across the history window at roughly 2-3% of payment attempts', () => {
    const { reservations, declinedAttempts } = generateHistory(FIXTURE_LOTS, NOW, createMulberry32(55));
    const windowStart = new Date(NOW.getTime() - HISTORY_WINDOW_MS);

    expect(declinedAttempts.length).toBeGreaterThan(0);
    const declineRate = declinedAttempts.length / reservations.length;
    expect(declineRate).toBeGreaterThan(0.01);
    expect(declineRate).toBeLessThan(0.05);

    const distinctDays = new Set(declinedAttempts.map((a) => a.createdAt.toISOString().slice(0, 10)));
    expect(distinctDays.size).toBeGreaterThan(10);

    for (const attempt of declinedAttempts) {
      expect(attempt.createdAt.getTime()).toBeGreaterThanOrEqual(windowStart.getTime());
      expect(attempt.createdAt.getTime()).toBeLessThanOrEqual(NOW.getTime());
      expect(attempt.amountCents).toBeGreaterThan(0);
      expect(attempt.cardLast4).toMatch(/^\d{4}$/);
    }
  });
});
