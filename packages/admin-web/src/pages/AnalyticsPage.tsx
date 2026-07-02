import { useState } from 'react';
import { apiFetchBlob } from '../api/client';
import { useAnalytics, useDayBreakdown } from '../hooks/useAnalytics';
import { OccupancyLineChart } from '../components/charts/OccupancyLineChart';
import { RevenueBarChart } from '../components/charts/RevenueBarChart';
import { DayBreakdownTable } from '../components/DayBreakdownTable';
import { todayDateString } from '../lib/format';

export function AnalyticsPage() {
  const [selectedDate, setSelectedDate] = useState(() => todayDateString());
  const [isExporting, setIsExporting] = useState(false);
  const [exportError, setExportError] = useState<string | null>(null);

  const analyticsQuery = useAnalytics();
  const dayBreakdownQuery = useDayBreakdown(selectedDate);

  async function handleExport() {
    setIsExporting(true);
    setExportError(null);
    try {
      const blob = await apiFetchBlob('/api/admin/analytics/export');
      const url = URL.createObjectURL(blob);
      const anchor = document.createElement('a');
      anchor.href = url;
      anchor.download = 'reservations.csv';
      document.body.appendChild(anchor);
      anchor.click();
      anchor.remove();
      URL.revokeObjectURL(url);
    } catch {
      setExportError('Could not export CSV. Try again.');
    } finally {
      setIsExporting(false);
    }
  }

  return (
    <div className="analytics-page">
      <div className="analytics-page-header">
        <h2>Analytics</h2>
        <div>
          <button type="button" onClick={handleExport} disabled={isExporting}>
            {isExporting ? 'Exporting…' : 'Export CSV'}
          </button>
          {exportError && <p role="alert">{exportError}</p>}
        </div>
      </div>

      <section className="analytics-section">
        <h3>Hourly occupancy (last 7 days)</h3>
        {analyticsQuery.isLoading && <p>Loading…</p>}
        {analyticsQuery.isError && <p role="alert">Could not load analytics. Try again.</p>}
        {analyticsQuery.data && <OccupancyLineChart hourlyOccupancy={analyticsQuery.data.hourlyOccupancy} />}
      </section>

      <section className="analytics-section">
        <h3>Daily revenue (last 30 days)</h3>
        {analyticsQuery.isLoading && <p>Loading…</p>}
        {analyticsQuery.isError && <p role="alert">Could not load analytics. Try again.</p>}
        {analyticsQuery.data && <RevenueBarChart dailyRevenue={analyticsQuery.data.dailyRevenue} />}
      </section>

      <section className="analytics-section">
        <h3>Day breakdown</h3>
        <label htmlFor="analytics-day-picker">Date</label>
        <input
          id="analytics-day-picker"
          type="date"
          value={selectedDate}
          onChange={(e) => setSelectedDate(e.target.value)}
        />
        {dayBreakdownQuery.isLoading && <p>Loading…</p>}
        {dayBreakdownQuery.isError && <p role="alert">Could not load the day breakdown. Try again.</p>}
        {dayBreakdownQuery.data && <DayBreakdownTable rows={dayBreakdownQuery.data.rows} />}
      </section>
    </div>
  );
}
