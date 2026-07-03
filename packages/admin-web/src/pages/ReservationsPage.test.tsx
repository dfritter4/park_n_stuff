import { afterEach, describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { MemoryRouter } from 'react-router-dom';
import type { AdminReservation, AdminReservationListResponse, Lot } from '@parking/shared';
import { ReservationsPage } from './ReservationsPage';

function makeLot(overrides: Partial<Lot> = {}): Lot {
  return {
    id: 'lot-1',
    name: 'Loop Garage',
    address: '123 Main St',
    neighborhood: 'Loop',
    lat: 47.6062,
    lng: -122.3321,
    capacity: 100,
    hourlyRateCents: 850,
    status: 'active',
    availableSpaces: 40,
    createdAt: '2026-01-01T00:00:00.000Z',
    ...overrides,
  };
}

function makeReservation(overrides: Partial<AdminReservation> = {}): AdminReservation {
  return {
    id: 'res-1',
    reservationNumber: 'RES-0001',
    lotId: 'lot-1',
    lotName: 'Loop Garage',
    customerName: 'Jane Doe',
    vehicleMake: 'Toyota',
    vehicleModel: 'Camry',
    licensePlate: 'ABC123',
    startTime: '2026-07-01T10:00:00.000Z',
    endTime: '2026-07-01T12:00:00.000Z',
    totalCostCents: 1700,
    status: 'active',
    createdAt: '2026-07-01T09:00:00.000Z',
    ...overrides,
  };
}

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json' },
  });
}

function renderReservationsPage(queryClient: QueryClient, initialPath = '/reservations') {
  return render(
    <QueryClientProvider client={queryClient}>
      <MemoryRouter initialEntries={[initialPath]}>
        <ReservationsPage />
      </MemoryRouter>
    </QueryClientProvider>,
  );
}

function newQueryClient(): QueryClient {
  return new QueryClient({ defaultOptions: { queries: { retry: false }, mutations: { retry: false } } });
}

describe('ReservationsPage filters -> query string', () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('fetches with only pagination params when no filters are applied', async () => {
    const listResponse: AdminReservationListResponse = { rows: [makeReservation()], total: 1 };
    const fetchMock = vi.fn(async (input: RequestInfo | URL) => {
      const url = typeof input === 'string' ? input : input.toString();
      if (url === '/api/lots') {
        return jsonResponse([makeLot()]);
      }
      if (url.startsWith('/api/admin/reservations?')) {
        return jsonResponse(listResponse);
      }
      throw new Error(`Unhandled request: ${url}`);
    });
    vi.stubGlobal('fetch', fetchMock);

    renderReservationsPage(newQueryClient());

    await screen.findByText('RES-0001');

    const reservationsCall = fetchMock.mock.calls.find(([input]) =>
      (typeof input === 'string' ? input : input.toString()).startsWith('/api/admin/reservations?'),
    );
    expect(reservationsCall).toBeDefined();
    const calledUrl = new URL((reservationsCall![0] as string), 'http://localhost');
    expect(calledUrl.searchParams.get('page')).toBe('1');
    expect(calledUrl.searchParams.get('pageSize')).toBe('25');
    expect(calledUrl.searchParams.has('lotId')).toBe(false);
    expect(calledUrl.searchParams.has('status')).toBe(false);
    expect(calledUrl.searchParams.has('activeNow')).toBe(false);
  });

  it('seeds filters from the URL, matching LotsPage\'s "View current" link', async () => {
    const listResponse: AdminReservationListResponse = { rows: [], total: 0 };
    const fetchMock = vi.fn(async (input: RequestInfo | URL) => {
      const url = typeof input === 'string' ? input : input.toString();
      if (url === '/api/lots') {
        return jsonResponse([makeLot()]);
      }
      if (url.startsWith('/api/admin/reservations?')) {
        return jsonResponse(listResponse);
      }
      throw new Error(`Unhandled request: ${url}`);
    });
    vi.stubGlobal('fetch', fetchMock);

    renderReservationsPage(newQueryClient(), '/reservations?lotId=lot-1&activeNow=true');

    await waitFor(() => {
      const reservationsCall = fetchMock.mock.calls.find(([input]) =>
        (typeof input === 'string' ? input : input.toString()).startsWith('/api/admin/reservations?'),
      );
      expect(reservationsCall).toBeDefined();
      const calledUrl = new URL((reservationsCall![0] as string), 'http://localhost');
      expect(calledUrl.searchParams.get('lotId')).toBe('lot-1');
      expect(calledUrl.searchParams.get('activeNow')).toBe('true');
    });
  });

  it('re-fetches with lot, status and search params once filters are applied', async () => {
    const listResponse: AdminReservationListResponse = { rows: [makeReservation()], total: 1 };
    const fetchMock = vi.fn(async (input: RequestInfo | URL) => {
      const url = typeof input === 'string' ? input : input.toString();
      if (url === '/api/lots') {
        return jsonResponse([makeLot()]);
      }
      if (url.startsWith('/api/admin/reservations?')) {
        return jsonResponse(listResponse);
      }
      throw new Error(`Unhandled request: ${url}`);
    });
    vi.stubGlobal('fetch', fetchMock);

    renderReservationsPage(newQueryClient());

    await screen.findByText('RES-0001');
    await screen.findByRole('option', { name: 'Loop Garage' });

    fireEvent.change(screen.getByLabelText('Lot'), { target: { value: 'lot-1' } });
    fireEvent.change(screen.getByLabelText('Status'), { target: { value: 'active' } });
    fireEvent.change(screen.getByLabelText('Search'), { target: { value: 'Jane' } });
    fireEvent.click(screen.getByRole('button', { name: /search/i }));
    fireEvent.click(screen.getByLabelText('Active now'));

    await waitFor(() => {
      const calls = fetchMock.mock.calls.filter(([input]) =>
        (typeof input === 'string' ? input : input.toString()).startsWith('/api/admin/reservations?'),
      );
      const lastUrl = new URL(calls[calls.length - 1][0] as string, 'http://localhost');
      expect(lastUrl.searchParams.get('lotId')).toBe('lot-1');
      expect(lastUrl.searchParams.get('status')).toBe('active');
      expect(lastUrl.searchParams.get('search')).toBe('Jane');
      expect(lastUrl.searchParams.get('activeNow')).toBe('true');
      expect(lastUrl.searchParams.get('page')).toBe('1');
    });
  });
});
