import { beforeEach, describe, expect, it } from 'vitest';
import type { CreateLotRequest } from '@parking/shared';
import { LotService } from './lotService.js';
import { LotNotFoundError, ValidationError } from '../domain/errors.js';
import {
  FakeCapacityOverrideRepository,
  FakeClock,
  FakeLotRepository,
  FakePricingRuleRepository,
  InMemoryDatabase,
} from './testing/fakes.js';

describe('LotService', () => {
  let db: InMemoryDatabase;
  let clock: FakeClock;
  let service: LotService;

  beforeEach(() => {
    db = new InMemoryDatabase();
    clock = new FakeClock(new Date('2026-07-02T12:00:00.000Z'));
    service = new LotService(
      new FakeLotRepository(db),
      new FakeCapacityOverrideRepository(db),
      new FakePricingRuleRepository(db),
      clock,
    );
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

    it('reduces availableSpaces by a capacity override active right now', async () => {
      const lot = db.seedLot({ name: 'Overridden Lot', capacity: 10, status: 'active' });
      db.seedCapacityOverride(lot.id, {
        spacesClosed: 3,
        startsAt: new Date('2026-07-02T00:00:00.000Z'),
        endsAt: null,
      });

      const lots = await service.list();

      expect(lots[0]?.availableSpaces).toBe(7);
    });

    it('ignores a capacity override that is not active right now', async () => {
      const lot = db.seedLot({ name: 'Future Override Lot', capacity: 10, status: 'active' });
      db.seedCapacityOverride(lot.id, {
        spacesClosed: 3,
        startsAt: new Date('2026-07-03T00:00:00.000Z'),
        endsAt: null,
      });

      const lots = await service.list();

      expect(lots[0]?.availableSpaces).toBe(10);
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

  describe('quote', () => {
    it('prices the window using the lot base rate plus its pricing rules', async () => {
      const lot = db.seedLot({ hourlyRateCents: 500 });
      db.seedPricingRule(lot.id, { dayType: 'all', startHour: 10, endHour: 11, hourlyRateCents: 800 });

      const result = await service.quote(
        lot.id,
        new Date('2026-07-02T10:00:00.000Z'),
        new Date('2026-07-02T12:00:00.000Z'),
      );

      expect(result.totalCostCents).toBe(1300);
      expect(result.billedHours).toBe(2);
    });

    it('throws LotNotFoundError for an unknown lot', async () => {
      await expect(
        service.quote('nonexistent', new Date('2026-07-02T10:00:00.000Z'), new Date('2026-07-02T12:00:00.000Z')),
      ).rejects.toThrow(LotNotFoundError);
    });

    it('throws ValidationError when endTime is not after startTime', async () => {
      const lot = db.seedLot({ hourlyRateCents: 500 });

      await expect(
        service.quote(lot.id, new Date('2026-07-02T12:00:00.000Z'), new Date('2026-07-02T10:00:00.000Z')),
      ).rejects.toThrow(ValidationError);
    });
  });
});
