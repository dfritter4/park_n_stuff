import { describe, expect, it } from 'vitest';
import { calculateCostCents } from './pricing.js';
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
