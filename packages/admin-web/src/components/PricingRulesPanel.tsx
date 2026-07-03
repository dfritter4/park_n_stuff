import { useState, type FormEvent } from 'react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import type { CreatePricingRuleRequest, DayType, Lot, PricingRule } from '@parking/shared';
import { apiFetch } from '../api/client';
import { PRICING_RULES_QUERY_KEY, usePricingRules } from '../hooks/useLotOps';
import { ConfirmDialog } from './ConfirmDialog';
import { Skeleton } from './Skeleton';
import { dollarsToCents } from '../lib/lots';
import { formatCentsAsDollars, formatHourLabel } from '../lib/format';
import { formatDayType, formatHourRange } from '../lib/lotOps';
import '../pages/lotops.css';

interface PricingRulesPanelProps {
  lot: Lot;
  onClose: () => void;
}

interface FormState {
  dayType: DayType;
  startHour: string;
  endHour: string;
  rate: string;
}

const START_HOUR_OPTIONS = Array.from({ length: 24 }, (_, i) => i);
const END_HOUR_OPTIONS = Array.from({ length: 24 }, (_, i) => i + 1);

function initialFormState(): FormState {
  return { dayType: 'all', startHour: '0', endHour: '24', rate: '' };
}

export function PricingRulesPanel({ lot, onClose }: PricingRulesPanelProps) {
  const queryClient = useQueryClient();
  const rulesQuery = usePricingRules(lot.id);

  const [isAdding, setIsAdding] = useState(false);
  const [form, setForm] = useState<FormState>(initialFormState);
  const [formError, setFormError] = useState<string | null>(null);
  const [pendingDelete, setPendingDelete] = useState<PricingRule | null>(null);

  function invalidate() {
    return queryClient.invalidateQueries({ queryKey: PRICING_RULES_QUERY_KEY(lot.id) });
  }

  const createMutation = useMutation({
    mutationFn: (data: CreatePricingRuleRequest) =>
      apiFetch<PricingRule>(`/api/lots/${lot.id}/pricing-rules`, { method: 'POST', body: JSON.stringify(data) }),
    onSuccess: async () => {
      await invalidate();
      setIsAdding(false);
      setForm(initialFormState());
    },
  });

  const deleteMutation = useMutation({
    mutationFn: (ruleId: string) => apiFetch<void>(`/api/pricing-rules/${ruleId}`, { method: 'DELETE' }),
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

    const startHour = Number(form.startHour);
    const endHour = Number(form.endHour);
    const hourlyRateCents = dollarsToCents(form.rate);

    if (Number.isNaN(hourlyRateCents) || hourlyRateCents <= 0) {
      setFormError('Rate must be a positive dollar amount.');
      return;
    }
    if (endHour <= startHour) {
      setFormError('End hour must be after start hour.');
      return;
    }

    setFormError(null);
    createMutation.mutate({ dayType: form.dayType, startHour, endHour, hourlyRateCents });
  }

  const rules = rulesQuery.data ?? [];

  return (
    <div className="modal-backdrop" role="presentation">
      <div className="modal modal-lg" role="dialog" aria-modal="true" aria-label={`Pricing rules for ${lot.name}`}>
        <h2>Pricing rules — {lot.name}</h2>

        {rulesQuery.isLoading && (
          <div role="status" aria-label="Loading" className="lotops-panel-loading">
            <Skeleton height="2.5rem" count={3} />
          </div>
        )}
        {rulesQuery.isError && <p role="alert">Could not load pricing rules.</p>}

        {!rulesQuery.isLoading && !rulesQuery.isError && rules.length === 0 && (
          <p className="lotops-panel-empty">
            No pricing rules yet. The base rate ({formatCentsAsDollars(lot.hourlyRateCents)}/hr) applies at all times.
          </p>
        )}

        {!rulesQuery.isLoading && !rulesQuery.isError && rules.length > 0 && (
          <table className="data-table lotops-panel-table">
            <thead>
              <tr>
                <th>Day type</th>
                <th>Hours (UTC)</th>
                <th className="num">Rate</th>
                <th></th>
              </tr>
            </thead>
            <tbody>
              {rules.map((rule) => (
                <tr key={rule.id}>
                  <td>{formatDayType(rule.dayType)}</td>
                  <td>{formatHourRange(rule.startHour, rule.endHour)}</td>
                  <td className="num">{formatCentsAsDollars(rule.hourlyRateCents)}/hr</td>
                  <td>
                    <button type="button" className="btn btn-ghost btn-sm" onClick={() => setPendingDelete(rule)}>
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
            <p className="lotops-add-form-title">New pricing rule</p>
            <div className="form-row">
              <div className="form-field">
                <label htmlFor="rule-day-type">Day type</label>
                <select
                  id="rule-day-type"
                  value={form.dayType}
                  onChange={(e) => setField('dayType', e.target.value as DayType)}
                >
                  <option value="weekday">Weekday</option>
                  <option value="weekend">Weekend</option>
                  <option value="all">All days</option>
                </select>
              </div>

              <div className="form-field">
                <label htmlFor="rule-start-hour">Start hour (UTC)</label>
                <select
                  id="rule-start-hour"
                  value={form.startHour}
                  onChange={(e) => setField('startHour', e.target.value)}
                >
                  {START_HOUR_OPTIONS.map((hour) => (
                    <option key={hour} value={hour}>
                      {formatHourLabel(hour)}
                    </option>
                  ))}
                </select>
              </div>

              <div className="form-field">
                <label htmlFor="rule-end-hour">End hour (UTC)</label>
                <select id="rule-end-hour" value={form.endHour} onChange={(e) => setField('endHour', e.target.value)}>
                  {END_HOUR_OPTIONS.map((hour) => (
                    <option key={hour} value={hour}>
                      {formatHourLabel(hour)}
                    </option>
                  ))}
                </select>
              </div>

              <div className="form-field">
                <label htmlFor="rule-rate">Rate ($/hr)</label>
                <input id="rule-rate" value={form.rate} onChange={(e) => setField('rate', e.target.value)} />
              </div>
            </div>

            {(formError || createMutation.error) && (
              <p role="alert" className="form-error">
                {formError ?? createMutation.error?.message}
              </p>
            )}

            <div className="modal-actions">
              <button type="button" className="btn btn-secondary" onClick={closeAddForm} disabled={createMutation.isPending}>
                Cancel
              </button>
              <button type="submit" className="btn btn-primary" disabled={createMutation.isPending}>
                {createMutation.isPending ? 'Adding…' : 'Add rule'}
              </button>
            </div>
          </form>
        ) : (
          <div className="modal-actions lotops-panel-actions">
            <button type="button" className="btn btn-secondary" onClick={onClose}>
              Close
            </button>
            <button type="button" className="btn btn-primary" onClick={openAddForm}>
              Add rule
            </button>
          </div>
        )}
      </div>

      {pendingDelete && (
        <ConfirmDialog
          title="Delete pricing rule"
          message={`Delete the ${formatDayType(pendingDelete.dayType)} ${formatHourRange(
            pendingDelete.startHour,
            pendingDelete.endHour,
          )} rule?`}
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
