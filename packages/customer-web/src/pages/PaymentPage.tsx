import { useEffect, useState, type FormEvent } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import type { CreateReservationRequest, Reservation } from '@parking/shared';
import { ApiError, apiFetch } from '../api/client';
import { useReservationDraft } from '../lib/reservationDraft';
import { estimateCostCents } from '../lib/pricing';
import { formatCardNumber, isValidCvc, isValidExpiry, luhnCheck } from '../lib/cardValidation';

const ARTIFICIAL_PROCESSING_DELAY_MS = 1500;

interface PaymentFormState {
  cardNumber: string;
  expiry: string;
  cvc: string;
  cardholderName: string;
}

type PaymentFieldErrors = Partial<Record<keyof PaymentFormState, string>>;

function validatePayment(form: PaymentFormState): PaymentFieldErrors {
  const errors: PaymentFieldErrors = {};
  const digitsOnly = form.cardNumber.replace(/\D/g, '');

  if (!luhnCheck(digitsOnly)) {
    errors.cardNumber = 'Enter a valid card number.';
  }
  if (!isValidExpiry(form.expiry)) {
    errors.expiry = 'Enter a valid, unexpired date as MM/YY.';
  }
  if (!isValidCvc(form.cvc)) {
    errors.cvc = 'CVC must be 3 or 4 digits.';
  }
  if (form.cardholderName.trim() === '') {
    errors.cardholderName = 'Cardholder name is required.';
  }

  return errors;
}

type SubmitStatus = 'idle' | 'submitting' | 'declined' | 'lot-full' | 'error';

const EMPTY_FORM: PaymentFormState = { cardNumber: '', expiry: '', cvc: '', cardholderName: '' };

function delay(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

export function PaymentPage() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const { draft, clearDraft } = useReservationDraft();

  useEffect(() => {
    if (!draft) {
      navigate(`/lots/${id}`, { replace: true });
    }
    // Only re-run this guard if the draft or target lot changes — navigate is stable.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [draft, id]);

  const [form, setForm] = useState<PaymentFormState>(EMPTY_FORM);
  const [touched, setTouched] = useState<Partial<Record<keyof PaymentFormState, boolean>>>({});
  const [submitted, setSubmitted] = useState(false);
  const [status, setStatus] = useState<SubmitStatus>('idle');

  if (!draft) {
    return null;
  }

  const errors = validatePayment(form);
  const costCents =
    draft.quotedTotalCents ??
    estimateCostCents(draft.lot.hourlyRateCents, draft.startTime, draft.endTime) ??
    0;
  const isSubmitting = status === 'submitting';

  function updateField<K extends keyof PaymentFormState>(key: K, value: PaymentFormState[K]) {
    setForm((prev) => ({ ...prev, [key]: value }));
  }

  function markTouched(key: keyof PaymentFormState) {
    setTouched((prev) => ({ ...prev, [key]: true }));
  }

  function shouldShowError(key: keyof PaymentFormState): boolean {
    return (touched[key] === true || submitted) && Boolean(errors[key]);
  }

  async function handleSubmit(event: FormEvent) {
    event.preventDefault();
    setSubmitted(true);

    if (Object.keys(errors).length > 0 || !draft) {
      return;
    }

    setStatus('submitting');

    const request: CreateReservationRequest = {
      lotId: draft.lot.id,
      customer: draft.customer,
      vehicle: draft.vehicle,
      startTime: draft.startTime,
      endTime: draft.endTime,
      payment: {
        cardNumber: form.cardNumber.replace(/\D/g, ''),
        expiry: form.expiry,
        cvc: form.cvc,
        cardholderName: form.cardholderName.trim(),
      },
    };

    await delay(ARTIFICIAL_PROCESSING_DELAY_MS);

    try {
      const reservation = await apiFetch<Reservation>('/api/reservations', {
        method: 'POST',
        body: JSON.stringify(request),
      });
      clearDraft();
      navigate(`/confirmation/${reservation.id}`);
    } catch (err) {
      if (err instanceof ApiError && err.code === 'PAYMENT_DECLINED') {
        setStatus('declined');
      } else if (err instanceof ApiError && err.code === 'LOT_FULL') {
        setStatus('lot-full');
      } else {
        setStatus('error');
      }
    }
  }

  if (status === 'lot-full') {
    return (
      <div className="payment-page">
        <p role="alert" className="payment-lot-full-message">
          This lot filled up before your payment could be completed.
        </p>
        <Link to="/">Back to search</Link>
      </div>
    );
  }

  return (
    <div className="payment-page">
      <Link to={`/lots/${id}/reserve`} className="back-link">
        ← Back
      </Link>
      <h1>Payment</h1>
      <p className="payment-summary">
        {draft.lot.name} — total <strong>${(costCents / 100).toFixed(2)}</strong>
      </p>

      {status === 'declined' && (
        <p role="alert" className="payment-declined-banner">
          Card declined — try another card.
        </p>
      )}
      {status === 'error' && (
        <p role="alert" className="payment-error-banner">
          Something went wrong processing your payment. Please try again.
        </p>
      )}

      <div className="payment-card-panel">
        <form onSubmit={handleSubmit} noValidate>
          <label className="form-field">
            Card number
            <input
              inputMode="numeric"
              autoComplete="cc-number"
              value={formatCardNumber(form.cardNumber)}
              onChange={(event) => updateField('cardNumber', event.target.value.replace(/\D/g, ''))}
              onBlur={() => markTouched('cardNumber')}
              disabled={isSubmitting}
            />
          </label>
          {shouldShowError('cardNumber') && (
            <p role="alert" className="field-error">
              {errors.cardNumber}
            </p>
          )}

          <label className="form-field">
            Expiry (MM/YY)
            <input
              inputMode="numeric"
              autoComplete="cc-exp"
              placeholder="MM/YY"
              value={form.expiry}
              onChange={(event) => updateField('expiry', event.target.value)}
              onBlur={() => markTouched('expiry')}
              disabled={isSubmitting}
            />
          </label>
          {shouldShowError('expiry') && (
            <p role="alert" className="field-error">
              {errors.expiry}
            </p>
          )}

          <label className="form-field">
            CVC
            <input
              inputMode="numeric"
              autoComplete="cc-csc"
              value={form.cvc}
              onChange={(event) => updateField('cvc', event.target.value)}
              onBlur={() => markTouched('cvc')}
              disabled={isSubmitting}
            />
          </label>
          {shouldShowError('cvc') && (
            <p role="alert" className="field-error">
              {errors.cvc}
            </p>
          )}

          <label className="form-field">
            Cardholder name
            <input
              autoComplete="cc-name"
              value={form.cardholderName}
              onChange={(event) => updateField('cardholderName', event.target.value)}
              onBlur={() => markTouched('cardholderName')}
              disabled={isSubmitting}
            />
          </label>
          {shouldShowError('cardholderName') && (
            <p role="alert" className="field-error">
              {errors.cardholderName}
            </p>
          )}

          <button type="submit" className="payment-submit-button" disabled={isSubmitting}>
            {isSubmitting && <span className="spinner" aria-hidden="true" />}
            {isSubmitting ? 'Processing…' : `Pay $${(costCents / 100).toFixed(2)}`}
          </button>
        </form>
      </div>

      <p className="payment-small-print">
        Demo: card ending 0002 always declines. Try 4242 4242 4240 0002.
      </p>
    </div>
  );
}
