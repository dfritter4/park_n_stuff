import { describe, expect, it } from 'vitest';
import { availableSpaces, effectiveCapacity, isReservable, type CapacityOverrideWindow } from './lot.js';

describe('isReservable', () => {
  it('returns true for active lots', () => {
    expect(isReservable('active')).toBe(true);
  });

  it('returns false for maintenance lots', () => {
    expect(isReservable('maintenance')).toBe(false);
  });

  it('returns false for deleted lots', () => {
    expect(isReservable('deleted')).toBe(false);
  });
});

describe('availableSpaces', () => {
  it('returns capacity minus active count', () => {
    expect(availableSpaces(10, 4)).toBe(6);
  });

  it('clamps to 0 when active count exceeds capacity', () => {
    expect(availableSpaces(10, 12)).toBe(0);
  });
});

describe('effectiveCapacity', () => {
  const window = { start: new Date('2026-07-02T10:00:00Z'), end: new Date('2026-07-02T12:00:00Z') };

  it('returns full capacity when there are no overrides', () => {
    expect(effectiveCapacity(10, [], window)).toBe(10);
  });

  it('subtracts spacesClosed for an override overlapping the window', () => {
    const overrides: CapacityOverrideWindow[] = [
      { spacesClosed: 3, startsAt: new Date('2026-07-02T09:00:00Z'), endsAt: new Date('2026-07-02T11:00:00Z') },
    ];
    expect(effectiveCapacity(10, overrides, window)).toBe(7);
  });

  it('ignores an override that ends before the window starts', () => {
    const overrides: CapacityOverrideWindow[] = [
      { spacesClosed: 3, startsAt: new Date('2026-07-02T07:00:00Z'), endsAt: new Date('2026-07-02T09:00:00Z') },
    ];
    expect(effectiveCapacity(10, overrides, window)).toBe(10);
  });

  it('ignores an override that starts at/after the window ends', () => {
    const overrides: CapacityOverrideWindow[] = [
      { spacesClosed: 3, startsAt: new Date('2026-07-02T12:00:00Z'), endsAt: null },
    ];
    expect(effectiveCapacity(10, overrides, window)).toBe(10);
  });

  it('treats a null endsAt as open-ended (still active)', () => {
    const overrides: CapacityOverrideWindow[] = [
      { spacesClosed: 4, startsAt: new Date('2026-07-01T00:00:00Z'), endsAt: null },
    ];
    expect(effectiveCapacity(10, overrides, window)).toBe(6);
  });

  it('sums spacesClosed across multiple overlapping overrides', () => {
    const overrides: CapacityOverrideWindow[] = [
      { spacesClosed: 3, startsAt: new Date('2026-07-02T09:00:00Z'), endsAt: new Date('2026-07-02T11:00:00Z') },
      { spacesClosed: 2, startsAt: new Date('2026-07-02T11:30:00Z'), endsAt: new Date('2026-07-02T13:00:00Z') },
    ];
    expect(effectiveCapacity(10, overrides, window)).toBe(5);
  });

  it('clamps to 0 when overrides close more spaces than capacity', () => {
    const overrides: CapacityOverrideWindow[] = [
      { spacesClosed: 15, startsAt: new Date('2026-07-02T09:00:00Z'), endsAt: null },
    ];
    expect(effectiveCapacity(10, overrides, window)).toBe(0);
  });

  it('includes an override whose endsAt is just after the window start (still overlaps)', () => {
    const overrides: CapacityOverrideWindow[] = [
      { spacesClosed: 2, startsAt: new Date('2026-07-02T09:00:00Z'), endsAt: new Date('2026-07-02T10:00:01Z') },
    ];
    expect(effectiveCapacity(10, overrides, window)).toBe(8);
  });

  it('excludes an override whose endsAt equals the window start exactly (no overlap)', () => {
    const overrides: CapacityOverrideWindow[] = [
      { spacesClosed: 2, startsAt: new Date('2026-07-02T09:00:00Z'), endsAt: new Date('2026-07-02T10:00:00Z') },
    ];
    expect(effectiveCapacity(10, overrides, window)).toBe(10);
  });
});
