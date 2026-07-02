import type { Pool } from 'pg';
import type {
  AnalyticsRepository,
  DailyRevenuePoint,
  DashboardData,
  DashboardLotSnapshot,
  DashboardRecentReservation,
  DayBreakdownRow,
  DeclineDayPoint,
  DeclinesData,
  ExportReservationRow,
  ForecastPoint,
  HeatmapCell,
  HourlyOccupancyPoint,
  LotCompareRow,
  RecentDecline,
  WeekDayPoint,
  WeeklyCompareData,
} from '../../application/analyticsPorts.js';

/**
 * Owns all analytics SQL. All "today"/"now"/"day" semantics are computed by
 * Postgres against `now()` in UTC (see the AT TIME ZONE 'UTC' round-trips
 * below), not against application-clock time, so the numbers reflect the
 * database's own notion of the current instant.
 */
export class PostgresAnalyticsRepository implements AnalyticsRepository {
  constructor(private readonly pool: Pool) {}

  async getDashboardData(): Promise<DashboardData> {
    const [revenueToday, activeReservations, lots, recentReservations] = await Promise.all([
      this.getRevenueTodayCents(),
      this.getActiveReservationsCount(),
      this.getActiveLotSnapshots(),
      this.getRecentReservations(),
    ]);

    return {
      revenueTodayCents: revenueToday,
      activeReservations,
      lots,
      recentReservations,
    };
  }

  private async getRevenueTodayCents(): Promise<number> {
    const result = await this.pool.query<{ revenue_cents: string }>(
      `SELECT COALESCE(SUM(amount_cents), 0) AS revenue_cents
       FROM payments
       WHERE status = 'succeeded'
         AND (created_at AT TIME ZONE 'UTC')::date = (now() AT TIME ZONE 'UTC')::date`,
    );
    return Number(result.rows[0].revenue_cents);
  }

  private async getActiveReservationsCount(): Promise<number> {
    const result = await this.pool.query<{ count: string }>(
      `SELECT COUNT(*) AS count
       FROM reservations
       WHERE status = 'active' AND now() BETWEEN start_time AND end_time`,
    );
    return Number(result.rows[0].count);
  }

  private async getActiveLotSnapshots(): Promise<DashboardLotSnapshot[]> {
    const result = await this.pool.query<{
      lot_id: string;
      name: string;
      capacity: number;
      occupied: string;
      revenue_today_cents: string;
    }>(
      `SELECT
         lots.id AS lot_id,
         lots.name AS name,
         lots.capacity AS capacity,
         COALESCE(occ.occupied, 0) AS occupied,
         COALESCE(rev.revenue_today_cents, 0) AS revenue_today_cents
       FROM lots
       LEFT JOIN (
         SELECT lot_id, COUNT(*) AS occupied
         FROM reservations
         WHERE status = 'active' AND now() BETWEEN start_time AND end_time
         GROUP BY lot_id
       ) occ ON occ.lot_id = lots.id
       LEFT JOIN (
         SELECT reservations.lot_id, SUM(payments.amount_cents) AS revenue_today_cents
         FROM payments
         JOIN reservations ON reservations.id = payments.reservation_id
         WHERE payments.status = 'succeeded'
           AND (payments.created_at AT TIME ZONE 'UTC')::date = (now() AT TIME ZONE 'UTC')::date
         GROUP BY reservations.lot_id
       ) rev ON rev.lot_id = lots.id
       WHERE lots.status != 'deleted'
       ORDER BY lots.name`,
    );
    return result.rows.map((row) => ({
      lotId: row.lot_id,
      name: row.name,
      capacity: row.capacity,
      occupied: Number(row.occupied),
      revenueTodayCents: Number(row.revenue_today_cents),
    }));
  }

