import type {
  AnalyticsResponse,
  DashboardResponse,
  DayBreakdownResponse,
  DeclinesResponse,
  ForecastResponse,
  HeatmapResponse,
  LotCompareResponse,
  WeeklyCompareResponse,
} from '@parking/shared';
import type { AnalyticsRepository, ExportReservationRow } from './analyticsPorts.js';

const CSV_HEADER = 'reservation_number,lot_name,start_time,end_time,status,total_cost_usd,created_at';

/** Quotes a CSV field per RFC4180 when it contains a comma, quote, or newline. */
function csvField(value: string): string {
  if (/[",\n\r]/.test(value)) {
    return `"${value.replace(/"/g, '""')}"`;
  }
  return value;
}

function centsToDollarsString(cents: number): string {
  return (cents / 100).toFixed(2);
}

function toCsvRow(row: ExportReservationRow): string {
  return [
    row.reservationNumber,
    row.lotName,
    row.startTime.toISOString(),
    row.endTime.toISOString(),
    row.status,
    centsToDollarsString(row.totalCostCents),
    row.createdAt.toISOString(),
  ]
    .map(csvField)
    .join(',');
}

export class AnalyticsService {
  constructor(private readonly repository: AnalyticsRepository) {}

  async getDashboard(): Promise<DashboardResponse> {
    const data = await this.repository.getDashboardData();

    const averageOccupancyPct =
      data.lots.length === 0
        ? 0
        : data.lots.reduce((sum, lot) => sum + (lot.occupied / lot.capacity) * 100, 0) / data.lots.length;

    return {
      revenueTodayCents: data.revenueTodayCents,
      activeReservations: data.activeReservations,
      averageOccupancyPct,
      lots: data.lots.map((lot) => ({
        lotId: lot.lotId,
        name: lot.name,
        capacity: lot.capacity,
        occupied: lot.occupied,
        revenueTodayCents: lot.revenueTodayCents,
      })),
      recentReservations: data.recentReservations.map((r) => ({
        reservationNumber: r.reservationNumber,
        lotName: r.lotName,
        startTime: r.startTime.toISOString(),
        endTime: r.endTime.toISOString(),
        totalCostCents: r.totalCostCents,
        createdAt: r.createdAt.toISOString(),
      })),
    };
  }

  async getAnalytics(days: number): Promise<AnalyticsResponse> {
    const [dailyRevenue, hourlyOccupancy] = await Promise.all([
      this.repository.getDailyRevenue(days),
      this.repository.getHourlyOccupancy(),
    ]);

    return { dailyRevenue, hourlyOccupancy };
  }

  async getDayBreakdown(date: string): Promise<DayBreakdownResponse> {
    const rows = await this.repository.getDayBreakdown(date);
    return { rows };
  }

  async exportReservationsCsv(): Promise<string> {
    const rows = await this.repository.getExportRows();
    const lines = [CSV_HEADER, ...rows.map(toCsvRow)];
    return lines.join('\r\n') + '\r\n';
  }

  async getHeatmap(lotId?: string): Promise<HeatmapResponse> {
    const cells = await this.repository.getHeatmap(lotId ?? null);
    return { cells };
  }

  async getWeeklyCompare(): Promise<WeeklyCompareResponse> {
    return this.repository.getWeeklyCompare();
  }

  async getLotCompare(days: number): Promise<LotCompareResponse> {
    const rows = await this.repository.getLotCompare(days);
    return { rows };
  }

  async getForecast(lotId: string): Promise<ForecastResponse> {
    const points = await this.repository.getForecast(lotId);
    return { points };
  }

  async getDeclines(days: number): Promise<DeclinesResponse> {
    const data = await this.repository.getDeclines(days);
    return {
      total: data.total,
      byDay: data.byDay,
      recent: data.recent.map((decline) => ({
        lotName: decline.lotName,
        amountCents: decline.amountCents,
        cardLast4: decline.cardLast4,
        createdAt: decline.createdAt.toISOString(),
      })),
    };
  }
}
