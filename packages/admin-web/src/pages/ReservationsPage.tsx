import { useState, type ChangeEvent, type FormEvent } from 'react';
import { Link, useNavigate, useSearchParams } from 'react-router-dom';
import type { ReservationStatus } from '@parking/shared';
import { Skeleton } from '../components/Skeleton';
import { useLots } from '../hooks/useLots';
import { useReservations } from '../hooks/useReservations';
import { formatCentsAsDollars, formatTimeRange } from '../lib/format';
import { filtersFromSearchParams, type ReservationFilters } from '../lib/reservations';
import './reservations.css';

const PAGE_SIZE = 25;
const STATUS_OPTIONS: ReservationStatus[] = ['active', 'completed', 'cancelled'];

export function ReservationsPage() {
  const [initialSearchParams] = useSearchParams();
  const navigate = useNavigate();

  const [filters, setFilters] = useState<ReservationFilters>(() => filtersFromSearchParams(initialSearchParams));
  const [searchInput, setSearchInput] = useState(filters.search ?? '');
  const [page, setPage] = useState(1);

  const lotsQuery = useLots();
  const reservationsQuery = useReservations(filters, { page, pageSize: PAGE_SIZE });

  function updateFilters(next: Partial<ReservationFilters>) {
    setFilters((prev) => ({ ...prev, ...next }));
    setPage(1);
  }

  function handleSearchSubmit(event: FormEvent) {
    event.preventDefault();
    updateFilters({ search: searchInput.trim() || undefined });
  }

  function handleLotChange(event: ChangeEvent<HTMLSelectElement>) {
    updateFilters({ lotId: event.target.value || undefined });
  }

  function handleStatusChange(event: ChangeEvent<HTMLSelectElement>) {
    const value = event.target.value;
    updateFilters({ status: (value || undefined) as ReservationStatus | undefined });
  }

  const rows = reservationsQuery.data?.rows ?? [];
  const total = reservationsQuery.data?.total ?? 0;
  const totalPages = Math.max(1, Math.ceil(total / PAGE_SIZE));

  return (
    <div className="reservations-page">
      <div className="reservations-page-header page-header">
        <h2>Reservations</h2>
      </div>

      <form className="reservations-filter-bar card" onSubmit={handleSearchSubmit}>
        <div className="form-field">
          <label htmlFor="filter-lot">Lot</label>
          <select id="filter-lot" value={filters.lotId ?? ''} onChange={handleLotChange}>
            <option value="">All lots</option>
            {(lotsQuery.data ?? []).map((lot) => (
              <option key={lot.id} value={lot.id}>
                {lot.name}
              </option>
            ))}
          </select>
        </div>

        <div className="form-field">
          <label htmlFor="filter-status">Status</label>
          <select id="filter-status" value={filters.status ?? ''} onChange={handleStatusChange}>
            <option value="">All statuses</option>
            {STATUS_OPTIONS.map((status) => (
              <option key={status} value={status}>
                {status}
              </option>
            ))}
          </select>
        </div>

        <div className="form-field">
          <label htmlFor="filter-from">From</label>
          <input
            id="filter-from"
            type="date"
            value={filters.from ?? ''}
            onChange={(e) => updateFilters({ from: e.target.value || undefined })}
          />
        </div>

        <div className="form-field">
          <label htmlFor="filter-to">To</label>
          <input
            id="filter-to"
            type="date"
            value={filters.to ?? ''}
            onChange={(e) => updateFilters({ to: e.target.value || undefined })}
          />
        </div>

        <div className="form-field">
          <label htmlFor="filter-search">Search</label>
          <input
            id="filter-search"
            placeholder="Reservation #, plate, name, email"
            value={searchInput}
            onChange={(e) => setSearchInput(e.target.value)}
          />
        </div>

        <div className="form-field reservations-active-now-field">
          <label htmlFor="filter-active-now">
            <input
              id="filter-active-now"
              type="checkbox"
              checked={filters.activeNow ?? false}
              onChange={(e) => updateFilters({ activeNow: e.target.checked || undefined })}
            />
            Active now
          </label>
        </div>

        <button type="submit" className="btn btn-primary">
          Search
        </button>
      </form>

      {reservationsQuery.isLoading && (
        <div className="results-skeleton" role="status" aria-label="Loading reservations…">
          <Skeleton height="2.75rem" />
          <Skeleton height="2.25rem" count={6} />
        </div>
      )}
      {reservationsQuery.isError && <p role="alert">Could not load reservations. Try again.</p>}

      {reservationsQuery.data && (
        <>
          <table className="reservations-table data-table">
            <thead>
              <tr>
                <th>Reservation #</th>
                <th>Lot</th>
                <th>Customer</th>
                <th>Plate</th>
                <th>Window</th>
                <th className="num">Cost</th>
                <th>Status</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((reservation) => (
                <tr
                  key={reservation.id}
                  className="reservations-table-row"
                  onClick={() => navigate(`/reservations/${reservation.id}`)}
                >
                  <td>
                    <Link to={`/reservations/${reservation.id}`} onClick={(e) => e.stopPropagation()}>
                      {reservation.reservationNumber}
                    </Link>
                  </td>
                  <td>{reservation.lotName}</td>
                  <td>{reservation.customerName}</td>
                  <td>{reservation.licensePlate}</td>
                  <td>{formatTimeRange(reservation.startTime, reservation.endTime)}</td>
                  <td className="num">{formatCentsAsDollars(reservation.totalCostCents)}</td>
                  <td>
                    <span className={`status-badge status-badge-${reservation.status}`}>{reservation.status}</span>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>

          {rows.length === 0 && <p className="reservations-table-empty">No reservations match these filters.</p>}

          <div className="pagination">
            <button
              type="button"
              className="btn btn-sm btn-secondary"
              disabled={page <= 1}
              onClick={() => setPage((p) => p - 1)}
            >
              Previous
            </button>
            <span className="pagination-summary">
              Page {page} of {totalPages} &middot; {total} results
            </span>
            <button
              type="button"
              className="btn btn-sm btn-secondary"
              disabled={page >= totalPages}
              onClick={() => setPage((p) => p + 1)}
            >
              Next
            </button>
          </div>
        </>
      )}
    </div>
  );
}
