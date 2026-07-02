import { describe, expect, it } from 'vitest';
import { estimateCostCents } from './pricing';

describe('estimateCostCents', () => {
  it('charges 90 minutes at $10/hr as 2 hours (2000 cents)', () => {
    expect(estimateCostCents(1000, '2026-07-02T10:00:00Z', '2026-07-02T11:30:00Z')).toBe(2000);
  });

  it('charges exactly 60 minutes as 1 hour (1000 cents)', () => {
    expect(estimateCostCents(1000, '2026-07-02T10:00:00Z', '2026-07-02T11:00:00Z')).toBe(1000);
  });

  it('charges 61 minutes as 2 hours (2000 cents)', () => {
    expect(estimateCostCents(1000, '2026-07-02T10:00:00Z', '2026-07-02T11:01:00Z')).toBe(2000);
  });

  it('charges a minimum of 1 hour for 10 minutes (1000 cents)', () => {
    expect(estimateCostCents(1000, '2026-07-02T10:00:00Z', '2026-07-02T10:10:00Z')).toBe(1000);
  });

  it('returns null when end equals start', () => {
    expect(estimateCostCents(1000, '2026-07-02T10:00:00Z', '2026-07-02T10:00:00Z')).toBeNull();
  });

  it('returns null when end is before start', () => {
    expect(estimateCostCents(1000, '2026-07-02T10:00:00Z', '2026-07-02T09:00:00Z')).toBeNull();
  });
});
