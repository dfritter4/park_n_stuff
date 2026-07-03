import { useEffect, useState } from 'react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { Link } from 'react-router-dom';
import type { CreateLotRequest, Lot, LotStatus, UpdateLotRequest } from '@parking/shared';
import { apiFetch } from '../api/client';
import { useLots, LOTS_QUERY_KEY } from '../hooks/useLots';
import { LotFormModal } from '../components/LotFormModal';
import { ConfirmDialog } from '../components/ConfirmDialog';
import { formatCentsAsDollars, formatPercent1 } from '../lib/format';

type BulkStatus = Extract<LotStatus, 'active' | 'maintenance'>;

type PendingAction =
  | { type: 'delete'; lot: Lot }
  | { type: 'bulk-status'; status: BulkStatus; lotIds: string[] };

function occupancyPct(lot: Lot): number {
  if (lot.capacity <= 0) {
    return 0;
  }
  const occupied = lot.capacity - lot.availableSpaces;
  return (occupied / lot.capacity) * 100;
}

export function LotsPage() {
  const lotsQuery = useLots();
  const queryClient = useQueryClient();

  const [modalState, setModalState] = useState<{ mode: 'create' } | { mode: 'edit'; lot: Lot } | null>(null);
  const [pendingAction, setPendingAction] = useState<PendingAction | null>(null);
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());

  function invalidateLots() {
    return queryClient.invalidateQueries({ queryKey: LOTS_QUERY_KEY });
  }

  const createMutation = useMutation({
    mutationFn: (data: CreateLotRequest) => apiFetch<Lot>('/api/lots', { method: 'POST', body: JSON.stringify(data) }),
    onSuccess: async () => {
      await invalidateLots();
      setModalState(null);
    },
  });

  const updateMutation = useMutation({
    mutationFn: ({ id, data }: { id: string; data: UpdateLotRequest }) =>
      apiFetch<Lot>(`/api/lots/${id}`, { method: 'PUT', body: JSON.stringify(data) }),
    onSuccess: () => {
      setModalState(null);
    },
    // Invalidate regardless of outcome: a failed request may still have been
    // applied server-side (e.g. the response was lost after the write
    // succeeded), so the table must be reconciled with true server state
    // either way. The error still surfaces via updateMutation.error above.
    onSettled: async () => {
      await invalidateLots();
    },
  });

  const deleteMutation = useMutation({
    mutationFn: (id: string) => apiFetch<void>(`/api/lots/${id}`, { method: 'DELETE' }),
    onSuccess: () => {
      setPendingAction(null);
    },
    onSettled: async () => {
      await invalidateLots();
    },
  });

  const bulkStatusMutation = useMutation({
    mutationFn: async ({ status, lotIds }: { status: BulkStatus; lotIds: string[] }) => {
      await Promise.all(
        lotIds.map((id) => apiFetch<Lot>(`/api/lots/${id}`, { method: 'PUT', body: JSON.stringify({ status }) })),
      );
    },
    onSuccess: () => {
      setPendingAction(null);
    },
    // A partial failure (some PUTs succeeded, some rejected) still rejects
    // the whole Promise.all, so onSuccess never runs. Reconcile with the
    // server on every outcome so lots that DID update are reflected in the
    // table even when the mutation as a whole errors; keep the confirm
    // dialog open on failure (see onSuccess) so bulkStatusMutation.error
    // stays visible to the user.
    onSettled: async () => {
      await invalidateLots();
      setSelectedIds(new Set());
    },
  });

  const lots = lotsQuery.data ?? [];
  const isMutating = createMutation.isPending || updateMutation.isPending || deleteMutation.isPending || bulkStatusMutation.isPending;

  // Reconcile the selection with the latest server state: if a lot was
  // removed (deleted here, or by another admin) between selection and
  // refetch, drop its id so "select all" and bulk actions don't silently
  // operate on/count a lot that no longer exists.
  useEffect(() => {
    if (!lotsQuery.data) {
      return;
    }
    const validIds = new Set(lotsQuery.data.map((lot) => lot.id));
    setSelectedIds((prev) => {
      let changed = false;
      const next = new Set<string>();
      prev.forEach((id) => {
        if (validIds.has(id)) {
          next.add(id);
        } else {
          changed = true;
        }
      });
      return changed ? next : prev;
    });
  }, [lotsQuery.data]);

  function toggleSelected(id: string) {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) {
        next.delete(id);
      } else {
        next.add(id);
      }
      return next;
    });
  }

  function toggleSelectAll() {
    setSelectedIds((prev) => (prev.size === lots.length ? new Set() : new Set(lots.map((lot) => lot.id))));
  }

  function handleCreateSubmit(data: CreateLotRequest) {
    createMutation.mutate(data);
  }

  function handleEditSubmit(data: UpdateLotRequest) {
    if (modalState?.mode !== 'edit') {
      return;
    }
    updateMutation.mutate({ id: modalState.lot.id, data });
  }

  function confirmPendingAction() {
    if (!pendingAction) {
      return;
    }
    if (pendingAction.type === 'delete') {
      deleteMutation.mutate(pendingAction.lot.id);
    } else {
      bulkStatusMutation.mutate({ status: pendingAction.status, lotIds: pendingAction.lotIds });
    }
  }

  if (lotsQuery.isLoading) {
    return <p>Loading lots…</p>;
  }

  if (lotsQuery.isError) {
    return <p role="alert">Could not load lots. Try again.</p>;
  }

  return (
    <div className="lots-page">
      <div className="lots-page-header">
        <h2>Lots</h2>
        <div className="lots-page-actions">
          {selectedIds.size > 0 && (
            <>
              <button
                type="button"
                disabled={isMutating}
                onClick={() =>
                  setPendingAction({ type: 'bulk-status', status: 'maintenance', lotIds: Array.from(selectedIds) })
                }
              >
                Mark maintenance
              </button>
              <button
                type="button"
                disabled={isMutating}
                onClick={() =>
                  setPendingAction({ type: 'bulk-status', status: 'active', lotIds: Array.from(selectedIds) })
                }
              >
                Mark active
              </button>
            </>
          )}
          <button type="button" disabled={isMutating} onClick={() => setModalState({ mode: 'create' })}>
            Add Lot
          </button>
        </div>
      </div>

      <table className="lots-table">
        <thead>
          <tr>
            <th>
              <input
                type="checkbox"
                aria-label="Select all lots"
                checked={lots.length > 0 && selectedIds.size === lots.length}
                onChange={toggleSelectAll}
              />
            </th>
            <th>Name</th>
            <th>Neighborhood</th>
            <th>Capacity</th>
            <th>Rate</th>
            <th>Status</th>
            <th>Occupancy</th>
            <th>Actions</th>
          </tr>
        </thead>
        <tbody>
          {lots.map((lot) => (
            <tr key={lot.id}>
              <td>
                <input
                  type="checkbox"
                  aria-label={`Select ${lot.name}`}
                  checked={selectedIds.has(lot.id)}
                  onChange={() => toggleSelected(lot.id)}
                />
              </td>
              <td>{lot.name}</td>
              <td>{lot.neighborhood}</td>
              <td>{lot.capacity}</td>
              <td>{formatCentsAsDollars(lot.hourlyRateCents)}</td>
              <td>
                <span className={`status-badge status-badge-${lot.status}`}>{lot.status}</span>
              </td>
              <td>{formatPercent1(occupancyPct(lot))}</td>
              <td className="lots-table-row-actions">
                <Link to={`/reservations?lotId=${lot.id}&activeNow=true`}>View current</Link>
                <button type="button" onClick={() => setModalState({ mode: 'edit', lot })}>
                  Edit
                </button>
                <button type="button" onClick={() => setPendingAction({ type: 'delete', lot })}>
                  Delete
                </button>
              </td>
            </tr>
          ))}
        </tbody>
      </table>

      {lots.length === 0 && <p className="lots-table-empty">No lots yet.</p>}

      {modalState?.mode === 'create' && (
        <LotFormModal
          mode="create"
          onSubmit={handleCreateSubmit}
          onClose={() => {
            createMutation.reset();
            setModalState(null);
          }}
          isSubmitting={createMutation.isPending}
          errorMessage={createMutation.error?.message}
        />
      )}

      {modalState?.mode === 'edit' && (
        <LotFormModal
          mode="edit"
          lot={modalState.lot}
          onSubmit={handleEditSubmit}
          onClose={() => {
            updateMutation.reset();
            setModalState(null);
          }}
          isSubmitting={updateMutation.isPending}
          errorMessage={updateMutation.error?.message}
        />
      )}

      {pendingAction?.type === 'delete' && (
        <ConfirmDialog
          title="Delete lot"
          message={`Are you sure you want to delete "${pendingAction.lot.name}"? This cannot be undone.`}
          confirmLabel="Delete"
          isConfirming={deleteMutation.isPending}
          errorMessage={deleteMutation.error?.message}
          onConfirm={confirmPendingAction}
          onCancel={() => {
            deleteMutation.reset();
            setPendingAction(null);
          }}
        />
      )}

      {pendingAction?.type === 'bulk-status' && (
        <ConfirmDialog
          title={pendingAction.status === 'maintenance' ? 'Mark lots as maintenance' : 'Mark lots as active'}
          message={`This will update ${pendingAction.lotIds.length} lot(s) to "${pendingAction.status}".`}
          confirmLabel="Confirm"
          isConfirming={bulkStatusMutation.isPending}
          errorMessage={bulkStatusMutation.error?.message}
          onConfirm={confirmPendingAction}
          onCancel={() => {
            bulkStatusMutation.reset();
            setPendingAction(null);
          }}
        />
      )}
    </div>
  );
}
