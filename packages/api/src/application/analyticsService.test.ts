import { describe, expect, it } from 'vitest';
import { AnalyticsService } from './analyticsService.js';
import type {
  AnalyticsRepository,
  DashboardData,
  DayBreakdownRow,
  DeclinesData,
  ExportReservationRow,
  ForecastPoint,
  HeatmapCell,
  LotCompareRow,
  WeeklyCompareData,
} from './analyticsPorts.js';

class FakeAnalyticsRepository implements AnalyticsRepository {
  dashboardData: DashboardData = {
    revenueTodayCents: 0,
    activeReservations: 0,
    lots: [],
    recentReservations: [],
  };
  dailyRevenue: Awaited<ReturnType<AnalyticsRepository['getDailyRevenue']>> = [];
  hourlyOccupancy: Awaited<ReturnType<AnalyticsRepository['getHourlyOccupancy']>> = [];
  dayBreakdown: DayBreakdownRow[] = [];
  exportRows: ExportReservationRow[] = [];
  heatmapCells: HeatmapCell[] = [];
  weeklyCompareData: WeeklyCompareData = { thisWeek: [], lastWeek: [] };
  lotCompareRows: LotCompareRow[] = [];
  forecastPoints: ForecastPoint[] = [];
  declinesData: DeclinesData = { total: 0, byDay: [], recent: [] };
  requestedDays: number[] = [];
  requestedDates: string[] = [];
  requestedHeatmapLotIds: Array<string | null> = [];
  requestedLotCompareDays: number[] = [];
  requestedForecastLotIds: string[] = [];
  requestedDeclinesDays: number[] = [];
  requestedDailyRevenueLotIds: Array<string | null> = [];
  requestedHourlyOccupancyLotIds: Array<string | null> = [];
  requestedDayBreakdownLotIds: Array<string | null> = [];

  async getDashboardData(): Promise<DashboardData> {
    return this.dashboardData;
  }

  async getDailyRevenue(days: number, lotId: string | null) {
    this.requestedDays.push(days);
    this.requestedDailyRevenueLotIds.push(lotId);
    return this.dailyRevenue;
  }

  async getHourlyOccupancy(lotId: string | null) {
    this.requestedHourlyOccupancyLotIds.push(lotId);
    return this.hourlyOccupancy;
  }

  async getDayBreakdown(date: string, lotId: string | null) {
    this.requestedDates.push(date);
    this.requestedDayBreakdownLotIds.push(lotId);
    return this.dayBreakdown;
  }

  async getExportRows(): Promise<ExportReservationRow[]> {
    return this.exportRows;
  }

  async getHeatmap(lotId: string | null): Promise<HeatmapCell[]> {
    this.requestedHeatmapLotIds.push(lotId);
    return this.heatmapCells;
  }

  async getWeeklyCompare(): Promise<WeeklyCompareData> {
    return this.weeklyCompareData;
  }

  async getLotCompare(days: number): Promise<LotCompareRow[]> {
    this.requestedLotCompareDays.push(days);
    return this.lotCompareRows;
  }

  async getForecast(lotId: string): Promise<ForecastPoint[]> {
    this.requestedForecastLotIds.push(lotId);
    return this.forecastPoints;
  }

  async getDeclines(days: number): Promise<DeclinesData> {
    this.requestedDeclinesDays.push(days);
    return this.declinesData;
  }
}