  private async getRecentReservations(): Promise<DashboardRecentReservation[]> {
    const result = await this.pool.query<{
      reservation_number: string;
      lot_name: string;
      start_time: Date;
      end_time: Date;
      total_cost_cents: number;
      created_at: Date;
    }>(
      `SELECT
         reservations.reservation_number,
         lots.name AS lot_name,
         reservations.start_time,
         reservations.end_time,
         reservations.total_cost_cents,
         reservations.created_at
       FROM reservations
       JOIN lots ON lots.id = reservations.lot_id
       ORDER BY reservations.created_at DESC
       LIMIT 10`,
    );
    return result.rows.map((row) => ({
      reservationNumber: row.reservation_number,
      lotName: row.lot_name,
      startTime: row.start_time,
      endTime: row.end_time,
      totalCostCents: row.total_cost_cents,
      createdAt: row.created_at,
    }));
  }

  async getDailyRevenue(days: number): Promise<DailyRevenuePoint[]> {
    // days.day is cast to text in the SELECT (not returned as a `date`) because node-postgres
    // parses the `date` OID into a JS Date at *local* midnight, which silently shifts the
    // calendar day when the process timezone isn't UTC.
    const result = await this.pool.query<{ day: string; revenue_cents: string; reservations: string }>(
      `WITH days AS (
         SELECT generate_series(
           (now() AT TIME ZONE 'UTC')::date - ($1::int - 1),
           (now() AT TIME ZONE 'UTC')::date,
           interval '1 day'
         )::date AS day
       )
       SELECT
         days.day::text AS day,
         COALESCE(rev.revenue_cents, 0) AS revenue_cents,
         COALESCE(rev.reservations, 0) AS reservations
       FROM days
       LEFT JOIN (
         SELECT
           (created_at AT TIME ZONE 'UTC')::date AS day,
           SUM(amount_cents) AS revenue_cents,
           COUNT(DISTINCT reservation_id) AS reservations
         FROM payments
         WHERE status = 'succeeded'
         GROUP BY 1
       ) rev ON rev.day = days.day
       ORDER BY days.day`,
      [days],
    );
    return result.rows.map((row) => ({
      date: row.day,
      revenueCents: Number(row.revenue_cents),
      reservations: Number(row.reservations),
    }));
  }

  async getHourlyOccupancy(): Promise<HourlyOccupancyPoint[]> {
    const result = await this.pool.query<{ hour_start: Date; occupancy_pct: string | number }>(
      `WITH hours AS (
         SELECT generate_series(
           (date_trunc('hour', now() AT TIME ZONE 'UTC') AT TIME ZONE 'UTC') - interval '167 hours',
           date_trunc('hour', now() AT TIME ZONE 'UTC') AT TIME ZONE 'UTC',
           interval '1 hour'
         ) AS hour_start
       ),
       capacity AS (
         SELECT COALESCE(SUM(capacity), 0) AS total_capacity FROM lots WHERE status != 'deleted'
       )
       SELECT
         hours.hour_start AS hour_start,
         CASE WHEN capacity.total_capacity = 0 THEN 0
           ELSE (COUNT(lots.id)::numeric / capacity.total_capacity) * 100
         END AS occupancy_pct
       FROM hours
       CROSS JOIN capacity
       LEFT JOIN reservations
         ON reservations.status IN ('active', 'completed')
         AND reservations.start_time < hours.hour_start + interval '1 hour'
         AND reservations.end_time > hours.hour_start
       LEFT JOIN lots ON lots.id = reservations.lot_id AND lots.status != 'deleted'
       GROUP BY hours.hour_start, capacity.total_capacity
       ORDER BY hours.hour_start`,
    );
    return result.rows.map((row) => ({
      date: formatDateFromUtcInstant(row.hour_start),
      hour: utcHourOf(row.hour_start),
      occupancyPct: Number(row.occupancy_pct),
    }));
  }

