import type { CreateLotRequest, Lot, UpdateLotRequest } from '@parking/shared';
import { availableSpaces } from '../domain/lot.js';
import { LotNotFoundError } from '../domain/errors.js';
import type { LotRecord, LotRepository } from './ports.js';

function toLot(record: LotRecord & { activeReservations: number }): Lot {
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
    availableSpaces: availableSpaces(record.capacity, record.activeReservations),
    createdAt: record.createdAt.toISOString(),
  };
}

export class LotService {
  constructor(private readonly lots: LotRepository) {}

  async list(): Promise<Lot[]> {
    const records = await this.lots.findAllActive();
    return records.map(toLot);
  }

  async getById(id: string): Promise<Lot> {
    const record = await this.lots.findById(id);
    if (!record || record.status === 'deleted') {
      throw new LotNotFoundError();
    }
    return toLot(record);
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
    return toLot({ ...record, activeReservations: 0 });
  }

  async update(id: string, req: UpdateLotRequest): Promise<Lot> {
    const updated = await this.lots.update(id, req);
    if (!updated) {
      throw new LotNotFoundError();
    }
    const withActiveReservations = await this.lots.findById(id);
    if (!withActiveReservations) {
      throw new LotNotFoundError();
    }
    return toLot(withActiveReservations);
  }

  async remove(id: string): Promise<void> {
    const deleted = await this.lots.softDelete(id);
    if (!deleted) {
      throw new LotNotFoundError();
    }
  }
}
