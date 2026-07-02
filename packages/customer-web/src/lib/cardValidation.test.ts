import { describe, expect, it } from 'vitest';
import { formatCardNumber, isValidCvc, isValidExpiry, luhnCheck } from './cardValidation';

describe('luhnCheck', () => {
  it('accepts a valid Visa test number', () => {
    expect(luhnCheck('4242424242424242')).toBe(true);
  });

  it('accepts a valid Mastercard test number', () => {
    expect(luhnCheck('5555555555554444')).toBe(true);
  });

  it('rejects a number with a corrupted final digit', () => {
    expect(luhnCheck('4242424242424241')).toBe(false);
  });

  it('rejects non-digit input', () => {
    expect(luhnCheck('4242-4242-4242-4242')).toBe(false);
  });

  it('rejects numbers shorter than 13 digits', () => {
    expect(luhnCheck('424242424242')).toBe(false);
  });

  it('rejects numbers longer than 19 digits', () => {
    expect(luhnCheck('42424242424242424242')).toBe(false);
  });

  it('the demo decline card ending 0002 still passes Luhn (used to trigger a real decline path)', () => {
    // 4242424242400002 is Luhn-valid; the mock gateway declines by suffix, not by checksum.
    expect(luhnCheck('4242424242400002')).toBe(true);
  });
});

describe('formatCardNumber', () => {
  it('groups digits into blocks of four separated by spaces', () => {
    expect(formatCardNumber('4242424242424242')).toBe('4242 4242 4242 4242');
  });

  it('strips non-digit characters before grouping', () => {
    expect(formatCardNumber('4242-4242 4242.4242')).toBe('4242 4242 4242 4242');
  });

  it('groups a partial number without trailing space', () => {
    expect(formatCardNumber('42424')).toBe('4242 4');
  });
});

describe('isValidExpiry', () => {
  const now = new Date('2026-07-02T00:00:00Z');

  it('accepts a well-formed future expiry', () => {
    expect(isValidExpiry('12/26', now)).toBe(true);
  });

  it('accepts the current month as not expired', () => {
    expect(isValidExpiry('07/26', now)).toBe(true);
  });

  it('rejects a past expiry', () => {
    expect(isValidExpiry('06/26', now)).toBe(false);
  });

  it('rejects malformed input', () => {
    expect(isValidExpiry('13/26', now)).toBe(false);
    expect(isValidExpiry('1226', now)).toBe(false);
    expect(isValidExpiry('00/26', now)).toBe(false);
  });
});

describe('isValidCvc', () => {
  it('accepts 3 digits', () => {
    expect(isValidCvc('123')).toBe(true);
  });

  it('accepts 4 digits', () => {
    expect(isValidCvc('1234')).toBe(true);
  });

  it('rejects 2 digits', () => {
    expect(isValidCvc('12')).toBe(false);
  });

  it('rejects 5 digits', () => {
    expect(isValidCvc('12345')).toBe(false);
  });

  it('rejects non-digit characters', () => {
    expect(isValidCvc('12a')).toBe(false);
  });
});
