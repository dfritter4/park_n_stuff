import { useDashboard } from '../hooks/useDashboard';
import { MetricCard } from '../components/MetricCard';
import { LotGauge } from '../components/LotGauge';
import { ActivityFeed } from '../components/ActivityFeed';
import { Skeleton } from '../components/Skeleton';
import { formatCentsAsDollars, formatPercent1 } from '../lib/format';
import './dashboard.css';

export function DashboardPage() {
  const dashboardQuery = useDashboard();

  if (dashboardQuery.isLoading) {
    return (
      <div className="dashboard-page" role="status" aria-label="Loading dashboard">
        <section className="metric-cards">
          {Array.from({ length: 3 }, (_, i) => (
            <div key={i} className="card metric-card">
              <Skeleton height="0.7rem" width="55%" />
              <Skeleton height="1.7rem" width="80%" />
            </div>
          ))}
        </section>

        <section className="dashboard-section">
          <h2>Lots</h2>
          <div className="lot-gauge-grid">
            {Array.from({ length: 3 }, (_, i) => (
              <div key={i} className="lot-gauge dashboard-skeleton-lot-gauge">
                <Skeleton height="1rem" width="60%" />
                <Skeleton height="8px" width="100%" />
                <Skeleton height="0.85rem" width="45%" />
                <Skeleton height="0.85rem" width="35%" />
              </div>
            ))}
          </div>
        </section>

        <section className="dashboard-section">
          <h2>Recent activity</h2>
          <ul className="activity-feed">
            {Array.from({ length: 5 }, (_, i) => (
              <li key={i} className="dashboard-skeleton-activity-row">
                <Skeleton height="1rem" width="40%" />
                <Skeleton height="1rem" width="20%" />
              </li>
            ))}
          </ul>
        </section>
      </div>
    );
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
