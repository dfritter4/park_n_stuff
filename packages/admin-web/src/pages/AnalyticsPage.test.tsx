import { afterEach, describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import type {
  AnalyticsResponse,
  DayBreakdownResponse,
  DeclinesResponse,
  ForecastResponse,
  HeatmapResponse,
  Lot,
  LotCompareResponse,
  WeeklyCompareResponse,
} from '@parking/shared';
import { AnalyticsPage } from './AnalyticsPage';

function makeLot(overrides: Partial<Lot> = {}): Lot {
  return {
    id: 'lot-a',
    name: 'Loop Garage',
    address: '123 Main St',
    neighborhood: 'Loop',
    lat: 41.88,
    lng: -87.63,
    capacity: 100,
    hourlyRateCents: 850,
    status: 'active',
    availableSpaces: 40,
    createdAt: '2026-01-01T00:00:00.000Z',
    ...overrides,
  };
}

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json' },
  });
}

function newQueryClient(): QueryClient {
  return new QueryClient({ defaultOptions: { queries: { retry: false }, mutations: { retry: false } } });
}

function renderAnalyticsPage(queryClient: QueryClient) {
  return render(
    <QueryClientProvider client={queryClient}>
      <AnalyticsPage />
    </QueryClientProvider>,
  );
}

/** Finds the `<section>` ancestor of the heading with the given text (a `RegExp` matches loosely, e.g. ignoring an appended scope tag). */
async function findSection(headingText: string | RegExp): Promise<HTMLElement> {
  const heading = await screen.findByRole('heading', { name: headingText, level: 3 });
  const section = heading.closest('section');
  if (!section) {
    throw new Error(`No <section> ancestor found for heading "${headingText}"`);
  }
  return section as HTMLElement;
}

const lots = [makeLot({ id: 'lot-a', name: 'Loop Garage' }), makeLot({ id: 'lot-b', name: 'River North' })];

const analytics: AnalyticsResponse = { hourlyOccupancy: [], dailyRevenue: [] };
const dayBreakdown: DayBreakdownResponse = { rows: [] };
const heatmap: HeatmapResponse = { cells: [{ dow: 0, hour: 0, occupancyPct: 12.5 }] };
const weeklyCompare: WeeklyCompareResponse = {
  thisWeek: [{ date: '2026-06-29', revenueCents: 20000, reservations: 5 }],
  lastWeek: [{ date: '2026-06-22', revenueCents: 15000, reservations: 4 }],
};
const lotCompare: LotCompareResponse = {
  rows: [{ lotId: 'lot-a', name: 'Loop Garage', revenueCents: 500000, reservations: 120, avgOccupancyPct: 42.5 }],
};
const forecast: ForecastResponse = { points: [{ date: '2026-07-04', hour: 0, projectedOccupancyPct: 25 }] };
const declines: DeclinesResponse = {
  total: 3,
  byDay: [{ date: '2026-06-30', count: 3, amountCents: 4500 }],
  recent: [{ lotName: 'Loop Garage', amountCents: 1500, cardLast4: '4242', createdAt: '2026-06-30T12:00:00.000Z' }],
};

function stubFetch(): ReturnType<typeof vi.fn> {
  const fetchMock = vi.fn(async (input: RequestInfo | URL) => {
    const url = typeof input === 'string' ? input : input.toString();

    if (url === '/api/lots') return jsonResponse(lots);
    if (url.startsWith('/api/admin/analytics/day/')) return jsonResponse(dayBreakdown);
    if (url.startsWith('/api/admin/analytics?')) return jsonResponse(analytics);
    if (url.startsWith('/api/admin/analytics/heatmap')) return jsonResponse(heatmap);
    if (url.startsWith('/api/admin/analytics/weekly-compare')) return jsonResponse(weeklyCompare);
    if (url.startsWith('/api/admin/analytics/lot-compare')) return jsonResponse(lotCompare);
    if (url.startsWith('/api/admin/analytics/forecast')) return jsonResponse(forecast);
    if (url.startsWith('/api/admin/analytics/declines')) return jsonResponse(declines);

    throw new Error(`Unhandled request: ${url}`);
  });
  vi.stubGlobal('fetch', fetchMock);
  return fetchMock;
}

