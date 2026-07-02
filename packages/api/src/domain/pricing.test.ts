import { describe, expect, it } from 'vitest';
import { calculateCostCents, calculateWindowCostCents, rateForHour, type HourlyRateRule } from './pricing.js';
import { ValidationError } from './errors.js';

describe('calculateCostCents', () => {
  it('charges 90 minutes at $10/hr as 2 hours (2000 cents)', () => {
    const start = new Date('2026-07-02T10:00:00Z');
    const end = new Date('2026-07-02T11:30:00Z');
    expect(calculateCostCents(1000, start, end)).toBe(2000);
  });

  it('charges exactly 60 minutes as 1 hour (1000 cents)', () => {
    const start = new Date('2026-07-02T10:00:00Z');
    const end = new Date('2026-07-02T11:00:00Z');
    expect(calculateCostCents(1000, start, end)).toBe(1000);
  });

  it('charges 61 minutes as 2 hours (2000 cents)', () => {
    const start = new Date('2026-07-02T10:00:00Z');
    const end = new Date('2026-07-02T11:01:00Z');
    expect(calculateCostCents(1000, start, end)).toBe(2000);
  });

  it('charges a minimum of 1 hour for 10 minutes (1000 cents)', () => {
    const start = new Date('2026-07-02T10:00:00Z');
    const end = new Date('2026-07-02T10:10:00Z');
    expect(calculateCostCents(1000, start, end)).toBe(1000);
  });

  it('throws ValidationError when end equals start', () => {
    const start = new Date('2026-07-02T10:00:00Z');
    const end = new Date('2026-07-02T10:00:00Z');
    expect(() => calculateCostCents(1000, start, end)).toThrow(ValidationError);
  });

  it('throws ValidationError when end is before start', () => {
    const start = new Date('2026-07-02T10:00:00Z');
    const end = new Date('2026-07-02T09:00:00Z');
    expect(() => calculateCostCents(1000, start, end)).toThrow(ValidationError);
  });
});

describe('rateForHour', () => {
  // 2026-07-02 is a Thursday (weekday, UTC dow 4); 2026-07-04 is a Saturday
  // (weekend, UTC dow 6); 2026-07-05 is a Sunday (weekend, UTC dow 0).
  const weekdaySlot = new Date('2026-07-02T10:00:00Z');
  const saturdaySlot = new Date('2026-07-04T10:00:00Z');
  const sundaySlot = new Date('2026-07-05T10:00:00Z');

  it('returns baseRateCents when there are no rules', () => {
    expect(rateForHour(1000, [], weekdaySlot)).toBe(1000);
  });

  it('returns baseRateCents when no rule matches the hour', () => {
    const rules: HourlyRateRule[] = [{ dayType: 'all', startHour: 18, endHour: 22, hourlyRateCents: 1500 }];
    expect(rateForHour(1000, rules, weekdaySlot)).toBe(1000);
  });

  it('applies an "all" rule matching the hour regardless of day', () => {
    const rules: HourlyRateRule[] = [{ dayType: 'all', startHour: 9, endHour: 11, hourlyRateCents: 1500 }];
    expect(rateForHour(1000, rules, weekdaySlot)).toBe(1500);
    expect(rateForHour(1000, rules, saturdaySlot)).toBe(1500);
  });

  it('applies a "weekday" rule on a weekday slot within its hours', () => {
    const rules: HourlyRateRule[] = [{ dayType: 'weekday', startHour: 9, endHour: 11, hourlyRateCents: 2000 }];
    expect(rateForHour(1000, rules, weekdaySlot)).toBe(2000);
  });

  it('does not apply a "weekday" rule on weekend slots (Saturday or Sunday)', () => {
    const rules: HourlyRateRule[] = [{ dayType: 'weekday', startHour: 9, endHour: 11, hourlyRateCents: 2000 }];
    expect(rateForHour(1000, rules, saturdaySlot)).toBe(1000);
    expect(rateForHour(1000, rules, sundaySlot)).toBe(1000);
  });

  it('applies a "weekend" rule on Saturday and Sunday slots within its hours', () => {
    const rules: HourlyRateRule[] = [{ dayType: 'weekend', startHour: 9, endHour: 11, hourlyRateCents: 1200 }];
    expect(rateForHour(1000, rules, saturdaySlot)).toBe(1200);
    expect(rateForHour(1000, rules, sundaySlot)).toBe(1200);
  });

  it('does not apply a "weekend" rule on a weekday slot', () => {
    const rules: HourlyRateRule[] = [{ dayType: 'weekend', startHour: 9, endHour: 11, hourlyRateCents: 1200 }];
    expect(rateForHour(1000, rules, weekdaySlot)).toBe(1000);
  });

  it('prefers a day-specific rule ("weekday"/"weekend") over an "all" rule covering the same hour', () => {
    const rules: HourlyRateRule[] = [
      { dayType: 'all', startHour: 9, endHour: 11, hourlyRateCents: 1500 },
      { dayType: 'weekday', startHour: 9, endHour: 11, hourlyRateCents: 2000 },
    ];
    expect(rateForHour(1000, rules, weekdaySlot)).toBe(2000);
  });

  it('falls back to the "all" rule on a day without a matching day-specific rule', () => {
    const rules: HourlyRateRule[] = [
      { dayType: 'all', startHour: 9, endHour: 11, hourlyRateCents: 1500 },
      { dayType: 'weekend', startHour: 9, endHour: 11, hourlyRateCents: 1200 },
    ];
    expect(rateForHour(1000, rules, weekdaySlot)).toBe(1500);
  });

  it('matches the boundary startHour (inclusive)', () => {
    const rules: HourlyRateRule[] = [{ dayType: 'all', startHour: 9, endHour: 11, hourlyRateCents: 1500 }];
    const slot = new Date('2026-07-02T09:00:00Z');
    expect(rateForHour(1000, rules, slot)).toBe(1500);
  });

  it('does not match the boundary endHour (exclusive)', () => {
    const rules: HourlyRateRule[] = [{ dayType: 'all', startHour: 9, endHour: 11, hourlyRateCents: 1500 }];
    const slot = new Date('2026-07-02T11:00:00Z');
    expect(rateForHour(1000, rules, slot)).toBe(1000);
  });
});

