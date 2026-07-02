import type { CapacityOverride, CreatePricingRuleRequest, PricingRule } from '@parking/shared';
import { pricingRulesOverlap } from '../domain/pricing.js';
import {
  CapacityOverrideNotFoundError,
  LotNotFoundError,
  PricingRuleNotFoundError,
  PricingRuleOverlapError,
  ValidationError,
} from '../domain/errors.js';
import type {
  CapacityOverrideRecord,
  CapacityOverrideRepository,
  LotRecord,
  LotRepository,
  PricingRuleRecord,
  PricingRuleRepository,
} from './ports.js';

export interface CreateCapacityOverrideInput {
  spacesClosed: number;
  reason: string;
  startsAt: Date;
  endsAt: Date | null;
}

function toPricingRule(record: PricingRuleRecord): PricingRule {
  return {
    id: record.id,
    lotId: record.lotId,
    dayType: record.dayType,
    startHour: record.startHour,
    endHour: record.endHour,
    hourlyRateCents: record.hourlyRateCents,
    createdAt: record.createdAt.toISOString(),
  };
}

function toCapacityOverride(record: CapacityOverrideRecord): CapacityOverride {
  return {
    id: record.id,
    lotId: record.lotId,
    spacesClosed: record.spacesClosed,
    reason: record.reason,
    startsAt: record.startsAt.toISOString(),
    endsAt: record.endsAt ? record.endsAt.toISOString() : null,
    createdAt: record.createdAt.toISOString(),
  };
}

/**
 * Admin CRUD for a lot's pricing rules and capacity overrides (phase-2
 * "pricing/ops" feature). Enforces the two invariants the plan calls out:
 * a new pricing rule must not overlap an existing rule of the same lot
 * (same dayType, or either 'all', with intersecting hours) and a capacity
 * override can't close more spaces than the lot has.
 */
export class LotOpsService {
  constructor(
    private readonly lots: LotRepository,
    private readonly pricingRules: PricingRuleRepository,
    private readonly capacityOverrides: CapacityOverrideRepository,
  ) {}

  async listPricingRules(lotId: string): Promise<PricingRule[]> {
    await this.requireActiveLot(lotId);
    const records = await this.pricingRules.listByLot(lotId);
    return records.map(toPricingRule);
  }

  async createPricingRule(lotId: string, req: CreatePricingRuleRequest): Promise<PricingRule> {
    await this.requireActiveLot(lotId);
    const existing = await this.pricingRules.listByLot(lotId);
    if (existing.some((rule) => pricingRulesOverlap(rule, req))) {
      throw new PricingRuleOverlapError();
    }
    const created = await this.pricingRules.create(lotId, req);
    return toPricingRule(created);
  }

  async deletePricingRule(id: string): Promise<void> {
    const deleted = await this.pricingRules.delete(id);
    if (!deleted) {
      throw new PricingRuleNotFoundError();
    }
  }

  async listCapacityOverrides(lotId: string): Promise<CapacityOverride[]> {
    await this.requireActiveLot(lotId);
    const records = await this.capacityOverrides.listByLot(lotId);
    return records.map(toCapacityOverride);
  }

  async createCapacityOverride(lotId: string, req: CreateCapacityOverrideInput): Promise<CapacityOverride> {
    const lot = await this.requireActiveLot(lotId);
    if (req.spacesClosed > lot.capacity) {
      throw new ValidationError('spacesClosed cannot exceed the lot capacity');
    }
    const created = await this.capacityOverrides.create(lotId, req);
    return toCapacityOverride(created);
  }

  async deleteCapacityOverride(id: string): Promise<void> {
    const deleted = await this.capacityOverrides.delete(id);
    if (!deleted) {
      throw new CapacityOverrideNotFoundError();
    }
  }

  private async requireActiveLot(lotId: string): Promise<LotRecord> {
    const lot = await this.lots.findById(lotId);
    if (!lot || lot.status === 'deleted') {
      throw new LotNotFoundError();
    }
    return lot;
  }
}
