import { useDashboard } from '../hooks/useDashboard';
import { MetricCard } from '../components/MetricCard';
import { LotGauge } from '../components/LotGauge';
import { ActivityFeed } from '../components/ActivityFeed';
import { formatCentsAsDollars, formatPercent1 } from '../lib/format';

export function DashboardPage() {
  const dashboardQuery = useDashboard();

  if (dashboardQuery.isLoading) {
    return <p>Loading dashboard…</p>;
  }

  if (dashboardQuery.isError) {
    return <p role="alert">Could not load the dashboard. Try again.</p>;
  }

  const dashboard = dashboardQuery.data;
  if (!dashboard) {
    return null;
  }

  return (
    <div className="dashboard-page">
      <section className="metric-cards">
        <MetricCard label="Revenue today" value={formatCentsAsDollars(dashboard.revenueTodayCents)} />
        <MetricCard label="Active reservations" value={String(dashboard.activeReservations)} />
        <MetricCard label="Average occupancy" value={formatPercent1(dashboard.averageOccupancyPct)} />
      </section>

      <section className="dashboard-section">
        <h2>Lots</h2>
        <div className="lot-gauge-grid">
          {dashboard.lots.map((lot) => (
            <LotGauge
              key={lot.lotId}
              name={lot.name}
              capacity={lot.capacity}
              occupied={lot.occupied}
              revenueTodayCents={lot.revenueTodayCents}
            />
          ))}
        </div>
      </section>

      <section className="dashboard-section">
        <h2>Recent activity</h2>
        <ActivityFeed reservations={dashboard.recentReservations} />
      </section>
    </div>
  );
}
