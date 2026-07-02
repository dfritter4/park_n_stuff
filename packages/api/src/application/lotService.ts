import type { CreateLotRequest, Lot, UpdateLotRequest } from '@parking/shared';
import { availableSpaces, effectiveCapacity } from '../domain/lot.js';
import { billedHoursFor, calculateWindowCostCents, type HourlyRateRule } from '../domain/pricing.js';
import { LotNotFoundError } from '../domain/errors.js';
import type {
  CapacityOverrideRepository,
  Clock,
  LotRecord,
  LotRepository,
  PricingRuleRecord,
  PricingRuleRepository,
} from './ports.js';

function toHourlyRateRule(rule: PricingRuleRecord): HourlyRateRule {
  return {
    dayType: rule.dayType,
    startHour: rule.startHour,
    endHour: rule.endHour,
    hourlyRateCents: rule.hourlyRateCents,
  };
}

export class LotService {
  constructor(
    private readonly lots: LotRepository,
    private readonly capacityOverrides: CapacityOverrideRepository,
    private readonly pricingRules: PricingRuleRepository,
    private readonly clock: Clock,
  ) {}

  async list(): Promise<Lot[]> {
    const records = await this.lots.findAllActive();
    return Promise.all(records.map((record) => this.toLot(record)));
  }

  async getById(id: string): Promise<Lot> {
    return this.toLot(await this.requireActiveRecord(id));
  }

  async create(req: CreateLotRequest): Promise<Lot> {
    const record = await this.lots.create({
      name: req.name,
      address: req.address,
      neighborhood: req.neighborhood,
      lat: req.lat,
      lng: req.lng,
      capacity: req.capacity,
      hourlyRateCents: req.hourlyRateCents,
    });
    return this.toLot({ ...record, activeReservations: 0 });
  }

  async update(id: string, req: UpdateLotRequest): Promise<Lot> {
    await this.requireActiveRecord(id);
    const updated = await this.lots.update(id, req);
    if (!updated) {
      throw new LotNotFoundError();
    }
    const withActiveReservations = await this.lots.findById(id);
    if (!withActiveReservations) {
      throw new LotNotFoundError();
    }
    return this.toLot(withActiveReservations);
  }

  async remove(id: string): Promise<void> {
    await this.requireActiveRecord(id);
    const deleted = await this.lots.softDelete(id);
    if (!deleted) {
      throw new LotNotFoundError();
    }
  }

  /**
   * Server-authoritative cost quote for [startTime, endTime), using the
   * lot's base rate plus any pricing rules. Throws ValidationError (via
   * calculateWindowCostCents) when endTime <= startTime.
   */
  async quote(id: string, startTime: Date, endTime: Date): Promise<{ totalCostCents: number; billedHours: number }> {
    const record = await this.requireActiveRecord(id);
    const rules = await this.pricingRules.listByLot(id);
    const totalCostCents = calculateWindowCostCents(record.hourlyRateCents, rules.map(toHourlyRateRule), startTime, endTime);
    return { totalCostCents, billedHours: billedHoursFor(startTime, endTime) };
  }

  private async requireActiveRecord(id: string): Promise<LotRecord & { activeReservations: number }> {
    const record = await this.lots.findById(id);
    if (!record || record.status === 'deleted') {
      throw new LotNotFoundError();
    }
    return record;
  }

  /**
   * availableSpaces reflects capacity overrides active right now (the
   * instantaneous window [now, now]) — not the requested-reservation-window
   * semantics used by the reservation-creation capacity gate, which needs
   * the caller's [startTime, endTime).
   */
  private async toLot(record: LotRecord & { activeReservations: number }): Promise<Lot> {
    const now = this.clock.now();
    const overrides = await this.capacityOverrides.listActiveForWindow(record.id, now, now);
    const capacity = effectiveCapacity(record.capacity, overrides, { start: now, end: now });
    return {
      id: record.id,
      name: record.name,
      address: record.address,
      neighborhood: record.neighborhood,
      lat: record.lat,
      lng: record.lng,
      capacity: record.capacity,
      hourlyRateCents: record.hourlyRateCents,
      status: record.status,
      availableSpaces: availableSpaces(capacity, record.activeReservations),
      createdAt: record.createdAt.toISOString(),
    };
  }
}
