import { describe, expect, it } from 'vitest';
import {
  CapacityOverrideNotFoundError,
  LotNotFoundError,
  PricingRuleNotFoundError,
  PricingRuleOverlapError,
  ValidationError,
} from '../domain/errors.js';
import {
  FakeCapacityOverrideRepository,
  FakeLotRepository,
  FakePricingRuleRepository,
  InMemoryDatabase,
} from './testing/fakes.js';
import { LotOpsService } from './lotOpsService.js';

function buildService(db: InMemoryDatabase): LotOpsService {
  return new LotOpsService(
    new FakeLotRepository(db),
    new FakePricingRuleRepository(db),
    new FakeCapacityOverrideRepository(db),
  );
}

describe('LotOpsService pricing rules', () => {
  it('creates a pricing rule for an active lot', async () => {
    const db = new InMemoryDatabase();
    const lot = db.seedLot();
    const service = buildService(db);

    const rule = await service.createPricingRule(lot.id, {
      dayType: 'weekday',
      startHour: 7,
      endHour: 19,
      hourlyRateCents: 1500,
    });

    expect(rule).toMatchObject({ lotId: lot.id, dayType: 'weekday', startHour: 7, endHour: 19, hourlyRateCents: 1500 });
  });

  it('throws LotNotFoundError for an unknown lot', async () => {
    const db = new InMemoryDatabase();
    const service = buildService(db);

    await expect(
      service.createPricingRule('00000000-0000-0000-0000-000000000000', {
        dayType: 'all',
        startHour: 0,
        endHour: 24,
        hourlyRateCents: 1000,
      }),
    ).rejects.toThrow(LotNotFoundError);
  });

  it('throws LotNotFoundError for a soft-deleted lot', async () => {
    const db = new InMemoryDatabase();
    const lot = db.seedLot({ status: 'deleted' });
    const service = buildService(db);

    await expect(service.listPricingRules(lot.id)).rejects.toThrow(LotNotFoundError);
  });

  it('rejects a new rule with the same dayType overlapping an existing rule (409 PRICING_RULE_OVERLAP)', async () => {
    const db = new InMemoryDatabase();
    const lot = db.seedLot();
    db.seedPricingRule(lot.id, { dayType: 'weekday', startHour: 8, endHour: 12 });
    const service = buildService(db);

    await expect(
      service.createPricingRule(lot.id, { dayType: 'weekday', startHour: 10, endHour: 14, hourlyRateCents: 1200 }),
    ).rejects.toThrow(PricingRuleOverlapError);
  });

  it("rejects a new 'all' rule overlapping an existing day-specific rule's hours", async () => {
    const db = new InMemoryDatabase();
    const lot = db.seedLot();
    db.seedPricingRule(lot.id, { dayType: 'weekday', startHour: 8, endHour: 12 });
    const service = buildService(db);

    await expect(
      service.createPricingRule(lot.id, { dayType: 'all', startHour: 6, endHour: 10, hourlyRateCents: 900 }),
    ).rejects.toThrow(PricingRuleOverlapError);
  });

  it("rejects a new day-specific rule overlapping an existing 'all' rule's hours", async () => {
    const db = new InMemoryDatabase();
    const lot = db.seedLot();
    db.seedPricingRule(lot.id, { dayType: 'all', startHour: 6, endHour: 10 });
    const service = buildService(db);

    await expect(
      service.createPricingRule(lot.id, { dayType: 'weekend', startHour: 8, endHour: 12, hourlyRateCents: 900 }),
    ).rejects.toThrow(PricingRuleOverlapError);
  });

  it('allows a new rule with a different specific dayType covering the same hours (weekday vs weekend)', async () => {
    const db = new InMemoryDatabase();
    const lot = db.seedLot();
    db.seedPricingRule(lot.id, { dayType: 'weekday', startHour: 8, endHour: 12 });
    const service = buildService(db);

    await expect(
      service.createPricingRule(lot.id, { dayType: 'weekend', startHour: 8, endHour: 12, hourlyRateCents: 1200 }),
    ).resolves.toMatchObject({ dayType: 'weekend' });
  });

  it('allows a new rule with the same dayType but non-overlapping hours', async () => {
    const db = new InMemoryDatabase();
    const lot = db.seedLot();
    db.seedPricingRule(lot.id, { dayType: 'weekday', startHour: 8, endHour: 12 });
    const service = buildService(db);

    await expect(
      service.createPricingRule(lot.id, { dayType: 'weekday', startHour: 12, endHour: 18, hourlyRateCents: 1200 }),
    ).resolves.toMatchObject({ startHour: 12, endHour: 18 });
  });

  it('deletes an existing pricing rule', async () => {
    const db = new InMemoryDatabase();
    const lot = db.seedLot();
    const rule = db.seedPricingRule(lot.id);
    const service = buildService(db);

    await expect(service.deletePricingRule(rule.id)).resolves.toBeUndefined();
    await expect(service.listPricingRules(lot.id)).resolves.toEqual([]);
  });

  it('throws PricingRuleNotFoundError deleting an unknown rule id', async () => {
    const db = new InMemoryDatabase();
    const service = buildService(db);

    await expect(service.deletePricingRule('00000000-0000-0000-0000-000000000000')).rejects.toThrow(
      PricingRuleNotFoundError,
    );
  });
});