  async getDayBreakdown(date: string): Promise<DayBreakdownRow[]> {
    const result = await this.pool.query<{
      hour: number;
      reservations: string;
      revenue_cents: string;
      occupancy_pct: string | number;
    }>(
      `WITH bounds AS (
         SELECT ($1 || 'T00:00:00Z')::timestamptz AS day_start
       ),
       hours AS (
         SELECT generate_series(0, 23) AS hour
       ),
       day_reservations AS (
         SELECT
           EXTRACT(HOUR FROM (reservations.start_time AT TIME ZONE 'UTC'))::int AS hour,
           COUNT(*) AS reservations
         FROM reservations, bounds
         WHERE reservations.start_time >= bounds.day_start
           AND reservations.start_time < bounds.day_start + interval '1 day'
         GROUP BY 1
       ),
       day_revenue AS (
         SELECT
           EXTRACT(HOUR FROM (payments.created_at AT TIME ZONE 'UTC'))::int AS hour,
           SUM(payments.amount_cents) AS revenue_cents
         FROM payments, bounds
         WHERE payments.status = 'succeeded'
           AND payments.created_at >= bounds.day_start
           AND payments.created_at < bounds.day_start + interval '1 day'
         GROUP BY 1
       ),
       capacity AS (
         SELECT COALESCE(SUM(capacity), 0) AS total_capacity FROM lots WHERE status != 'deleted'
       ),
       day_occupancy AS (
         SELECT hours.hour AS hour, COUNT(lots.id) AS occupied_count
         FROM hours
         CROSS JOIN bounds
         LEFT JOIN reservations
           ON reservations.status IN ('active', 'completed')
           AND reservations.start_time < bounds.day_start + (hours.hour + 1) * interval '1 hour'
           AND reservations.end_time > bounds.day_start + hours.hour * interval '1 hour'
         LEFT JOIN lots ON lots.id = reservations.lot_id AND lots.status != 'deleted'
         GROUP BY hours.hour
       )
       SELECT
         hours.hour AS hour,
         COALESCE(day_reservations.reservations, 0) AS reservations,
         COALESCE(day_revenue.revenue_cents, 0) AS revenue_cents,
         CASE WHEN capacity.total_capacity = 0 THEN 0
           ELSE (day_occupancy.occupied_count::numeric / capacity.total_capacity) * 100
         END AS occupancy_pct
       FROM hours
       LEFT JOIN day_reservations ON day_reservations.hour = hours.hour
       LEFT JOIN day_revenue ON day_revenue.hour = hours.hour
       LEFT JOIN day_occupancy ON day_occupancy.hour = hours.hour
       CROSS JOIN capacity
       ORDER BY hours.hour`,
      [date],
    );
    return result.rows.map((row) => ({
      hour: row.hour,
      reservations: Number(row.reservations),
      revenueCents: Number(row.revenue_cents),
      occupancyPct: Number(row.occupancy_pct),
    }));
  }

  async getExportRows(): Promise<ExportReservationRow[]> {
    const result = await this.pool.query<{
      reservation_number: string;
      lot_name: string;
      start_time: Date;
      end_time: Date;
      status: 'active' | 'completed' | 'cancelled';
      total_cost_cents: number;
      created_at: Date;
    }>(
      `SELECT
         reservations.reservation_number,
         lots.name AS lot_name,
         reservations.start_time,
         reservations.end_time,
         reservations.status,
         reservations.total_cost_cents,
         reservations.created_at
       FROM reservations
       JOIN lots ON lots.id = reservations.lot_id
       ORDER BY reservations.created_at ASC`,
    );
    return result.rows.map((row) => ({
      reservationNumber: row.reservation_number,
      lotName: row.lot_name,
      startTime: row.start_time,
      endTime: row.end_time,
      status: row.status,
      totalCostCents: row.total_cost_cents,
      createdAt: row.created_at,
    }));
  }

  async getHeatmap(lotId: string | null): Promise<HeatmapCell[]> {
    return this.getDowHourOccupancyAverages(lotId);
  }

