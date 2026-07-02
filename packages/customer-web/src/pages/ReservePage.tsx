import { useState, type FormEvent } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import type { Lot } from '@parking/shared';
import { apiFetch } from '../api/client';
import { DurationPicker } from '../components/DurationPicker';
import { useReservationDraft } from '../lib/reservationDraft';

interface ReserveFormState {
  customerName: string;
  email: string;
  phone: string;
  vehicleMake: string;
  vehicleModel: string;
  licensePlate: string;
  startTime: string;
  endTime: string;
}

type FieldErrors = Partial<Record<keyof ReserveFormState, string>>;

const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

/** Mirrors CreateReservationRequestSchema in packages/shared/src/contracts.ts. */
function validate(form: ReserveFormState): FieldErrors {
  const errors: FieldErrors = {};

  if (form.customerName.trim() === '') {
    errors.customerName = 'Name is required.';
  }
  if (!EMAIL_PATTERN.test(form.email.trim())) {
    errors.email = 'Enter a valid email address.';
  }
  if (form.phone.trim().length < 7 || form.phone.trim().length > 20) {
    errors.phone = 'Phone must be between 7 and 20 characters.';
  }
  if (form.vehicleMake.trim() === '') {
    errors.vehicleMake = 'Make is required.';
  }
  if (form.vehicleModel.trim() === '') {
    errors.vehicleModel = 'Model is required.';
  }
  const plate = form.licensePlate.trim();
  if (plate.length < 2 || plate.length > 12) {
    errors.licensePlate = 'Plate must be between 2 and 12 characters.';
  }
  if (!form.startTime || !form.endTime) {
    errors.startTime = 'Select a start and end time.';
  } else if (new Date(form.endTime) <= new Date(form.startTime)) {
    errors.startTime = 'End time must be after start time.';
  }

  return errors;
}

const EMPTY_FORM: ReserveFormState = {
  customerName: '',
  email: '',
  phone: '',
  vehicleMake: '',
  vehicleModel: '',
  licensePlate: '',
  startTime: '',
  endTime: '',
};

export function ReservePage() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const { setDraft } = useReservationDraft();

  const lotQuery = useQuery({
    queryKey: ['lot', id],
    queryFn: () => apiFetch<Lot>(`/api/lots/${id}`),
    enabled: Boolean(id),
  });

  const [form, setForm] = useState<ReserveFormState>(EMPTY_FORM);
  const [touched, setTouched] = useState<Partial<Record<keyof ReserveFormState, boolean>>>({});
  const [submitted, setSubmitted] = useState(false);

  const errors = validate(form);

  function updateField<K extends keyof ReserveFormState>(key: K, value: ReserveFormState[K]) {
    setForm((prev) => ({ ...prev, [key]: value }));
  }

  function markTouched(key: keyof ReserveFormState) {
    setTouched((prev) => ({ ...prev, [key]: true }));
  }

  function shouldShowError(key: keyof ReserveFormState): boolean {
    return (touched[key] === true || submitted) && Boolean(errors[key]);
  }

  function handleSubmit(event: FormEvent) {
    event.preventDefault();
    setSubmitted(true);

    if (Object.keys(errors).length > 0 || !lotQuery.data) {
      return;
    }

    setDraft({
      lot: lotQuery.data,
      customer: {
        name: form.customerName.trim(),
        email: form.email.trim(),
        phone: form.phone.trim(),
      },
      vehicle: {
        make: form.vehicleMake.trim(),
        model: form.vehicleModel.trim(),
        licensePlate: form.licensePlate.trim(),
      },
      startTime: form.startTime,
      endTime: form.endTime,
    });
    navigate(`/lots/${id}/pay`);
  }

  if (lotQuery.isLoading) {
    return (
      <div className="reserve-page">
        <p>Loading…</p>
      </div>
    );
  }

  if (lotQuery.isError || !lotQuery.data) {
    return (
      <div className="reserve-page">
        <p role="alert">Could not load this parking lot.</p>
        <Link to="/">Back to search</Link>
      </div>
    );
  }

  const lot = lotQuery.data;

  return (
    <div className="reserve-page">
      <Link to={`/lots/${id}`} className="back-link">
        ← Back to {lot.name}
      </Link>
      <h1>Reserve a spot</h1>
      <p className="reserve-lot-name">{lot.name}</p>

      <form onSubmit={handleSubmit} noValidate>
        <fieldset>
          <legend>Your info</legend>

          <label className="form-field">
            Name
            <input
              value={form.customerName}
              onChange={(event) => updateField('customerName', event.target.value)}
              onBlur={() => markTouched('customerName')}
            />
          </label>
          {shouldShowError('customerName') && (
            <p role="alert" className="field-error">
              {errors.customerName}
            </p>
          )}

          <label className="form-field">
            Email
            <input
              type="email"
              value={form.email}
              onChange={(event) => updateField('email', event.target.value)}
              onBlur={() => markTouched('email')}
            />
          </label>
          {shouldShowError('email') && (
            <p role="alert" className="field-error">
              {errors.email}
            </p>
          )}

          <label className="form-field">
            Phone
            <input
              type="tel"
              value={form.phone}
              onChange={(event) => updateField('phone', event.target.value)}
              onBlur={() => markTouched('phone')}
            />
          </label>
          {shouldShowError('phone') && (
            <p role="alert" className="field-error">
              {errors.phone}
            </p>
          )}
        </fieldset>

        <fieldset>
          <legend>Vehicle</legend>

          <label className="form-field">
            Make
            <input
              value={form.vehicleMake}
              onChange={(event) => updateField('vehicleMake', event.target.value)}
              onBlur={() => markTouched('vehicleMake')}
            />
          </label>
          {shouldShowError('vehicleMake') && (
            <p role="alert" className="field-error">
              {errors.vehicleMake}
            </p>
          )}

          <label className="form-field">
            Model
            <input
              value={form.vehicleModel}
              onChange={(event) => updateField('vehicleModel', event.target.value)}
              onBlur={() => markTouched('vehicleModel')}
            />
          </label>
          {shouldShowError('vehicleModel') && (
            <p role="alert" className="field-error">
              {errors.vehicleModel}
            </p>
          )}

          <label className="form-field">
            License plate
            <input
              value={form.licensePlate}
              onChange={(event) => updateField('licensePlate', event.target.value.toUpperCase())}
              onBlur={() => markTouched('licensePlate')}
            />
          </label>
          {shouldShowError('licensePlate') && (
            <p role="alert" className="field-error">
              {errors.licensePlate}
            </p>
          )}
        </fieldset>

        <fieldset>
          <legend>When</legend>
          <DurationPicker
            hourlyRateCents={lot.hourlyRateCents}
            startTime={form.startTime}
            endTime={form.endTime}
            onChange={({ startTime, endTime }) => setForm((prev) => ({ ...prev, startTime, endTime }))}
          />
          {shouldShowError('startTime') && (
            <p role="alert" className="field-error">
              {errors.startTime}
            </p>
          )}
        </fieldset>

        <button type="submit" className="reserve-continue-button">
          Continue to payment
        </button>
      </form>
    </div>
  );
}