describe('LotOpsService capacity overrides', () => {
  it('creates a capacity override within the lot capacity', async () => {
    const db = new InMemoryDatabase();
    const lot = db.seedLot({ capacity: 10 });
    const service = buildService(db);

    const override = await service.createCapacityOverride(lot.id, {
      spacesClosed: 5,
      reason: 'Resurfacing',
      startsAt: new Date('2026-07-02T00:00:00Z'),
      endsAt: new Date('2026-07-03T00:00:00Z'),
    });

    expect(override).toMatchObject({ lotId: lot.id, spacesClosed: 5, reason: 'Resurfacing' });
  });

  it('rejects spacesClosed greater than the lot capacity (400 VALIDATION_ERROR)', async () => {
    const db = new InMemoryDatabase();
    const lot = db.seedLot({ capacity: 10 });
    const service = buildService(db);

    await expect(
      service.createCapacityOverride(lot.id, {
        spacesClosed: 11,
        reason: 'Resurfacing',
        startsAt: new Date('2026-07-02T00:00:00Z'),
        endsAt: null,
      }),
    ).rejects.toThrow(ValidationError);
  });

  it('allows spacesClosed exactly equal to the lot capacity', async () => {
    const db = new InMemoryDatabase();
    const lot = db.seedLot({ capacity: 10 });
    const service = buildService(db);

    await expect(
      service.createCapacityOverride(lot.id, {
        spacesClosed: 10,
        reason: 'Full closure',
        startsAt: new Date('2026-07-02T00:00:00Z'),
        endsAt: null,
      }),
    ).resolves.toMatchObject({ spacesClosed: 10 });
  });

  it('throws LotNotFoundError for an unknown lot', async () => {
    const db = new InMemoryDatabase();
    const service = buildService(db);

    await expect(
      service.createCapacityOverride('00000000-0000-0000-0000-000000000000', {
        spacesClosed: 1,
        reason: 'test',
        startsAt: new Date(),
        endsAt: null,
      }),
    ).rejects.toThrow(LotNotFoundError);
  });

  it('deletes an existing capacity override', async () => {
    const db = new InMemoryDatabase();
    const lot = db.seedLot();
    const override = db.seedCapacityOverride(lot.id);
    const service = buildService(db);

    await expect(service.deleteCapacityOverride(override.id)).resolves.toBeUndefined();
    await expect(service.listCapacityOverrides(lot.id)).resolves.toEqual([]);
  });

  it('throws CapacityOverrideNotFoundError deleting an unknown override id', async () => {
    const db = new InMemoryDatabase();
    const service = buildService(db);

    await expect(service.deleteCapacityOverride('00000000-0000-0000-0000-000000000000')).rejects.toThrow(
      CapacityOverrideNotFoundError,
    );
  });
});
