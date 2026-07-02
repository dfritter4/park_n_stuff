import { Link, useParams } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { QRCodeSVG } from 'qrcode.react';
import type { Reservation } from '@parking/shared';
import { apiFetch } from '../api/client';

function formatDateTime(iso: string): string {
  return new Date(iso).toLocaleString(undefined, {
    dateStyle: 'medium',
    timeStyle: 'short',
  });
}

export function ConfirmationPage() {
  const { reservationId } = useParams<{ reservationId: string }>();

  const reservationQuery = useQuery({
    queryKey: ['reservation', reservationId],
    queryFn: () => apiFetch<Reservation>(`/api/reservations/${reservationId}`),
    enabled: Boolean(reservationId),
  });

  if (reservationQuery.isLoading) {
    return (
      <div className="confirmation-page">
        <span className="sr-only" role="status">Loading your confirmation…</span>
        <div className="skeleton skeleton-line-title skeleton-line" style={{ margin: '0 auto 1rem' }} aria-hidden="true" />
        <div className="skeleton skeleton-block" style={{ width: 180, margin: '0 auto 1.25rem' }} aria-hidden="true" />
        <div className="skeleton skeleton-block" aria-hidden="true" />
      </div>
    );
  }

  if (reservationQuery.isError || !reservationQuery.data) {
    return (
      <div className="confirmation-page">
        <p role="alert">We couldn&apos;t find that reservation.</p>
        <Link to="/">Book another spot</Link>
      </div>
    );
  }

  const reservation = reservationQuery.data;
  const mapsUrl = `https://maps.google.com/?q=${encodeURIComponent(reservation.lotAddress)}`;

  return (
    <div className="confirmation-page">
      <div className="confirmation-badge" aria-hidden="true">
        ✓
      </div>
      <h1>You&apos;re all set!</h1>
      <p className="confirmation-subtitle">Show this at the lot, or keep it for your records.</p>

      <p className="confirmation-number">{reservation.reservationNumber}</p>
      <div className="confirmation-qr">
        <QRCodeSVG value={reservation.reservationNumber} size={180} />
      </div>

      <div className="confirmation-details">
        <h2>{reservation.lotName}</h2>
        <p>
          <a href={mapsUrl} target="_blank" rel="noreferrer">
            {reservation.lotAddress}
          </a>
        </p>
        <p className="confirmation-times">
          {formatDateTime(reservation.startTime)} – {formatDateTime(reservation.endTime)}
        </p>
        <p className="confirmation-total">Total: ${(reservation.totalCostCents / 100).toFixed(2)}</p>
      </div>

      <Link to="/" className="confirmation-home-button">
        Book another spot
      </Link>
    </div>
  );
}
