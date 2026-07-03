import { useState, type FormEvent } from 'react';
import type { CreateLotRequest, Lot, UpdateLotRequest } from '@parking/shared';
import { centsToDollarsInput, dollarsToCents } from '../lib/lots';

interface CreateModeProps {
  mode: 'create';
  lot?: undefined;
  onSubmit: (data: CreateLotRequest) => void;
}

interface EditModeProps {
  mode: 'edit';
  lot: Lot;
  onSubmit: (data: UpdateLotRequest) => void;
}

type LotFormModalProps = (CreateModeProps | EditModeProps) & {
  onClose: () => void;
  isSubmitting: boolean;
  errorMessage?: string | null;
};

interface FormState {
  name: string;
  address: string;
  neighborhood: string;
  lat: string;
  lng: string;
  capacity: string;
  hourlyRate: string;
  status: 'active' | 'maintenance';
}

function initialState(lot: Lot | undefined): FormState {
  return {
    name: lot?.name ?? '',
    address: lot?.address ?? '',
    neighborhood: lot?.neighborhood ?? '',
    lat: lot ? String(lot.lat) : '',
    lng: lot ? String(lot.lng) : '',
    capacity: lot ? String(lot.capacity) : '',
    hourlyRate: lot ? centsToDollarsInput(lot.hourlyRateCents) : '',
    status: lot?.status === 'maintenance' ? 'maintenance' : 'active',
  };
}

export function LotFormModal(props: LotFormModalProps) {
  const { mode, lot, onClose, isSubmitting, errorMessage } = props;
  const [form, setForm] = useState<FormState>(() => initialState(lot));
  const [errors, setErrors] = useState<Record<string, string>>({});

  function setField<K extends keyof FormState>(key: K, value: FormState[K]) {
    setForm((prev) => ({ ...prev, [key]: value }));
  }

  function validate(): { valid: true; data: CreateLotRequest } | { valid: false } {
    const nextErrors: Record<string, string> = {};

    if (form.name.trim() === '') {
      nextErrors.name = 'Name is required.';
    }
    if (form.address.trim() === '') {
      nextErrors.address = 'Address is required.';
    }
    if (form.neighborhood.trim() === '') {
      nextErrors.neighborhood = 'Neighborhood is required.';
    }

    const lat = Number(form.lat);
    if (form.lat.trim() === '' || Number.isNaN(lat) || lat < -90 || lat > 90) {
      nextErrors.lat = 'Latitude must be a number between -90 and 90.';
    }

    const lng = Number(form.lng);
    if (form.lng.trim() === '' || Number.isNaN(lng) || lng < -180 || lng > 180) {
      nextErrors.lng = 'Longitude must be a number between -180 and 180.';
    }

    const capacity = Number(form.capacity);
    if (form.capacity.trim() === '' || Number.isNaN(capacity) || !Number.isInteger(capacity) || capacity <= 0) {
      nextErrors.capacity = 'Capacity must be a positive whole number.';
    }

    const hourlyRateCents = dollarsToCents(form.hourlyRate);
    if (Number.isNaN(hourlyRateCents) || hourlyRateCents <= 0) {
      nextErrors.hourlyRate = 'Rate must be a positive dollar amount.';
    }

    setErrors(nextErrors);

    if (Object.keys(nextErrors).length > 0) {
      return { valid: false };
    }

    return {
      valid: true,
      data: {
        name: form.name.trim(),
        address: form.address.trim(),
        neighborhood: form.neighborhood.trim(),
        lat,
        lng,
        capacity,
        hourlyRateCents,
      },
    };
  }

  function handleSubmit(event: FormEvent) {
    event.preventDefault();
    const result = validate();
    if (!result.valid) {
      return;
    }

    if (mode === 'edit') {
      props.onSubmit({ ...result.data, status: form.status });
    } else {
      props.onSubmit(result.data);
    }
  }

  const title = mode === 'create' ? 'Add Lot' : 'Edit Lot';
  const submitLabel = mode === 'create' ? 'Create Lot' : 'Save';

  return (
    <div className="modal-backdrop" role="presentation">
      <div className="modal" role="dialog" aria-modal="true" aria-label={title}>
        <h2>{title}</h2>
        <form onSubmit={handleSubmit} noValidate>
          <div className="form-field">
            <label htmlFor="lot-name">Name</label>
            <input
              id="lot-name"
              value={form.name}
              onChange={(e) => setField('name', e.target.value)}
            />
            {errors.name && <p className="form-error">{errors.name}</p>}
          </div>

          <div className="form-field">
            <label htmlFor="lot-address">Address</label>
            <input
              id="lot-address"
              value={form.address}
              onChange={(e) => setField('address', e.target.value)}
            />
            {errors.address && <p className="form-error">{errors.address}</p>}
          </div>

          <div className="form-field">
            <label htmlFor="lot-neighborhood">Neighborhood</label>
            <input
              id="lot-neighborhood"
              value={form.neighborhood}
              onChange={(e) => setField('neighborhood', e.target.value)}
            />
            {errors.neighborhood && <p className="form-error">{errors.neighborhood}</p>}
          </div>

          <div className="form-row">
            <div className="form-field">
              <label htmlFor="lot-lat">Latitude</label>
              <input id="lot-lat" value={form.lat} onChange={(e) => setField('lat', e.target.value)} />
              {errors.lat && <p className="form-error">{errors.lat}</p>}
            </div>

            <div className="form-field">
              <label htmlFor="lot-lng">Longitude</label>
              <input id="lot-lng" value={form.lng} onChange={(e) => setField('lng', e.target.value)} />
              {errors.lng && <p className="form-error">{errors.lng}</p>}
            </div>
          </div>

          <div className="form-row">
            <div className="form-field">
              <label htmlFor="lot-capacity">Capacity</label>
              <input
                id="lot-capacity"
                type="number"
                value={form.capacity}
                onChange={(e) => setField('capacity', e.target.value)}
              />
              {errors.capacity && <p className="form-error">{errors.capacity}</p>}
            </div>

            <div className="form-field">
              <label htmlFor="lot-rate">Hourly rate ($)</label>
              <input
                id="lot-rate"
                value={form.hourlyRate}
                onChange={(e) => setField('hourlyRate', e.target.value)}
              />
              {errors.hourlyRate && <p className="form-error">{errors.hourlyRate}</p>}
            </div>
          </div>

          {mode === 'edit' && (
            <div className="form-field">
              <label htmlFor="lot-status">Status</label>
              <select
                id="lot-status"
                value={form.status}
                onChange={(e) => setField('status', e.target.value as 'active' | 'maintenance')}
              >
                <option value="active">Active</option>
                <option value="maintenance">Maintenance</option>
              </select>
            </div>
          )}

          {errorMessage && (
            <p role="alert" className="form-error">
              {errorMessage}
            </p>
          )}

          <div className="modal-actions">
            <button type="button" className="btn btn-secondary" onClick={onClose} disabled={isSubmitting}>
              Cancel
            </button>
            <button type="submit" className="btn btn-primary" disabled={isSubmitting}>
              {submitLabel}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