  /**
   * Mean occupancy per (UTC dow, UTC hour) over the last 30 days (720 hourly
   * buckets — always exactly 168 groups since every dow/hour combination
   * occurs at least 4 times in a 30-day window). Shared by getHeatmap and
   * getForecast so both project from the same historical average.
   */
  private async getDowHourOccupancyAverages(lotId: string | null): Promise<HeatmapCell[]> {
    const result = await this.pool.query<{ dow: number; hour: number; occupancy_pct: string | number }>(
      `WITH hours AS (
         SELECT generate_series(
           (date_trunc('hour', now() AT TIME ZONE 'UTC') AT TIME ZONE 'UTC') - interval '719 hours',
           date_trunc('hour', now() AT TIME ZONE 'UTC') AT TIME ZONE 'UTC',
           interval '1 hour'
         ) AS hour_start
       ),
       capacity AS (
         SELECT CASE WHEN $1::uuid IS NOT NULL
           THEN COALESCE((SELECT capacity FROM lots WHERE id = $1::uuid), 0)
           ELSE COALESCE((SELECT SUM(capacity) FROM lots WHERE status != 'deleted'), 0)
         END AS total_capacity
       ),
       occ AS (
         SELECT
           hours.hour_start AS hour_start,
           CASE WHEN capacity.total_capacity = 0 THEN 0
             ELSE (COUNT(reservations.id)::numeric / capacity.total_capacity) * 100
           END AS occupancy_pct
         FROM hours
         CROSS JOIN capacity
         LEFT JOIN reservations
           ON reservations.status IN ('active', 'completed')
           AND reservations.start_time < hours.hour_start + interval '1 hour'
           AND reservations.end_time > hours.hour_start
           AND ($1::uuid IS NULL OR reservations.lot_id = $1::uuid)
         LEFT JOIN lots ON lots.id = reservations.lot_id AND lots.status != 'deleted'
         GROUP BY hours.hour_start, capacity.total_capacity
       )
       SELECT
         EXTRACT(DOW FROM (occ.hour_start AT TIME ZONE 'UTC'))::int AS dow,
         EXTRACT(HOUR FROM (occ.hour_start AT TIME ZONE 'UTC'))::int AS hour,
         AVG(occ.occupancy_pct) AS occupancy_pct
       FROM occ
       GROUP BY 1, 2
       ORDER BY 1, 2`,
      [lotId],
    );
    return result.rows.map((row) => ({
      dow: row.dow,
      hour: row.hour,
      occupancyPct: Number(row.occupancy_pct),
    }));
  }

  async getWeeklyCompare(): Promise<WeeklyCompareData> {
    const result = await this.pool.query<{
      bucket: 'this_week' | 'last_week';
      day: string;
      revenue_cents: string;
      reservations: string;
    }>(
      `WITH bounds AS (
         SELECT (now() AT TIME ZONE 'UTC')::date AS today
       ),
       this_week_days AS (
         SELECT generate_series(bounds.today - 7, bounds.today - 1, interval '1 day')::date AS day
         FROM bounds
       ),
       last_week_days AS (
         SELECT generate_series(bounds.today - 14, bounds.today - 8, interval '1 day')::date AS day
         FROM bounds
       ),
       revenue AS (
         SELECT
           (created_at AT TIME ZONE 'UTC')::date AS day,
           SUM(amount_cents) AS revenue_cents,
           COUNT(DISTINCT reservation_id) AS reservations
         FROM payments
         WHERE status = 'succeeded'
         GROUP BY 1
       )
       SELECT 'this_week' AS bucket, this_week_days.day::text AS day,
         COALESCE(revenue.revenue_cents, 0) AS revenue_cents,
         COALESCE(revenue.reservations, 0) AS reservations
       FROM this_week_days
       LEFT JOIN revenue ON revenue.day = this_week_days.day
       UNION ALL
       SELECT 'last_week' AS bucket, last_week_days.day::text AS day,
         COALESCE(revenue.revenue_cents, 0) AS revenue_cents,
         COALESCE(revenue.reservations, 0) AS reservations
       FROM last_week_days
       LEFT JOIN revenue ON revenue.day = last_week_days.day
       ORDER BY bucket, day`,
    );
    const toPoint = (row: (typeof result.rows)[number]): WeekDayPoint => ({
      date: row.day,
      revenueCents: Number(row.revenue_cents),
      reservations: Number(row.reservations),
    });
    return {
      thisWeek: result.rows.filter((row) => row.bucket === 'this_week').map(toPoint),
      lastWeek: result.rows.filter((row) => row.bucket === 'last_week').map(toPoint),
    };
  }

