import { beforeEach, describe, expect, it } from 'vitest';
import type { CreateLotRequest } from '@parking/shared';
import { LotService } from './lotService.js';
import { LotNotFoundError } from '../domain/errors.js';
import { FakeLotRepository, InMemoryDatabase } from './testing/fakes.js';

describe('LotService', () => {
  let db: InMemoryDatabase;
  let service: LotService;

  beforeEach(() => {
    db = new InMemoryDatabase();
    service = new LotService(new FakeLotRepository(db));
  });

  describe('list', () => {
    it('excludes deleted lots and computes availableSpaces', async () => {
      const active = db.seedLot({ name: 'Active Lot', capacity: 10, status: 'active' });
      db.seedLot({ name: 'Deleted Lot', status: 'deleted' });
      db.reservations.set('r1', {
        id: 'r1',
        reservationNumber: 'LOT-20260101-AAAAA',
        lotId: active.id,
        customerId: 'cust-1',
        vehicleMake: 'Honda',
        vehicleModel: 'Civic',
        licensePlate: 'ABC123',
        startTime: new Date(),
        endTime: new Date(Date.now() + 3600_000),
        totalCostCents: 500,
        status: 'active',
        createdAt: new Date(),
      });

      const lots = await service.list();

      expect(lots).toHaveLength(1);
      expect(lots[0]?.name).toBe('Active Lot');
      expect(lots[0]?.availableSpaces).toBe(9);
    });
  });

  describe('getById', () => {
    it('returns the lot mapped to the shared shape', async () => {
      const lot = db.seedLot({ name: 'Main St Lot', capacity: 20, status: 'active' });

      const result = await service.getById(lot.id);

      expect(result.id).toBe(lot.id);
      expect(result.name).toBe('Main St Lot');
      expect(result.availableSpaces).toBe(20);
    });

    it('throws LotNotFoundError for an unknown id', async () => {
      await expect(service.getById('nonexistent')).rejects.toThrow(LotNotFoundError);
    });

    it('throws LotNotFoundError for a soft-deleted lot', async () => {
      const lot = db.seedLot({ status: 'deleted' });
      await expect(service.getById(lot.id)).rejects.toThrow(LotNotFoundError);
    });
  });

  describe('create', () => {
    it('creates a new active lot', async () => {
      const req: CreateLotRequest = {
        name: 'New Lot',
        address: '456 Elm St',
        neighborhood: 'Uptown',
        lat: 12.5,
        lng: -45.5,
        capacity: 30,
        hourlyRateCents: 400,
      };

      const result = await service.create(req);

      expect(result.name).toBe('New Lot');
      expect(result.status).toBe('active');
      expect(result.availableSpaces).toBe(30);
      expect(db.lots.size).toBe(1);
    });
  });

  describe('update', () => {
    it('updates an existing lot', async () => {
      const lot = db.seedLot({ hourlyRateCents: 100 });

      const result = await service.update(lot.id, { hourlyRateCents: 999 });

      expect(result.hourlyRateCents).toBe(999);
    });

    it('throws LotNotFoundError when the lot is missing', async () => {
      await expect(service.update('nonexistent', { hourlyRateCents: 999 })).rejects.toThrow(LotNotFoundError);
    });

    it('throws LotNotFoundError when the lot is soft-deleted', async () => {
      const lot = db.seedLot({ status: 'deleted' });

      await expect(service.update(lot.id, { hourlyRateCents: 999 })).rejects.toThrow(LotNotFoundError);
    });
  });

  describe('remove', () => {
    it('soft-deletes the lot', async () => {
      const lot = db.seedLot();

      await service.remove(lot.id);

      expect(db.lots.get(lot.id)?.status).toBe('deleted');
    });

    it('throws LotNotFoundError when the lot is missing', async () => {
      await expect(service.remove('nonexistent')).rejects.toThrow(LotNotFoundError);
    });

    it('throws LotNotFoundError when the lot is already deleted', async () => {
      const lot = db.seedLot({ status: 'deleted' });

      await expect(service.remove(lot.id)).rejects.toThrow(LotNotFoundError);
    });
  });
});
