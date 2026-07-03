import { useState, type FormEvent } from 'react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import type { CapacityOverride, CreateCapacityOverrideRequest, Lot } from '@parking/shared';
import { apiFetch } from '../api/client';
import { CAPACITY_OVERRIDES_QUERY_KEY, useCapacityOverrides } from '../hooks/useLotOps';
import { LOTS_QUERY_KEY } from '../hooks/useLots';
import { ConfirmDialog } from './ConfirmDialog';
import { toDatetimeLocalInput } from '../lib/format';
import { formatOverrideWindow } from '../lib/lotOps';
import '../pages/lotops.css';

interface CapacityOverridesPanelProps {
  lot: Lot;
  onClose: () => void;
}

interface FormState {
  spacesClosed: string;
  reason: string;
  startsAt: string;
  endsAt: string;
}

function initialFormState(): FormState {
  return { spacesClosed: '', reason: '', startsAt: toDatetimeLocalInput(new Date()), endsAt: '' };
}

export function CapacityOverridesPanel({ lot, onClose }: CapacityOverridesPanelProps) {
  const queryClient = useQueryClient();
  const overridesQuery = useCapacityOverrides(lot.id);

  const [isAdding, setIsAdding] = useState(false);
  const [form, setForm] = useState<FormState>(initialFormState);
  const [formError, setFormError] = useState<string | null>(null);
  const [pendingDelete, setPendingDelete] = useState<CapacityOverride | null>(null);

  async function invalidate() {
    await Promise.all([
      queryClient.invalidateQueries({ queryKey: CAPACITY_OVERRIDES_QUERY_KEY(lot.id) }),
      // Overrides shrink effective capacity, which feeds availableSpaces on
      // the lots table, so that list needs to be reconciled too.
      queryClient.invalidateQueries({ queryKey: LOTS_QUERY_KEY }),
    ]);
  }

  const createMutation = useMutation({
    mutationFn: (data: CreateCapacityOverrideRequest) =>
      apiFetch<CapacityOverride>(`/api/lots/${lot.id}/capacity-overrides`, {
        method: 'POST',
        body: JSON.stringify(data),
      }),
    onSuccess: async () => {
      await invalidate();
      setIsAdding(false);
      setForm(initialFormState());
    },
  });

  const deleteMutation = useMutation({
    mutationFn: (id: string) => apiFetch<void>(`/api/capacity-overrides/${id}`, { method: 'DELETE' }),
    onSuccess: () => {
      setPendingDelete(null);
    },
    onSettled: async () => {
      await invalidate();
    },
  });

  function setField<K extends keyof FormState>(key: K, value: FormState[K]) {
    setForm((prev) => ({ ...prev, [key]: value }));
  }

  function openAddForm() {
    setForm(initialFormState());
    setFormError(null);
    createMutation.reset();
    setIsAdding(true);
  }

  function closeAddForm() {
    createMutation.reset();
    setFormError(null);
    setIsAdding(false);
  }

  function handleAddSubmit(event: FormEvent) {
    event.preventDefault();

    const spacesClosed = Number(form.spacesClosed);
    if (
      form.spacesClosed.trim() === '' ||
      Number.isNaN(spacesClosed) ||
      !Number.isInteger(spacesClosed) ||
      spacesClosed <= 0
    ) {
      setFormError('Spaces closed must be a positive whole number.');
      return;
    }
    if (spacesClosed > lot.capacity) {
      setFormError(`Spaces closed cannot exceed the lot's capacity (${lot.capacity}).`);
      return;
    }
    if (form.reason.trim() === '') {
      setFormError('Reason is required.');
      return;
    }

    const startsAtDate = new Date(form.startsAt);
    if (form.startsAt.trim() === '' || Number.isNaN(startsAtDate.getTime())) {
      setFormError('Enter a valid start date and time.');
      return;
    }

    let endsAtISO: string | undefined;
    if (form.endsAt.trim() !== '') {
      const endsAtDate = new Date(form.endsAt);
      if (Number.isNaN(endsAtDate.getTime())) {
        setFormError('Enter a valid end date and time.');
        return;
      }
      if (endsAtDate <= startsAtDate) {
        setFormError('End time must be after start time.');
        return;
      }
      endsAtISO = endsAtDate.toISOString();
    }

    setFormError(null);
    createMutation.mutate({
      spacesClosed,
      reason: form.reason.trim(),
      startsAt: startsAtDate.toISOString(),
      endsAt: endsAtISO,
    });
  }

  const overrides = overridesQuery.data ?? [];

  return (
    <div className="modal-backdrop" role="presentation">
      <div className="modal modal-lg" role="dialog" aria-modal="true" aria-label={`Capacity overrides for ${lot.name}`}>
        <h2>Capacity overrides — {lot.name}</h2>

        {overridesQuery.isLoading && <p>Loading capacity overrides…</p>}
        {overridesQuery.isError && <p role="alert">Could not load capacity overrides.</p>}

        {!overridesQuery.isLoading && !overridesQuery.isError && overrides.length === 0 && (
          <p className="lotops-panel-empty">No capacity overrides for this lot.</p>
        )}

        {!overridesQuery.isLoading && !overridesQuery.isError && overrides.length > 0 && (
          <table className="lotops-panel-table">
            <thead>
              <tr>
                <th>Spaces closed</th>
                <th>Reason</th>
                <th>Window</th>
                <th></th>
              </tr>
            </thead>
            <tbody>
              {overrides.map((override) => (
                <tr key={override.id}>
                  <td>{override.spacesClosed}</td>
                  <td>{override.reason ?? '—'}</td>
                  <td>{formatOverrideWindow(override.startsAt, override.endsAt)}</td>
                  <td>
                    <button type="button" onClick={() => setPendingDelete(override)}>
                      Delete
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}

        {isAdding ? (
          <form onSubmit={handleAddSubmit} noValidate className="lotops-add-form">
            <div className="form-row">
              <div className="form-field">
                <label htmlFor="override-spaces">Spaces closed</label>
                <input
                  id="override-spaces"
                  type="number"
                  value={form.spacesClosed}
                  onChange={(e) => setField('spacesClosed', e.target.value)}
                />
              </div>

              <div className="form-field">
                <label htmlFor="override-reason">Reason</label>
                <input id="override-reason" value={form.reason} onChange={(e) => setField('reason', e.target.value)} />
              </div>
            </div>

            <div className="form-row">
              <div className="form-field">
                <label htmlFor="override-starts-at">Starts</label>
                <input
                  id="override-starts-at"
                  type="datetime-local"
                  value={form.startsAt}
                  onChange={(e) => setField('startsAt', e.target.value)}
                />
              </div>

              <div className="form-field">
                <label htmlFor="override-ends-at">Ends (optional)</label>
                <input
                  id="override-ends-at"
                  type="datetime-local"
                  value={form.endsAt}
                  onChange={(e) => setField('endsAt', e.target.value)}
                />
              </div>
            </div>

            {(formError || createMutation.error) && (
              <p role="alert" className="form-error">
                {formError ?? createMutation.error?.message}
              </p>
            )}

            <div className="modal-actions">
              <button type="button" onClick={closeAddForm} disabled={createMutation.isPending}>
                Cancel
              </button>
              <button type="submit" disabled={createMutation.isPending}>
                {createMutation.isPending ? 'Adding…' : 'Add override'}
              </button>
            </div>
          </form>
        ) : (
          <div className="modal-actions lotops-panel-actions">
            <button type="button" onClick={onClose}>
              Close
            </button>
            <button type="button" onClick={openAddForm}>
              Add override
            </button>
          </div>
        )}
      </div>

      {pendingDelete && (
        <ConfirmDialog
          title="Delete capacity override"
          message={`Delete this override closing ${pendingDelete.spacesClosed} space(s)?`}
          confirmLabel="Delete"
          isConfirming={deleteMutation.isPending}
          errorMessage={deleteMutation.error?.message}
          onConfirm={() => deleteMutation.mutate(pendingDelete.id)}
          onCancel={() => {
            deleteMutation.reset();
            setPendingDelete(null);
          }}
        />
      )}
    </div>
  );
}
