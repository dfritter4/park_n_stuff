import { describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen } from '@testing-library/react';
import { LotFormModal } from './LotFormModal';
import type { Lot } from '@parking/shared';

const existingLot: Lot = {
  id: '11111111-1111-1111-1111-111111111111',
  name: 'Loop Garage',
  address: '123 Main St',
  neighborhood: 'Loop',
  lat: 47.6062,
  lng: -122.3321,
  capacity: 100,
  hourlyRateCents: 850,
  status: 'active',
  availableSpaces: 40,
  createdAt: '2026-01-01T00:00:00.000Z',
};

function fillValidCreateForm() {
  fireEvent.change(screen.getByLabelText(/name/i), { target: { value: 'New Lot' } });
  fireEvent.change(screen.getByLabelText(/address/i), { target: { value: '456 Elm St' } });
  fireEvent.change(screen.getByLabelText(/neighborhood/i), { target: { value: 'Downtown' } });
  fireEvent.change(screen.getByLabelText(/latitude/i), { target: { value: '47.6' } });
  fireEvent.change(screen.getByLabelText(/longitude/i), { target: { value: '-122.3' } });
  fireEvent.change(screen.getByLabelText(/capacity/i), { target: { value: '50' } });
  fireEvent.change(screen.getByLabelText(/hourly rate/i), { target: { value: '8.50' } });
}

describe('LotFormModal', () => {
  it('renders in create mode with empty fields and a Create Lot submit button', () => {
    render(<LotFormModal mode="create" onSubmit={vi.fn()} onClose={vi.fn()} isSubmitting={false} />);

    expect(screen.getByLabelText(/name/i)).toHaveValue('');
    expect(screen.getByRole('button', { name: /create lot/i })).toBeInTheDocument();
  });

  it('pre-fills fields in edit mode from the given lot, with the rate shown in dollars', () => {
    render(<LotFormModal mode="edit" lot={existingLot} onSubmit={vi.fn()} onClose={vi.fn()} isSubmitting={false} />);

    expect(screen.getByLabelText(/name/i)).toHaveValue('Loop Garage');
    expect(screen.getByLabelText(/capacity/i)).toHaveValue(100);
    expect(screen.getByLabelText(/hourly rate/i)).toHaveValue('8.50');
    expect(screen.getByRole('button', { name: /save/i })).toBeInTheDocument();
  });

  it('rejects submission with an empty name and does not call onSubmit', () => {
    const onSubmit = vi.fn();
    render(<LotFormModal mode="create" onSubmit={onSubmit} onClose={vi.fn()} isSubmitting={false} />);

    fillValidCreateForm();
    fireEvent.change(screen.getByLabelText(/name/i), { target: { value: '' } });
    fireEvent.click(screen.getByRole('button', { name: /create lot/i }));

    expect(onSubmit).not.toHaveBeenCalled();
    expect(screen.getByText(/name is required/i)).toBeInTheDocument();
  });

  it('rejects submission with a zero or negative capacity and does not call onSubmit', () => {
    const onSubmit = vi.fn();
    render(<LotFormModal mode="create" onSubmit={onSubmit} onClose={vi.fn()} isSubmitting={false} />);

    fillValidCreateForm();
    fireEvent.change(screen.getByLabelText(/capacity/i), { target: { value: '0' } });
    fireEvent.click(screen.getByRole('button', { name: /create lot/i }));

    expect(onSubmit).not.toHaveBeenCalled();
    expect(screen.getByText(/capacity must be a positive/i)).toBeInTheDocument();
  });

  it('rejects submission with a zero or negative hourly rate and does not call onSubmit', () => {
    const onSubmit = vi.fn();
    render(<LotFormModal mode="create" onSubmit={onSubmit} onClose={vi.fn()} isSubmitting={false} />);

    fillValidCreateForm();
    fireEvent.change(screen.getByLabelText(/hourly rate/i), { target: { value: '-1' } });
    fireEvent.click(screen.getByRole('button', { name: /create lot/i }));

    expect(onSubmit).not.toHaveBeenCalled();
    expect(screen.getByText(/rate must be a positive/i)).toBeInTheDocument();
  });

  it('rejects submission with a non-numeric hourly rate and does not call onSubmit', () => {
    const onSubmit = vi.fn();
    render(<LotFormModal mode="create" onSubmit={onSubmit} onClose={vi.fn()} isSubmitting={false} />);

    fillValidCreateForm();
    fireEvent.change(screen.getByLabelText(/hourly rate/i), { target: { value: 'abc' } });
    fireEvent.click(screen.getByRole('button', { name: /create lot/i }));

    expect(onSubmit).not.toHaveBeenCalled();
    expect(screen.getByText(/rate must be a positive/i)).toBeInTheDocument();
  });

  it('submits a fractional dollar rate converted to integer cents (8.50 -> 850)', () => {
    const onSubmit = vi.fn();
    render(<LotFormModal mode="create" onSubmit={onSubmit} onClose={vi.fn()} isSubmitting={false} />);

    fillValidCreateForm();
    fireEvent.click(screen.getByRole('button', { name: /create lot/i }));

    expect(onSubmit).toHaveBeenCalledTimes(1);
    expect(onSubmit).toHaveBeenCalledWith(
      expect.objectContaining({
        name: 'New Lot',
        address: '456 Elm St',
        neighborhood: 'Downtown',
        lat: 47.6,
        lng: -122.3,
        capacity: 50,
        hourlyRateCents: 850,
      }),
    );
  });

  it('submits a whole-dollar rate converted to integer cents (12 -> 1200)', () => {
    const onSubmit = vi.fn();
    render(<LotFormModal mode="create" onSubmit={onSubmit} onClose={vi.fn()} isSubmitting={false} />);

    fillValidCreateForm();
    fireEvent.change(screen.getByLabelText(/hourly rate/i), { target: { value: '12' } });
    fireEvent.click(screen.getByRole('button', { name: /create lot/i }));

    expect(onSubmit).toHaveBeenCalledWith(expect.objectContaining({ hourlyRateCents: 1200 }));
  });

  it('includes the status field when editing and submits the selected status', () => {
    const onSubmit = vi.fn();
    render(<LotFormModal mode="edit" lot={existingLot} onSubmit={onSubmit} onClose={vi.fn()} isSubmitting={false} />);

    fireEvent.change(screen.getByLabelText(/status/i), { target: { value: 'maintenance' } });
    fireEvent.click(screen.getByRole('button', { name: /save/i }));

    expect(onSubmit).toHaveBeenCalledWith(expect.objectContaining({ status: 'maintenance' }));
  });

  it('calls onClose when the cancel button is clicked', () => {
    const onClose = vi.fn();
    render(<LotFormModal mode="create" onSubmit={vi.fn()} onClose={onClose} isSubmitting={false} />);

    fireEvent.click(screen.getByRole('button', { name: /cancel/i }));

    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it('disables the submit button while isSubmitting is true', () => {
    render(<LotFormModal mode="create" onSubmit={vi.fn()} onClose={vi.fn()} isSubmitting />);

    fillValidCreateForm();

    expect(screen.getByRole('button', { name: /create lot/i })).toBeDisabled();
  });
});
