import { describe, expect, it } from 'vitest';
import { formatHourLabel, todayDateString } from './format';

describe('formatHourLabel', () => {
  it('zero-pads single-digit hours', () => {
    expect(formatHourLabel(8)).toBe('08:00');
  });

  it('leaves two-digit hours as-is', () => {
    expect(formatHourLabel(14)).toBe('14:00');
  });

  it('formats midnight as 00:00', () => {
    expect(formatHourLabel(0)).toBe('00:00');
  });

  it('formats the last hour of the day as 23:00', () => {
    expect(formatHourLabel(23)).toBe('23:00');
  });
});

describe('todayDateString', () => {
  it('formats a given date as local YYYY-MM-DD', () => {
    expect(todayDateString(new Date(2026, 0, 5))).toBe('2026-01-05');
  });

  it('zero-pads single-digit months and days', () => {
    expect(todayDateString(new Date(2026, 8, 3))).toBe('2026-09-03');
  });

  it('formats the last day of the year correctly', () => {
    expect(todayDateString(new Date(2026, 11, 31))).toBe('2026-12-31');
  });
});