describe('calculateWindowCostCents', () => {
  it('equals calculateCostCents when rules=[] (90 minutes at $10/hr = 2000 cents)', () => {
    const start = new Date('2026-07-02T10:00:00Z');
    const end = new Date('2026-07-02T11:30:00Z');
    expect(calculateWindowCostCents(1000, [], start, end)).toBe(calculateCostCents(1000, start, end));
    expect(calculateWindowCostCents(1000, [], start, end)).toBe(2000);
  });

  it('equals calculateCostCents when rules=[] for an exact-hour window', () => {
    const start = new Date('2026-07-02T10:00:00Z');
    const end = new Date('2026-07-02T11:00:00Z');
    expect(calculateWindowCostCents(1000, [], start, end)).toBe(calculateCostCents(1000, start, end));
  });

  it('charges a minimum of 1 hour for a 10-minute window with rules=[]', () => {
    const start = new Date('2026-07-02T10:00:00Z');
    const end = new Date('2026-07-02T10:10:00Z');
    expect(calculateWindowCostCents(1000, [], start, end)).toBe(1000);
  });

  it('sums per-hour rates across a window that crosses a rate boundary', () => {
    // Hours 9 and 10 covered by a premium rule; hour 11 falls back to base.
    const rules: HourlyRateRule[] = [{ dayType: 'all', startHour: 9, endHour: 11, hourlyRateCents: 2000 }];
    const start = new Date('2026-07-02T09:00:00Z');
    const end = new Date('2026-07-02T12:00:00Z');
    // slots: 09:00 (2000) + 10:00 (2000) + 11:00 (1000, base) = 5000
    expect(calculateWindowCostCents(1000, rules, start, end)).toBe(5000);
  });

  it('applies day-specific rules per slot across a window spanning midnight (Sat->Sun)', () => {
    const rules: HourlyRateRule[] = [{ dayType: 'weekend', startHour: 0, endHour: 24, hourlyRateCents: 1200 }];
    const start = new Date('2026-07-04T23:00:00Z');
    const end = new Date('2026-07-05T01:00:00Z');
    // slots: Sat 23:00 (weekend rule 1200) + Sun 00:00 (weekend rule 1200) = 2400
    expect(calculateWindowCostCents(1000, rules, start, end)).toBe(2400);
  });

  it('rounds partial hours up (61 minutes -> 2 billed hours) applying the rate per slot', () => {
    const rules: HourlyRateRule[] = [{ dayType: 'all', startHour: 10, endHour: 12, hourlyRateCents: 1500 }];
    const start = new Date('2026-07-02T10:00:00Z');
    const end = new Date('2026-07-02T11:01:00Z');
    // slots: 10:00 (1500) + 11:00 (1500) = 3000
    expect(calculateWindowCostCents(1000, rules, start, end)).toBe(3000);
  });

  it('throws ValidationError when end equals start', () => {
    const start = new Date('2026-07-02T10:00:00Z');
    expect(() => calculateWindowCostCents(1000, [], start, start)).toThrow(ValidationError);
  });

  it('throws ValidationError when end is before start', () => {
    const start = new Date('2026-07-02T10:00:00Z');
    const end = new Date('2026-07-02T09:00:00Z');
    expect(() => calculateWindowCostCents(1000, [], start, end)).toThrow(ValidationError);
  });
});
