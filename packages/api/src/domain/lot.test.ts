import { describe, expect, it } from 'vitest';
import { availableSpaces, isReservable } from './lot.js';

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