  async getLotCompare(days: number): Promise<LotCompareRow[]> {
    const result = await this.pool.query<{
      lot_id: string;
      name: string;
      revenue_cents: string;
      reservations: string;
      avg_occupancy_pct: string | number;
    }>(
      `WITH bounds AS (
         SELECT date_trunc('hour', now() AT TIME ZONE 'UTC') AT TIME ZONE 'UTC' AS end_hour
       ),
       hours AS (
         SELECT generate_series(
           (SELECT end_hour FROM bounds) - (($1::int * 24) - 1) * interval '1 hour',
           (SELECT end_hour FROM bounds),
           interval '1 hour'
         ) AS hour_start
       ),
       window_bounds AS (
         SELECT MIN(hour_start) AS window_start, (SELECT end_hour FROM bounds) + interval '1 hour' AS window_end
         FROM hours
       ),
       lots_active AS (
         SELECT id AS lot_id, name, capacity FROM lots WHERE status != 'deleted'
       ),
       occ_counts AS (
         SELECT
           lots_active.lot_id AS lot_id,
           lots_active.capacity AS capacity,
           hours.hour_start AS hour_start,
           COUNT(reservations.id) AS occupied
         FROM lots_active
         CROSS JOIN hours
         LEFT JOIN reservations
           ON reservations.lot_id = lots_active.lot_id
           AND reservations.status IN ('active', 'completed')
           AND reservations.start_time < hours.hour_start + interval '1 hour'
           AND reservations.end_time > hours.hour_start
         GROUP BY lots_active.lot_id, lots_active.capacity, hours.hour_start
       ),
       occupancy_by_lot AS (
         SELECT
           lot_id,
           AVG(CASE WHEN capacity = 0 THEN 0 ELSE (occupied::numeric / capacity) * 100 END) AS avg_occupancy_pct
         FROM occ_counts
         GROUP BY lot_id
       ),
       revenue_by_lot AS (
         SELECT
           reservations.lot_id AS lot_id,
           SUM(payments.amount_cents) AS revenue_cents,
           COUNT(DISTINCT payments.reservation_id) AS reservations
         FROM payments
         JOIN reservations ON reservations.id = payments.reservation_id
         WHERE payments.status = 'succeeded'
           AND payments.created_at >= (SELECT window_start FROM window_bounds)
           AND payments.created_at < (SELECT window_end FROM window_bounds)
         GROUP BY reservations.lot_id
       )
       SELECT
         lots_active.lot_id AS lot_id,
         lots_active.name AS name,
         COALESCE(revenue_by_lot.revenue_cents, 0) AS revenue_cents,
         COALESCE(revenue_by_lot.reservations, 0) AS reservations,
         COALESCE(occupancy_by_lot.avg_occupancy_pct, 0) AS avg_occupancy_pct
       FROM lots_active
       LEFT JOIN revenue_by_lot ON revenue_by_lot.lot_id = lots_active.lot_id
       LEFT JOIN occupancy_by_lot ON occupancy_by_lot.lot_id = lots_active.lot_id
       ORDER BY lots_active.name`,
      [days],
    );
    return result.rows.map((row) => ({
      lotId: row.lot_id,
      name: row.name,
      revenueCents: Number(row.revenue_cents),
      reservations: Number(row.reservations),
      avgOccupancyPct: Number(row.avg_occupancy_pct),
    }));
  }

