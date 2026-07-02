import { randomInt } from 'node:crypto';
import type { PaymentGateway } from '../application/ports.js';

const BASE36_CHARS = '0123456789abcdefghijklmnopqrstuvwxyz';
const TRANSACTION_ID_LENGTH = 12;
const RANDOM_SUCCESS_THRESHOLD = 0.95;
const DECLINED_SUFFIX = '0002';
const ALWAYS_SUCCESS_SUFFIX = '0001';

function generateTransactionId(): string {
  let suffix = '';
  for (let i = 0; i < TRANSACTION_ID_LENGTH; i++) {
    suffix += BASE36_CHARS[randomInt(BASE36_CHARS.length)];
  }
  return `txn_${suffix}`;
}

/**
 * Deterministic-by-injection stand-in for a real payment processor. Card suffixes
 * 0001/0002 give tests fixed success/decline outcomes; all other cards succeed
 * probabilistically via the injected `random` function so tests can control the
 * outcome without depending on Math.random.
 */
export class MockPaymentGateway implements PaymentGateway {
  constructor(private readonly random: () => number = Math.random) {}

  async charge(input: { cardNumber: string; amountCents: number }): Promise<{
    success: boolean;
    transactionId: string;
  }> {
    return { success: this.resolveSuccess(input.cardNumber), transactionId: generateTransactionId() };
  }

  private resolveSuccess(cardNumber: string): boolean {
    if (cardNumber.endsWith(DECLINED_SUFFIX)) return false;
    if (cardNumber.endsWith(ALWAYS_SUCCESS_SUFFIX)) return true;
    return this.random() < RANDOM_SUCCESS_THRESHOLD;
  }
}
