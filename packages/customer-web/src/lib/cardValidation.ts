/**
 * Client-side card field validation for the mock payment form. None of this
 * ever reaches a network call except as part of the (also mocked) reservation
 * request — the raw card number is never persisted or logged.
 */

const CARD_NUMBER_LENGTH_RANGE = { min: 13, max: 19 };

export function luhnCheck(rawCardNumber: string): boolean {
  if (!/^\d+$/.test(rawCardNumber)) {
    return false;
  }
  if (
    rawCardNumber.length < CARD_NUMBER_LENGTH_RANGE.min ||
    rawCardNumber.length > CARD_NUMBER_LENGTH_RANGE.max
  ) {
    return false;
  }

  let sum = 0;
  let shouldDouble = false;
  for (let i = rawCardNumber.length - 1; i >= 0; i--) {
    let digit = Number(rawCardNumber[i]);
    if (shouldDouble) {
      digit *= 2;
      if (digit > 9) {
        digit -= 9;
      }
    }
    sum += digit;
    shouldDouble = !shouldDouble;
  }

  return sum % 10 === 0;
}

export function formatCardNumber(rawInput: string): string {
  const digits = rawInput.replace(/\D/g, '');
  return digits.replace(/(\d{4})(?=\d)/g, '$1 ');
}

const EXPIRY_PATTERN = /^(0[1-9]|1[0-2])\/(\d{2})$/;

export function isValidExpiry(expiry: string, now: Date = new Date()): boolean {
  const match = EXPIRY_PATTERN.exec(expiry);
  if (!match) {
    return false;
  }

  const month = Number(match[1]);
  const twoDigitYear = Number(match[2]);
  const fullYear = 2000 + twoDigitYear;

  const currentYear = now.getUTCFullYear();
  const currentMonth = now.getUTCMonth() + 1;

  if (fullYear < currentYear) {
    return false;
  }
  if (fullYear === currentYear && month < currentMonth) {
    return false;
  }
  return true;
}

export function isValidCvc(cvc: string): boolean {
  return /^\d{3,4}$/.test(cvc);
}
