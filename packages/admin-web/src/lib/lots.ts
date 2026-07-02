/**
 * Converts a dollars-input string (as typed into a form field, e.g. "8.50" or
 * "12") into integer cents for the API. Returns NaN for input that isn't a
 * valid number so callers can surface a validation error rather than silently
 * submitting a bad amount.
 */
export function dollarsToCents(value: string): number {
  const dollars = Number(value);
  if (value.trim() === '' || Number.isNaN(dollars)) {
    return NaN;
  }
  return Math.round(dollars * 100);
}

/**
 * Formats integer cents as a dollars-input string suitable for pre-filling a
 * form field (e.g. 850 -> "8.50").
 */
export function centsToDollarsInput(cents: number): string {
  return (cents / 100).toFixed(2);
}