describe('AnalyticsService', () => {
  describe('getDashboard', () => {
    it('maps repository data into the shared DashboardResponse shape with ISO timestamps', async () => {
      const repo = new FakeAnalyticsRepository();
      repo.dashboardData = {
        revenueTodayCents: 1300,
        activeReservations: 2,
        lots: [{ lotId: 'lot-a', name: 'Lot A', capacity: 10, occupied: 1, revenueTodayCents: 1000 }],
        recentReservations: [
          {
            reservationNumber: 'LOT-20260101-AAAAA',
            lotName: 'Lot A',
            startTime: new Date('2026-01-01T10:00:00.000Z'),
            endTime: new Date('2026-01-01T11:00:00.000Z'),
            totalCostCents: 1000,
            createdAt: new Date('2026-01-01T09:00:00.000Z'),
          },
        ],
      };
      const service = new AnalyticsService(repo);

      const result = await service.getDashboard();

      expect(result.revenueTodayCents).toBe(1300);
      expect(result.activeReservations).toBe(2);
      expect(result.lots).toEqual([
        { lotId: 'lot-a', name: 'Lot A', capacity: 10, occupied: 1, revenueTodayCents: 1000 },
      ]);
      expect(result.recentReservations).toEqual([
        {
          reservationNumber: 'LOT-20260101-AAAAA',
          lotName: 'Lot A',
          startTime: '2026-01-01T10:00:00.000Z',
          endTime: '2026-01-01T11:00:00.000Z',
          totalCostCents: 1000,
          createdAt: '2026-01-01T09:00:00.000Z',
        },
      ]);
    });

    it('computes averageOccupancyPct as the mean of occupied/capacity*100 across lots', async () => {
      const repo = new FakeAnalyticsRepository();
      repo.dashboardData = {
        revenueTodayCents: 0,
        activeReservations: 0,
        lots: [
          { lotId: 'lot-a', name: 'Lot A', capacity: 10, occupied: 1, revenueTodayCents: 0 }, // 10%
          { lotId: 'lot-b', name: 'Lot B', capacity: 4, occupied: 1, revenueTodayCents: 0 }, // 25%
        ],
        recentReservations: [],
      };
      const service = new AnalyticsService(repo);

      const result = await service.getDashboard();

      expect(result.averageOccupancyPct).toBe(17.5);
    });

    it('returns 0 averageOccupancyPct when there are no active lots', async () => {
      const repo = new FakeAnalyticsRepository();
      const service = new AnalyticsService(repo);

      const result = await service.getDashboard();

      expect(result.averageOccupancyPct).toBe(0);
    });
  });

  describe('getAnalytics', () => {
    it('passes the days parameter through to the repository and shapes the response', async () => {
      const repo = new FakeAnalyticsRepository();
      repo.dailyRevenue = [{ date: '2026-01-01', revenueCents: 500, reservations: 1 }];
      repo.hourlyOccupancy = [{ date: '2026-01-01', hour: 0, occupancyPct: 10 }];
      const service = new AnalyticsService(repo);

      const result = await service.getAnalytics(14);

      expect(repo.requestedDays).toEqual([14]);
      expect(result.dailyRevenue).toEqual([{ date: '2026-01-01', revenueCents: 500, reservations: 1 }]);
      expect(result.hourlyOccupancy).toEqual([{ date: '2026-01-01', hour: 0, occupancyPct: 10 }]);
    });

    it('passes null to getDailyRevenue and getHourlyOccupancy when no lotId is given', async () => {
      const repo = new FakeAnalyticsRepository();
      const service = new AnalyticsService(repo);

      await service.getAnalytics(14);

      expect(repo.requestedDailyRevenueLotIds).toEqual([null]);
      expect(repo.requestedHourlyOccupancyLotIds).toEqual([null]);
    });

    it('passes an explicit lotId through to getDailyRevenue and getHourlyOccupancy', async () => {
      const repo = new FakeAnalyticsRepository();
      const service = new AnalyticsService(repo);

      await service.getAnalytics(14, 'lot-a');

      expect(repo.requestedDailyRevenueLotIds).toEqual(['lot-a']);
      expect(repo.requestedHourlyOccupancyLotIds).toEqual(['lot-a']);
    });
  });

  describe('getDayBreakdown', () => {
    it('passes the date through and wraps rows', async () => {
      const repo = new FakeAnalyticsRepository();
      repo.dayBreakdown = [{ hour: 5, reservations: 2, revenueCents: 300, occupancyPct: 50 }];
      const service = new AnalyticsService(repo);

      const result = await service.getDayBreakdown('2026-01-01');

      expect(repo.requestedDates).toEqual(['2026-01-01']);
      expect(result.rows).toEqual([{ hour: 5, reservations: 2, revenueCents: 300, occupancyPct: 50 }]);
    });

    it('passes null to the repository when no lotId is given', async () => {
      const repo = new FakeAnalyticsRepository();
      const service = new AnalyticsService(repo);

      await service.getDayBreakdown('2026-01-01');

      expect(repo.requestedDayBreakdownLotIds).toEqual([null]);
    });

    it('passes an explicit lotId through to the repository', async () => {
      const repo = new FakeAnalyticsRepository();
      const service = new AnalyticsService(repo);

      await service.getDayBreakdown('2026-01-01', 'lot-a');

      expect(repo.requestedDayBreakdownLotIds).toEqual(['lot-a']);
    });
  });

  describe('exportReservationsCsv', () => {
    it('emits a header row plus one RFC4180 row per reservation, with dollars and ISO timestamps', async () => {
      const repo = new FakeAnalyticsRepository();
      repo.exportRows = [
        {
          reservationNumber: 'LOT-20260101-AAAAA',
          lotName: 'Downtown Lot',
          startTime: new Date('2026-01-01T10:00:00.000Z'),
          endTime: new Date('2026-01-01T11:00:00.000Z'),
          status: 'completed',
          totalCostCents: 1234,
          createdAt: new Date('2026-01-01T09:00:00.000Z'),
        },
      ];
      const service = new AnalyticsService(repo);

      const csv = await service.exportReservationsCsv();
      const lines = csv.split('\r\n');

      expect(lines[0]).toBe('reservation_number,lot_name,start_time,end_time,status,total_cost_usd,created_at');
      expect(lines[1]).toBe(
        'LOT-20260101-AAAAA,Downtown Lot,2026-01-01T10:00:00.000Z,2026-01-01T11:00:00.000Z,completed,12.34,2026-01-01T09:00:00.000Z',
      );
      expect(lines[2]).toBe('');
      expect(lines).toHaveLength(3);
    });

    it('quotes fields containing a comma, quote, or newline per RFC4180', async () => {
      const repo = new FakeAnalyticsRepository();
      repo.exportRows = [
        {
          reservationNumber: 'LOT-20260101-BBBBB',
          lotName: 'Downtown "Prime" Lot, West',
          startTime: new Date('2026-01-01T10:00:00.000Z'),
          endTime: new Date('2026-01-01T11:00:00.000Z'),
          status: 'active',
          totalCostCents: 100,
          createdAt: new Date('2026-01-01T09:00:00.000Z'),
        },
      ];
      const service = new AnalyticsService(repo);

      const csv = await service.exportReservationsCsv();
      const lines = csv.split('\r\n');

      expect(lines[1]).toBe(
        'LOT-20260101-BBBBB,"Downtown ""Prime"" Lot, West",2026-01-01T10:00:00.000Z,2026-01-01T11:00:00.000Z,active,1.00,2026-01-01T09:00:00.000Z',
      );
    });

    it('emits only the header row when there are no reservations', async () => {
      const repo = new FakeAnalyticsRepository();
      const service = new AnalyticsService(repo);

      const csv = await service.exportReservationsCsv();

      expect(csv).toBe('reservation_number,lot_name,start_time,end_time,status,total_cost_usd,created_at\r\n');
    });
  });

  describe('getHeatmap', () => {
    it('wraps repository cells and passes an explicit lotId through', async () => {
      const repo = new FakeAnalyticsRepository();
      repo.heatmapCells = [{ dow: 0, hour: 0, occupancyPct: 12.5 }];
      const service = new AnalyticsService(repo);

      const result = await service.getHeatmap('lot-a');

      expect(repo.requestedHeatmapLotIds).toEqual(['lot-a']);
      expect(result).toEqual({ cells: [{ dow: 0, hour: 0, occupancyPct: 12.5 }] });
    });

    it('passes null to the repository when no lotId is given', async () => {
      const repo = new FakeAnalyticsRepository();
      const service = new AnalyticsService(repo);

      await service.getHeatmap();

      expect(repo.requestedHeatmapLotIds).toEqual([null]);
    });
  });

  describe('getWeeklyCompare', () => {
    it('passes the repository shape through unchanged', async () => {
      const repo = new FakeAnalyticsRepository();
      repo.weeklyCompareData = {
        thisWeek: [{ date: '2026-06-30', revenueCents: 100, reservations: 1 }],
        lastWeek: [{ date: '2026-06-23', revenueCents: 200, reservations: 2 }],
      };
      const service = new AnalyticsService(repo);

      const result = await service.getWeeklyCompare();

      expect(result).toEqual(repo.weeklyCompareData);
    });
  });

  describe('getLotCompare', () => {
    it('passes days through and wraps rows', async () => {
      const repo = new FakeAnalyticsRepository();
      repo.lotCompareRows = [
        { lotId: 'lot-a', name: 'Lot A', revenueCents: 1000, reservations: 5, avgOccupancyPct: 20 },
      ];
      const service = new AnalyticsService(repo);

      const result = await service.getLotCompare(14);

      expect(repo.requestedLotCompareDays).toEqual([14]);
      expect(result).toEqual({ rows: repo.lotCompareRows });
    });
  });

  describe('getForecast', () => {
    it('passes lotId through and wraps points', async () => {
      const repo = new FakeAnalyticsRepository();
      repo.forecastPoints = [{ date: '2026-07-03', hour: 8, projectedOccupancyPct: 33.3 }];
      const service = new AnalyticsService(repo);

      const result = await service.getForecast('lot-a');

      expect(repo.requestedForecastLotIds).toEqual(['lot-a']);
      expect(result).toEqual({ points: repo.forecastPoints });
    });
  });

  describe('getDeclines', () => {
    it('passes days through and converts recent.createdAt to ISO strings', async () => {
      const repo = new FakeAnalyticsRepository();
      repo.declinesData = {
        total: 3,
        byDay: [{ date: '2026-07-01', count: 3, amountCents: 900 }],
        recent: [
          {
            lotName: 'Lot A',
            amountCents: 300,
            cardLast4: '4242',
            createdAt: new Date('2026-07-01T10:00:00.000Z'),
          },
        ],
      };
      const service = new AnalyticsService(repo);

      const result = await service.getDeclines(7);

      expect(repo.requestedDeclinesDays).toEqual([7]);
      expect(result).toEqual({
        total: 3,
        byDay: [{ date: '2026-07-01', count: 3, amountCents: 900 }],
        recent: [
          {
            lotName: 'Lot A',
            amountCents: 300,
            cardLast4: '4242',
            createdAt: '2026-07-01T10:00:00.000Z',
          },
        ],
      });
    });
  });
});
