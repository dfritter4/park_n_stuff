import { useEffect, useState } from 'react';
import { apiFetchBlob } from '../api/client';
import { useAnalytics, useDayBreakdown } from '../hooks/useAnalytics';
import { useDeclines, useForecast, useHeatmap, useLotCompare, useWeeklyCompare } from '../hooks/useAnalytics2';
import { useLots } from '../hooks/useLots';
import { OccupancyLineChart } from '../components/charts/OccupancyLineChart';
import { RevenueBarChart } from '../components/charts/RevenueBarChart';
import { DayBreakdownTable } from '../components/DayBreakdownTable';
import { LotSelector } from '../components/analytics2/LotSelector';
import { OccupancyHeatmap } from '../components/analytics2/OccupancyHeatmap';
import { WeeklyCompareChart } from '../components/analytics2/WeeklyCompareChart';
import { LotCompareTable } from '../components/analytics2/LotCompareTable';
import { ForecastChart } from '../components/analytics2/ForecastChart';
import { DeclinesSection } from '../components/analytics2/DeclinesSection';
import { todayDateString } from '../lib/format';
import './analytics2.css';

const ALL_LOTS_VALUE = 'all';

export function AnalyticsPage() {
  const [selectedDate, setSelectedDate] = useState(() => todayDateString());
  const [isExporting, setIsExporting] = useState(false);
  const [exportError, setExportError] = useState<string | null>(null);
  const [selectedLotId, setSelectedLotId] = useState<string>(ALL_LOTS_VALUE);

  const analyticsQuery = useAnalytics();
  const dayBreakdownQuery = useDayBreakdown(selectedDate);
  const lotsQuery = useLots();

  // Default the shared lot selector to the first lot once lots load, so the
  // forecast chart (which requires a specific lot) has data to show right away.
  useEffect(() => {
    if (selectedLotId === ALL_LOTS_VALUE && lotsQuery.data && lotsQuery.data.length > 0) {
      setSelectedLotId(lotsQuery.data[0].id);
    }
  }, [lotsQuery.data, selectedLotId]);

  const heatmapLotId = selectedLotId === ALL_LOTS_VALUE ? undefined : selectedLotId;
  const forecastLotId = selectedLotId === ALL_LOTS_VALUE ? undefined : selectedLotId;

  const heatmapQuery = useHeatmap(heatmapLotId);
  const weeklyCompareQuery = useWeeklyCompare();
  const lotCompareQuery = useLotCompare();
  const forecastQuery = useForecast(forecastLotId);
  const declinesQuery = useDeclines();

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

      <section className="analytics-section">
        <h3>Lot</h3>
        {lotsQuery.data && (
          <LotSelector
            id="analytics2-lot-selector"
            label="Lot"
            lots={lotsQuery.data}
            value={selectedLotId}
            onChange={setSelectedLotId}
            includeAllOption
          />
        )}
        {lotsQuery.isError && <p role="alert">Could not load lots. Try again.</p>}
      </section>

      <section className="analytics-section">
        <h3>Occupancy heatmap (last 30 days{heatmapLotId ? '' : ', all lots'})</h3>
        {heatmapQuery.isLoading && <p>Loading…</p>}
        {heatmapQuery.isError && <p role="alert">Could not load the heatmap. Try again.</p>}
        {heatmapQuery.data && <OccupancyHeatmap cells={heatmapQuery.data.cells} />}
      </section>

      <section className="analytics-section">
        <h3>This week vs last week revenue</h3>
        {weeklyCompareQuery.isLoading && <p>Loading…</p>}
        {weeklyCompareQuery.isError && <p role="alert">Could not load the weekly comparison. Try again.</p>}
        {weeklyCompareQuery.data && <WeeklyCompareChart data={weeklyCompareQuery.data} />}
      </section>

      <section className="analytics-section">
        <h3>Lot comparison (last 30 days)</h3>
        {lotCompareQuery.isLoading && <p>Loading…</p>}
        {lotCompareQuery.isError && <p role="alert">Could not load the lot comparison. Try again.</p>}
        {lotCompareQuery.data && <LotCompareTable rows={lotCompareQuery.data.rows} />}
      </section>

      <section className="analytics-section">
        <h3>Occupancy forecast (next 7 days)</h3>
        {!forecastLotId && <p>Select a specific lot above to view its forecast.</p>}
        {forecastLotId && forecastQuery.isLoading && <p>Loading…</p>}
        {forecastLotId && forecastQuery.isError && <p role="alert">Could not load the forecast. Try again.</p>}
        {forecastLotId && forecastQuery.data && <ForecastChart points={forecastQuery.data.points} />}
      </section>

      <section className="analytics-section">
        <h3>Declined payments (last 30 days)</h3>
        {declinesQuery.isLoading && <p>Loading…</p>}
        {declinesQuery.isError && <p role="alert">Could not load declines. Try again.</p>}
        {declinesQuery.data && <DeclinesSection data={declinesQuery.data} />}
      </section>
    </div>
  );
}
