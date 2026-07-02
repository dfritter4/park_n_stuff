import type { Pool } from 'pg';
import type {
  AnalyticsRepository,
  DailyRevenuePoint,
  DashboardData,
  DashboardLotSnapshot,
  DashboardRecentReservation,
  DayBreakdownRow,
  ExportReservationRow,
  HourlyOccupancyPoint,
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
       WHERE lots.status = 'active'
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
           ELSE (COUNT(reservations.id)::numeric / capacity.total_capacity) * 100
         END AS occupancy_pct
       FROM hours
       CROSS JOIN capacity
       LEFT JOIN reservations
         ON reservations.status IN ('active', 'completed')
         AND reservations.start_time < hours.hour_start + interval '1 hour'
         AND reservations.end_time > hours.hour_start
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
         SELECT hours.hour AS hour, COUNT(reservations.id) AS occupied_count
         FROM hours
         CROSS JOIN bounds
         LEFT JOIN reservations
           ON reservations.status IN ('active', 'completed')
           AND reservations.start_time < bounds.day_start + (hours.hour + 1) * interval '1 hour'
           AND reservations.end_time > bounds.day_start + hours.hour * interval '1 hour'
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
}

/** Formats a timestamptz instant as its UTC calendar date, YYYY-MM-DD. */
function formatDateFromUtcInstant(value: Date): string {
  return value.toISOString().slice(0, 10);
}

/** Extracts the UTC hour-of-day (0-23) from a timestamptz instant. */
function utcHourOf(value: Date): number {
  return value.getUTCHours();
}
