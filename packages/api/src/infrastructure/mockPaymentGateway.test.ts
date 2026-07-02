import { describe, expect, it } from 'vitest';
import { MockPaymentGateway } from './mockPaymentGateway.js';

describe('MockPaymentGateway', () => {
  it('always declines cards ending in 0002', async () => {
    const gateway = new MockPaymentGateway(() => 0); // random always "succeeds" if it mattered
    const result = await gateway.charge({ cardNumber: '4111111111110002', amountCents: 1000 });
    expect(result.success).toBe(false);
  });

  it('always succeeds cards ending in 0001', async () => {
    const gateway = new MockPaymentGateway(() => 1); // random always "fails" if it mattered
    const result = await gateway.charge({ cardNumber: '4111111111110001', amountCents: 1000 });
    expect(result.success).toBe(true);
  });

  it('succeeds for other cards when random() < 0.95', async () => {
    const gateway = new MockPaymentGateway(() => 0.94);
    const result = await gateway.charge({ cardNumber: '4111111111111234', amountCents: 1000 });
    expect(result.success).toBe(true);
  });

  it('declines for other cards when random() >= 0.95', async () => {
    const gateway = new MockPaymentGateway(() => 0.95);
    const result = await gateway.charge({ cardNumber: '4111111111111234', amountCents: 1000 });
    expect(result.success).toBe(false);
  });

  it('defaults to Math.random when no random fn is injected', async () => {
    const gateway = new MockPaymentGateway();
    const result = await gateway.charge({ cardNumber: '4111111111111234', amountCents: 1000 });
    expect(typeof result.success).toBe('boolean');
  });

  it('returns a transactionId formatted as txn_ + 12 base36 chars', async () => {
    const gateway = new MockPaymentGateway(() => 0);
    const result = await gateway.charge({ cardNumber: '4111111111111234', amountCents: 1000 });
    expect(result.transactionId).toMatch(/^txn_[0-9a-z]{12}$/);
  });

  it('generates distinct transactionIds across calls', async () => {
    const gateway = new MockPaymentGateway(() => 0);
    const first = await gateway.charge({ cardNumber: '4111111111111234', amountCents: 1000 });
    const second = await gateway.charge({ cardNumber: '4111111111111234', amountCents: 1000 });
    expect(first.transactionId).not.toBe(second.transactionId);
  });
});
