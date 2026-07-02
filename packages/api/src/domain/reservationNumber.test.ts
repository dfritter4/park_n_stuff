import { describe, expect, it } from 'vitest';
import { generateReservationNumber } from './reservationNumber.js';

describe('generateReservationNumber', () => {
  it('matches the LOT-YYYYMMDD-XXXXX format', () => {
    const now = new Date('2026-07-02T10:00:00Z');
    expect(generateReservationNumber(now)).toMatch(/^LOT-\d{8}-[A-Z0-9]{5}$/);
  });

  it('formats the date portion from the passed date in UTC', () => {
    const now = new Date('2026-07-02T10:00:00Z');
    expect(generateReservationNumber(now)).toMatch(/^LOT-20260702-/);
  });

  it('is deterministic when given an injected random function', () => {
    const now = new Date('2026-07-02T10:00:00Z');
    const random = () => 0;
    expect(generateReservationNumber(now, random)).toBe(generateReservationNumber(now, random));
  });
});