  async getForecast(lotId: string): Promise<ForecastPoint[]> {
    const [averages, today] = await Promise.all([this.getDowHourOccupancyAverages(lotId), this.getDbTodayUtc()]);
    const averageByDowHour = new Map(averages.map((cell) => [`${cell.dow}-${cell.hour}`, cell.occupancyPct]));

    const todayUtc = new Date(`${today}T00:00:00Z`);
    const points: ForecastPoint[] = [];
    for (let dayOffset = 1; dayOffset <= 7; dayOffset++) {
      const date = new Date(todayUtc.getTime() + dayOffset * 24 * 60 * 60 * 1000);
      const dateStr = formatDateFromUtcInstant(date);
      const dow = date.getUTCDay();
      for (let hour = 0; hour < 24; hour++) {
        points.push({
          date: dateStr,
          hour,
          projectedOccupancyPct: averageByDowHour.get(`${dow}-${hour}`) ?? 0,
        });
      }
    }
    return points;
  }

  /** The database's own notion of "today" as a UTC calendar date, YYYY-MM-DD. */
  private async getDbTodayUtc(): Promise<string> {
    const result = await this.pool.query<{ today: string }>(`SELECT (now() AT TIME ZONE 'UTC')::date::text AS today`);
    return result.rows[0].today;
  }

  async getDeclines(days: number): Promise<DeclinesData> {
    const [totalResult, byDayResult, recentResult] = await Promise.all([
      this.pool.query<{ total: string }>(
        `WITH bounds AS (
           SELECT ((((now() AT TIME ZONE 'UTC')::date - ($1::int - 1))::text || 'T00:00:00Z'))::timestamptz AS window_start
         )
         SELECT COUNT(*) AS total
         FROM declined_attempts, bounds
         WHERE declined_attempts.created_at >= bounds.window_start`,
        [days],
      ),
      this.pool.query<{ day: string; count: string; amount_cents: string }>(
        `WITH days AS (
           SELECT generate_series(
             (now() AT TIME ZONE 'UTC')::date - ($1::int - 1),
             (now() AT TIME ZONE 'UTC')::date,
             interval '1 day'
           )::date AS day
         )
         SELECT
           days.day::text AS day,
           COALESCE(d.count, 0) AS count,
           COALESCE(d.amount_cents, 0) AS amount_cents
         FROM days
         LEFT JOIN (
           SELECT
             (created_at AT TIME ZONE 'UTC')::date AS day,
             COUNT(*) AS count,
             SUM(amount_cents) AS amount_cents
           FROM declined_attempts
           GROUP BY 1
         ) d ON d.day = days.day
         ORDER BY days.day`,
        [days],
      ),
      this.pool.query<{ lot_name: string; amount_cents: number; card_last4: string; created_at: Date }>(
        `SELECT
           COALESCE(lots.name, 'Unknown Lot') AS lot_name,
           declined_attempts.amount_cents AS amount_cents,
           declined_attempts.card_last4 AS card_last4,
           declined_attempts.created_at AS created_at
         FROM declined_attempts
         LEFT JOIN lots ON lots.id = declined_attempts.lot_id
         ORDER BY declined_attempts.created_at DESC
         LIMIT 50`,
      ),
    ]);

    const byDay: DeclineDayPoint[] = byDayResult.rows.map((row) => ({
      date: row.day,
      count: Number(row.count),
      amountCents: Number(row.amount_cents),
    }));
    const recent: RecentDecline[] = recentResult.rows.map((row) => ({
      lotName: row.lot_name,
      amountCents: Number(row.amount_cents),
      cardLast4: row.card_last4,
      createdAt: row.created_at,
    }));

    return {
      total: Number(totalResult.rows[0].total),
      byDay,
      recent,
    };
  }
}

/** Formats a timestamptz instant as its UTC calendar date, YYYY-MM-DD. */
function formatDateFromUtcInstant(value: Date): string {
  return value.toISOString().slice(0, 10);
}

/** Extracts the UTC hour-of-day (0-23) from a timestamptz instant. */
function utcHourOf(value: Date): number {
  return value.getUTCHours();
}
