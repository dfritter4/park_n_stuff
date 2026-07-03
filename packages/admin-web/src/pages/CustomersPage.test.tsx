import { afterEach, describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { MemoryRouter } from 'react-router-dom';
import type { AdminCustomer, AdminCustomerListResponse } from '@parking/shared';
import { CustomersPage } from './CustomersPage';

function makeCustomer(overrides: Partial<AdminCustomer> = {}): AdminCustomer {
  return {
    id: '11111111-1111-1111-1111-111111111111',
    name: 'Jane Doe',
    email: 'jane@example.com',
    phone: '555-0100',
    flagged: false,
    flagReason: null,
    reservationCount: 3,
    lifetimeSpendCents: 4500,
    ...overrides,
  };
}

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json' },
  });
}

function renderCustomersPage(queryClient: QueryClient) {
  return render(
    <QueryClientProvider client={queryClient}>
      <MemoryRouter>
        <CustomersPage />
      </MemoryRouter>
    </QueryClientProvider>,
  );
}

function newQueryClient(): QueryClient {
  return new QueryClient({ defaultOptions: { queries: { retry: false }, mutations: { retry: false } } });
}

describe('CustomersPage search -> query string', () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('fetches with only pagination params when no search is applied', async () => {
    const listResponse: AdminCustomerListResponse = { rows: [makeCustomer()], total: 1 };
    const fetchMock = vi.fn(async (input: RequestInfo | URL) => {
      const url = typeof input === 'string' ? input : input.toString();
      if (url.startsWith('/api/admin/customers?')) {
        return jsonResponse(listResponse);
      }
      throw new Error(`Unhandled request: ${url}`);
    });
    vi.stubGlobal('fetch', fetchMock);

    renderCustomersPage(newQueryClient());

    await screen.findByText('Jane Doe');

    const customersCall = fetchMock.mock.calls.find(([input]) =>
      (typeof input === 'string' ? input : input.toString()).startsWith('/api/admin/customers?'),
    );
    expect(customersCall).toBeDefined();
    const calledUrl = new URL(customersCall![0] as string, 'http://localhost');
    expect(calledUrl.searchParams.get('page')).toBe('1');
    expect(calledUrl.searchParams.get('pageSize')).toBe('25');
    expect(calledUrl.searchParams.has('search')).toBe(false);

    expect(screen.getByText('jane@example.com')).toBeInTheDocument();
    expect(screen.getByText('$45.00')).toBeInTheDocument();
  });

  it('re-fetches with the search param once a search is submitted, and resets to page 1', async () => {
    const listResponse: AdminCustomerListResponse = { rows: [makeCustomer()], total: 1 };
    const fetchMock = vi.fn(async (input: RequestInfo | URL) => {
      const url = typeof input === 'string' ? input : input.toString();
      if (url.startsWith('/api/admin/customers?')) {
        return jsonResponse(listResponse);
      }
      throw new Error(`Unhandled request: ${url}`);
    });
    vi.stubGlobal('fetch', fetchMock);

    renderCustomersPage(newQueryClient());

    await screen.findByText('Jane Doe');

    fireEvent.change(screen.getByLabelText('Search'), { target: { value: 'Jane' } });
    fireEvent.click(screen.getByRole('button', { name: /search/i }));

    await waitFor(() => {
      const calls = fetchMock.mock.calls.filter(([input]) =>
        (typeof input === 'string' ? input : input.toString()).startsWith('/api/admin/customers?'),
      );
      const lastUrl = new URL(calls[calls.length - 1][0] as string, 'http://localhost');
      expect(lastUrl.searchParams.get('search')).toBe('Jane');
      expect(lastUrl.searchParams.get('page')).toBe('1');
    });
  });

  it('shows a flagged badge for flagged customers', async () => {
    const listResponse: AdminCustomerListResponse = {
      rows: [makeCustomer({ id: 'c2', name: 'Bad Actor', flagged: true, flagReason: 'Chargeback abuse' })],
      total: 1,
    };
    const fetchMock = vi.fn(async (input: RequestInfo | URL) => {
      const url = typeof input === 'string' ? input : input.toString();
      if (url.startsWith('/api/admin/customers?')) {
        return jsonResponse(listResponse);
      }
      throw new Error(`Unhandled request: ${url}`);
    });
    vi.stubGlobal('fetch', fetchMock);

    renderCustomersPage(newQueryClient());

    await screen.findByText('Bad Actor');
    const row = screen.getByText('Bad Actor').closest('tr');
    expect(row).not.toBeNull();
    expect(row).toHaveTextContent('Flagged');
  });
});