describe('AnalyticsPage', () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('defaults to All lots: analytics, day breakdown, and heatmap omit lotId, and the forecast shows its empty-state', async () => {
    const fetchMock = stubFetch();

    renderAnalyticsPage(newQueryClient());

    const select = await screen.findByLabelText('Lot');
    expect(select).toHaveValue('all');

    // Heatmap renders the fleet-wide cell.
    const heatmapSection = await findSection(/Occupancy heatmap/);
    await waitFor(() => {
      expect(within(heatmapSection).getByTitle('Sun 00:00 — 12.5%')).toBeInTheDocument();
    });

    // Forecast requires an explicit lot and never fetches while "All lots" is selected.
    await screen.findByText('Select a specific lot above to view its forecast.');

    // Fleet-wide sections render regardless of the lot selector.
    const weeklyCompareSection = await findSection(/This week vs last week revenue/);
    await waitFor(() => expect(within(weeklyCompareSection).queryByText('Loading…')).not.toBeInTheDocument());

    const lotCompareSection = await findSection(/Lot comparison/);
    await waitFor(() => {
      expect(within(lotCompareSection).getByText('Loop Garage')).toBeInTheDocument();
      expect(within(lotCompareSection).getByText('$5000.00')).toBeInTheDocument();
    });

    const declinesSection = await findSection(/Declined payments/);
    await waitFor(() => {
      expect(within(declinesSection).getByText('Declined attempts')).toBeInTheDocument();
      expect(declinesSection.querySelector('.metric-card-value')).toHaveTextContent('3');
    });

    await waitFor(() => {
      expect(fetchMock).toHaveBeenCalledWith('/api/admin/analytics?days=30', expect.anything());
      expect(fetchMock).toHaveBeenCalledWith(
        expect.stringMatching(/^\/api\/admin\/analytics\/day\/\d{4}-\d{2}-\d{2}$/),
        expect.anything(),
      );
      expect(fetchMock).toHaveBeenCalledWith('/api/admin/analytics/heatmap', expect.anything());
    });
    expect(fetchMock).not.toHaveBeenCalledWith(expect.stringContaining('/api/admin/analytics/forecast'), expect.anything());
    expect(fetchMock).not.toHaveBeenCalledWith(expect.stringContaining('lotId='), expect.anything());
  });

  it('selecting a lot scopes analytics, day breakdown, heatmap, and forecast fetch URLs to that lot', async () => {
    const fetchMock = stubFetch();

    renderAnalyticsPage(newQueryClient());

    const select = await screen.findByLabelText('Lot');
    await waitFor(() => expect(fetchMock).toHaveBeenCalledWith('/api/admin/analytics/heatmap', expect.anything()));

    fireEvent.change(select, { target: { value: 'lot-a' } });
    expect(select).toHaveValue('lot-a');

    await waitFor(() => {
      expect(fetchMock).toHaveBeenCalledWith('/api/admin/analytics?days=30&lotId=lot-a', expect.anything());
      expect(fetchMock).toHaveBeenCalledWith(
        expect.stringMatching(/^\/api\/admin\/analytics\/day\/\d{4}-\d{2}-\d{2}\?lotId=lot-a$/),
        expect.anything(),
      );
      expect(fetchMock).toHaveBeenCalledWith('/api/admin/analytics/heatmap?lotId=lot-a', expect.anything());
      expect(fetchMock).toHaveBeenCalledWith('/api/admin/analytics/forecast?lotId=lot-a', expect.anything());
    });

    const forecastSection = await findSection(/Occupancy forecast/);
    await waitFor(() => expect(within(forecastSection).queryByText('Loading…')).not.toBeInTheDocument());
    expect(screen.queryByText('Select a specific lot above to view its forecast.')).not.toBeInTheDocument();

    // Fleet-wide sections stay unscoped: only ever fetched once, without lotId.
    expect(fetchMock.mock.calls.filter(([input]) => String(input).startsWith('/api/admin/analytics/weekly-compare'))).toHaveLength(1);
    expect(fetchMock.mock.calls.filter(([input]) => String(input).startsWith('/api/admin/analytics/lot-compare'))).toHaveLength(1);
    expect(fetchMock.mock.calls.filter(([input]) => String(input).startsWith('/api/admin/analytics/declines'))).toHaveLength(1);
  });
});
