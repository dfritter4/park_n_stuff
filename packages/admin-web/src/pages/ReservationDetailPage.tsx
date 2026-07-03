import { useState, type FormEvent } from 'react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { Link, useParams } from 'react-router-dom';
import type { AdminReservationDetail } from '@parking/shared';
import { apiFetch } from '../api/client';
import { ConfirmDialog } from '../components/ConfirmDialog';
import { RESERVATION_DETAIL_QUERY_KEY, useReservationDetail } from '../hooks/useReservations';
import { formatCentsAsDollars, formatDateTime, toDatetimeLocalInput } from '../lib/format';

export function ReservationDetailPage() {
  const { id } = useParams<{ id: string }>();
  const queryClient = useQueryClient();

  const detailQuery = useReservationDetail(id);
  const [isCancelling, setIsCancelling] = useState(false);
  const [isExtending, setIsExtending] = useState(false);
  const [newEndTime, setNewEndTime] = useState('');
  const [extendValidationError, setExtendValidationError] = useState<string | null>(null);

  function applyUpdatedDetail(detail: AdminReservationDetail) {
    if (id) {
      queryClient.setQueryData(RESERVATION_DETAIL_QUERY_KEY(id), detail);
    }
    return queryClient.invalidateQueries({ queryKey: ['admin', 'reservations'] });
  }

  const cancelMutation = useMutation({
    mutationFn: () => apiFetch<AdminReservationDetail>(`/api/admin/reservations/${id}/cancel`, { method: 'POST' }),
    onSuccess: async (detail) => {
      await applyUpdatedDetail(detail);
      setIsCancelling(false);
    },
  });

  const extendMutation = useMutation({
    mutationFn: (newEndTimeISO: string) =>
      apiFetch<AdminReservationDetail>(`/api/admin/reservations/${id}/extend`, {
        method: 'POST',
        body: JSON.stringify({ newEndTime: newEndTimeISO }),
      }),
    onSuccess: async (detail) => {
      await applyUpdatedDetail(detail);
      setIsExtending(false);
      setNewEndTime('');
    },
  });

  function openExtendModal() {
    if (detailQuery.data) {
      setNewEndTime(toDatetimeLocalInput(new Date(detailQuery.data.endTime)));
    }
    setExtendValidationError(null);
    extendMutation.reset();
    setIsExtending(true);
  }

  function handleExtendSubmit(event: FormEvent) {
    event.preventDefault();
    if (!detailQuery.data) {
      return;
    }
    const candidate = new Date(newEndTime);
    if (Number.isNaN(candidate.getTime())) {
      setExtendValidationError('Enter a valid date and time.');
      return;
    }
    if (candidate <= new Date(detailQuery.data.endTime)) {
      setExtendValidationError('New end time must be after the current end time.');
      return;
    }
    setExtendValidationError(null);
    extendMutation.mutate(candidate.toISOString());
  }

  if (detailQuery.isLoading) {
    return <p>Loading reservation…</p>;
  }

  if (detailQuery.isError || !detailQuery.data) {
    return <p role="alert">Could not load this reservation. Try again.</p>;
  }

  const reservation = detailQuery.data;
  const isActive = reservation.status === 'active';
  const minDatetimeLocal = toDatetimeLocalInput(new Date(reservation.endTime));

  return (
    <div className="reservation-detail-page">
      <div className="reservation-detail-header">
        <div>
          <Link to="/reservations">&larr; Back to reservations</Link>
          <h2>{reservation.reservationNumber}</h2>
        </div>
        {isActive && (
          <div className="reservation-detail-actions">
            <button type="button" onClick={openExtendModal}>
              Extend
            </button>
            <button
              type="button"
              className="danger-button"
              onClick={() => {
                cancelMutation.reset();
                setIsCancelling(true);
              }}
            >
              Cancel reservation
            </button>
          </div>
        )}
      </div>

      <section className="detail-card">
        <h3>Reservation</h3>
        <dl className="detail-grid">
          <div>
            <dt>Lot</dt>
            <dd>{reservation.lotName}</dd>
          </div>
          <div>
            <dt>Vehicle</dt>
            <dd>
              {reservation.vehicleMake} {reservation.vehicleModel} ({reservation.licensePlate})
            </dd>
          </div>
          <div>
            <dt>Window</dt>
            <dd>
              {formatDateTime(reservation.startTime)} &ndash; {formatDateTime(reservation.endTime)}
            </dd>
          </div>
          <div>
            <dt>Cost</dt>
            <dd>{formatCentsAsDollars(reservation.totalCostCents)}</dd>
          </div>
          <div>
            <dt>Status</dt>
            <dd>
              <span className={`status-badge status-badge-${reservation.status}`}>{reservation.status}</span>
            </dd>
          </div>
          <div>
            <dt>Created</dt>
            <dd>{formatDateTime(reservation.createdAt)}</dd>
          </div>
        </dl>
      </section>

      <section className="detail-card">
        <h3>Customer</h3>
        <dl className="detail-grid">
          <div>
            <dt>Name</dt>
            <dd>
              {reservation.customer.name}
              {reservation.customer.flagged && <span className="status-badge status-badge-flagged">Flagged</span>}
            </dd>
          </div>
          <div>
            <dt>Email</dt>
            <dd>{reservation.customer.email}</dd>
          </div>
          <div>
            <dt>Phone</dt>
            <dd>{reservation.customer.phone}</dd>
          </div>
        </dl>
      </section>

      <section className="detail-card">
        <h3>Payments</h3>
        {reservation.payments.length === 0 ? (
          <p className="reservations-table-empty">No payments on this reservation.</p>
        ) : (
          <table className="reservations-table">
            <thead>
              <tr>
                <th>Amount</th>
                <th>Status</th>
                <th>Card</th>
                <th>Transaction</th>
                <th>Date</th>
              </tr>
            </thead>
            <tbody>
              {reservation.payments.map((payment) => (
                <tr key={payment.transactionId}>
                  <td>{formatCentsAsDollars(payment.amountCents)}</td>
                  <td>
                    <span className={`status-badge status-badge-${payment.status}`}>{payment.status}</span>
                  </td>
                  <td>&bull;&bull;&bull;&bull; {payment.cardLast4}</td>
                  <td>{payment.transactionId}</td>
                  <td>{formatDateTime(payment.createdAt)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </section>

      {isCancelling && (
        <ConfirmDialog
          title="Cancel reservation"
          message={`Are you sure you want to cancel reservation ${reservation.reservationNumber}? Succeeded payments will be refunded.`}
          confirmLabel="Cancel reservation"
          isConfirming={cancelMutation.isPending}
          errorMessage={cancelMutation.error?.message}
          onConfirm={() => cancelMutation.mutate()}
          onCancel={() => {
            cancelMutation.reset();
            setIsCancelling(false);
          }}
        />
      )}

      {isExtending && (
        <div className="modal-backdrop" role="presentation">
          <div className="modal" role="dialog" aria-modal="true" aria-label="Extend reservation">
            <h2>Extend reservation</h2>
            <form onSubmit={handleExtendSubmit} noValidate>
              <div className="form-field">
                <label htmlFor="extend-new-end-time">New end time</label>
                <input
                  id="extend-new-end-time"
                  type="datetime-local"
                  value={newEndTime}
                  min={minDatetimeLocal}
                  onChange={(e) => setNewEndTime(e.target.value)}
                />
                {extendValidationError && <p className="form-error">{extendValidationError}</p>}
              </div>

              {extendMutation.error && (
                <p role="alert" className="form-error">
                  {extendMutation.error.message}
                </p>
              )}

              <div className="modal-actions">
                <button
                  type="button"
                  onClick={() => {
                    extendMutation.reset();
                    setIsExtending(false);
                  }}
                  disabled={extendMutation.isPending}
                >
                  Cancel
                </button>
                <button type="submit" disabled={extendMutation.isPending}>
                  {extendMutation.isPending ? 'Extending…' : 'Extend'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
