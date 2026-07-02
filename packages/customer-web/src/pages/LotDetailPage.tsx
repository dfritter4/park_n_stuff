import { Link, useNavigate, useParams } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import type { Lot } from '@parking/shared';
import { apiFetch } from '../api/client';
import { CapacityBar } from '../components/CapacityBar';

function formatRate(hourlyRateCents: number): string {
  return `$${(hourlyRateCents / 100).toFixed(2)}/hr`;
}

export function LotDetailPage() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();

  const lotQuery = useQuery({
    queryKey: ['lot', id],
    queryFn: () => apiFetch<Lot>(`/api/lots/${id}`),
    enabled: Boolean(id),
  });

  if (lotQuery.isLoading) {
    return (
      <div className="lot-detail-page">
        <span className="sr-only" role="status">Loading…</span>
        <div className="skeleton skeleton-line skeleton-line-short" aria-hidden="true" />
        <div className="skeleton skeleton-line-title skeleton-line" aria-hidden="true" />
        <div className="skeleton skeleton-line skeleton-line-short" aria-hidden="true" />
        <div className="skeleton skeleton-block" aria-hidden="true" />
      </div>
    );
  }

  if (lotQuery.isError || !lotQuery.data) {
    return (
      <div className="lot-detail-page">
        <p role="alert">Could not load this parking lot.</p>
        <Link to="/">Back to search</Link>
      </div>
    );
  }

  const lot = lotQuery.data;
  const reserveDisabled = lot.availableSpaces <= 0 || lot.status !== 'active';

  return (
    <div className="lot-detail-page">
      <Link to="/" className="back-link">
        ← Back to search
      </Link>

      <h1 className="lot-detail-name">{lot.name}</h1>
      <p className="lot-detail-neighborhood">{lot.neighborhood}</p>
      <p className="lot-detail-address">{lot.address}</p>

      <CapacityBar availableSpaces={lot.availableSpaces} capacity={lot.capacity} />

      <p className="lot-detail-rate">{formatRate(lot.hourlyRateCents)}</p>

      <button
        type="button"
        className="reserve-button"
        disabled={reserveDisabled}
        onClick={() => navigate(`/lots/${lot.id}/reserve`)}
      >
        {reserveDisabled ? 'Lot full' : 'Reserve a spot'}
      </button>
    </div>
  );
}
