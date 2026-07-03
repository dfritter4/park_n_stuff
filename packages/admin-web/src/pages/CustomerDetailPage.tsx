import { useState, type FormEvent } from 'react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { Link, useParams } from 'react-router-dom';
import type { AdminCustomerDetail } from '@parking/shared';
import { apiFetch } from '../api/client';
import { ConfirmDialog } from '../components/ConfirmDialog';
import { Skeleton } from '../components/Skeleton';
import { CUSTOMERS_QUERY_KEY, CUSTOMER_DETAIL_QUERY_KEY, useCustomerDetail } from '../hooks/useCustomers';
import { formatCentsAsDollars, formatTimeRange } from '../lib/format';
import './customers.css';

const FLAG_REASON_MAX_LENGTH = 300;

export function CustomerDetailPage() {
  const { id } = useParams<{ id: string }>();
  const queryClient = useQueryClient();

  const detailQuery = useCustomerDetail(id);
  const [isFlagging, setIsFlagging] = useState(false);
  const [isUnflagging, setIsUnflagging] = useState(false);
  const [flagReason, setFlagReason] = useState('');
  const [flagValidationError, setFlagValidationError] = useState<string | null>(null);

  function applyUpdatedDetail(detail: AdminCustomerDetail) {
    if (id) {
      queryClient.setQueryData(CUSTOMER_DETAIL_QUERY_KEY(id), detail);
    }
    return queryClient.invalidateQueries({ queryKey: CUSTOMERS_QUERY_KEY });
  }

  const flagMutation = useMutation({
    mutationFn: (reason: string) =>
      apiFetch<AdminCustomerDetail>(`/api/admin/customers/${id}/flag`, {
        method: 'POST',
        body: JSON.stringify({ reason }),
      }),
    onSuccess: async (detail) => {
      await applyUpdatedDetail(detail);
      setIsFlagging(false);
      setFlagReason('');
    },
  });

  const unflagMutation = useMutation({
    mutationFn: () => apiFetch<AdminCustomerDetail>(`/api/admin/customers/${id}/unflag`, { method: 'POST' }),
    onSuccess: async (detail) => {
      await applyUpdatedDetail(detail);
      setIsUnflagging(false);
    },
  });

  function openFlagDialog() {
    setFlagReason('');
    setFlagValidationError(null);
    flagMutation.reset();
    setIsFlagging(true);
  }

  function handleFlagSubmit(event: FormEvent) {
    event.preventDefault();
    const trimmed = flagReason.trim();
    if (trimmed.length < 1 || trimmed.length > FLAG_REASON_MAX_LENGTH) {
      setFlagValidationError(`Reason must be between 1 and ${FLAG_REASON_MAX_LENGTH} characters.`);
      return;
    }
    setFlagValidationError(null);
    flagMutation.mutate(trimmed);
  }

  if (detailQuery.isLoading) {
    return (
      <div className="customer-detail-page">
        <div className="detail-skeleton" role="status" aria-label="Loading customer…">
          <Skeleton height="1.25rem" width="12rem" />
          <Skeleton height="2rem" width="16rem" />
          <Skeleton height="9rem" />
          <Skeleton height="9rem" />
        </div>
      </div>
    );
  }

  if (detailQuery.isError || !detailQuery.data) {
    return <p role="alert">Could not load this customer. Try again.</p>;
  }

  const customer = detailQuery.data;

  return (
    <div className="customer-detail-page">
      <div className="customer-detail-header page-header">
        <div>
          <Link to="/customers" className="btn btn-ghost btn-sm customer-detail-back">
            &larr; Back to customers
          </Link>
          <h2>
            {customer.name}
            {customer.flagged && <span className="status-badge status-badge-flagged">Flagged</span>}
          </h2>
        </div>
        <div className="customer-detail-actions page-header-actions">
          {customer.flagged ? (
            <button
              type="button"
              className="btn btn-danger"
              onClick={() => {
                unflagMutation.reset();
                setIsUnflagging(true);
              }}
            >
              Unflag customer
            </button>
          ) : (
            <button type="button" className="btn btn-primary" onClick={openFlagDialog}>
              Flag customer
            </button>
          )}
        </div>
      </div>

      {customer.flagged && customer.flagReason && (
        <div className="flag-reason-callout" role="note">
          <p className="flag-reason-callout-label">Flag reason</p>
          <p>{customer.flagReason}</p>
        </div>
      )}

      <div className="customer-detail-sections">
        <section className="detail-card">
          <h3>Profile</h3>
          <dl className="detail-grid">
            <div>
              <dt>Email</dt>
              <dd>{customer.email}</dd>
            </div>
            <div>
              <dt>Phone</dt>
              <dd>{customer.phone}</dd>
            </div>
            <div>
              <dt>Reservations</dt>
              <dd>{customer.reservationCount}</dd>
            </div>
            <div>
              <dt>Lifetime spend</dt>
              <dd>{formatCentsAsDollars(customer.lifetimeSpendCents)}</dd>
            </div>
          </dl>
        </section>

        <section className="detail-card customer-detail-history">
          <h3>Reservation history</h3>
          {customer.reservations.length === 0 ? (
            <p className="reservations-table-empty">No reservations yet.</p>
          ) : (
            <table className="reservations-table data-table">
              <thead>
                <tr>
                  <th>Reservation #</th>
                  <th>Lot</th>
                  <th>Window</th>
                  <th className="num">Cost</th>
                  <th>Status</th>
                </tr>
              </thead>
              <tbody>
                {customer.reservations.map((reservation) => (
                  <tr key={reservation.id}>
                    <td>
                      <Link to={`/reservations/${reservation.id}`}>{reservation.reservationNumber}</Link>
                    </td>
                    <td>{reservation.lotName}</td>
                    <td>{formatTimeRange(reservation.startTime, reservation.endTime)}</td>
                    <td className="num">{formatCentsAsDollars(reservation.totalCostCents)}</td>
                    <td>
                      <span className={`status-badge status-badge-${reservation.status}`}>{reservation.status}</span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </section>
      </div>

      {isFlagging && (
        <div className="modal-backdrop" role="presentation">
          <div className="modal" role="dialog" aria-modal="true" aria-label="Flag customer">
            <h2>Flag customer</h2>
            <form onSubmit={handleFlagSubmit} noValidate>
              <div className="form-field">
                <label htmlFor="flag-reason">Reason</label>
                <textarea
                  id="flag-reason"
                  value={flagReason}
                  maxLength={FLAG_REASON_MAX_LENGTH}
                  onChange={(e) => setFlagReason(e.target.value)}
                />
                {flagValidationError && <p className="form-error">{flagValidationError}</p>}
              </div>

              {flagMutation.error && (
                <p role="alert" className="form-error">
                  {flagMutation.error.message}
                </p>
              )}

              <div className="modal-actions">
                <button
                  type="button"
                  onClick={() => {
                    flagMutation.reset();
                    setIsFlagging(false);
                  }}
                  disabled={flagMutation.isPending}
                >
                  Cancel
                </button>
                <button type="submit" disabled={flagMutation.isPending}>
                  {flagMutation.isPending ? 'Flagging…' : 'Flag customer'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {isUnflagging && (
        <ConfirmDialog
          title="Unflag customer"
          message={`Are you sure you want to unflag ${customer.name}?`}
          confirmLabel="Unflag customer"
          isConfirming={unflagMutation.isPending}
          errorMessage={unflagMutation.error?.message}
          onConfirm={() => unflagMutation.mutate()}
          onCancel={() => {
            unflagMutation.reset();
            setIsUnflagging(false);
          }}
        />
      )}
    </div>
  );
}
