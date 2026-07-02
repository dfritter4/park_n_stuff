import { describe, expect, it } from 'vitest';
import { centsToDollarsInput, dollarsToCents } from './lots';

describe('dollarsToCents', () => {
  it('converts a dollars-and-cents string to integer cents', () => {
    expect(dollarsToCents('8.50')).toBe(850);
  });

  it('converts a whole-dollar string to integer cents', () => {
    expect(dollarsToCents('12')).toBe(1200);
  });

  it('rounds to the nearest cent to avoid floating point drift', () => {
    expect(dollarsToCents('0.1')).toBe(10);
    expect(dollarsToCents('19.99')).toBe(1999);
  });

  it('returns NaN for a non-numeric string', () => {
    expect(Number.isNaN(dollarsToCents('abc'))).toBe(true);
  });

  it('returns NaN for an empty string', () => {
    expect(Number.isNaN(dollarsToCents(''))).toBe(true);
  });
});

describe('centsToDollarsInput', () => {
  it('formats whole-dollar cents with two decimal places', () => {
    expect(centsToDollarsInput(1200)).toBe('12.00');
  });

  it('formats cents with a fractional dollar amount', () => {
    expect(centsToDollarsInput(850)).toBe('8.50');
  });

  it('formats zero cents', () => {
    expect(centsToDollarsInput(0)).toBe('0.00');
  });
});
