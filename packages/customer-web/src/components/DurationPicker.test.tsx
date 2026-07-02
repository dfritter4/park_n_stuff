import { useState } from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen } from '@testing-library/react';
import { DurationPicker } from './DurationPicker';

const HOURLY_RATE_CENTS = 1000; // $10/hr

function ControlledDurationPicker() {
  const [range, setRange] = useState({ startTime: '', endTime: '' });
  return (
    <DurationPicker
      hourlyRateCents={HOURLY_RATE_CENTS}
      startTime={range.startTime}
      endTime={range.endTime}
      onChange={setRange}
    />
  );
}

describe('DurationPicker', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-07-02T10:00:00Z'));
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('renders a preset chip for each duration option', () => {
    render(
      <DurationPicker hourlyRateCents={HOURLY_RATE_CENTS} startTime="" endTime="" onChange={vi.fn()} />,
    );

    for (const label of ['30m', '1h', '2h', '4h', '8h']) {
      expect(screen.getByRole('button', { name: label })).toBeInTheDocument();
    }
  });

  it('selecting the 1h preset sets start to now and end one hour later', () => {
    const onChange = vi.fn();

    render(
      <DurationPicker hourlyRateCents={HOURLY_RATE_CENTS} startTime="" endTime="" onChange={onChange} />,
    );

    fireEvent.click(screen.getByRole('button', { name: '1h' }));

    expect(onChange).toHaveBeenCalledWith({
      startTime: '2026-07-02T10:00:00.000Z',
      endTime: '2026-07-02T11:00:00.000Z',
    });
  });

  it('selecting the 30m preset sets end 30 minutes after start', () => {
    const onChange = vi.fn();

    render(
      <DurationPicker hourlyRateCents={HOURLY_RATE_CENTS} startTime="" endTime="" onChange={onChange} />,
    );

    fireEvent.click(screen.getByRole('button', { name: '30m' }));

    expect(onChange).toHaveBeenCalledWith({
      startTime: '2026-07-02T10:00:00.000Z',
      endTime: '2026-07-02T10:30:00.000Z',
    });
  });

  it('selecting the 8h preset sets end eight hours after start', () => {
    const onChange = vi.fn();

    render(
      <DurationPicker hourlyRateCents={HOURLY_RATE_CENTS} startTime="" endTime="" onChange={onChange} />,
    );

    fireEvent.click(screen.getByRole('button', { name: '8h' }));

    expect(onChange).toHaveBeenCalledWith({
      startTime: '2026-07-02T10:00:00.000Z',
      endTime: '2026-07-02T18:00:00.000Z',
    });
  });

  it('shows a live cost preview once a preset is selected', () => {
    render(<ControlledDurationPicker />);

    fireEvent.click(screen.getByRole('button', { name: '2h' }));

    expect(screen.getByText('$20.00')).toBeInTheDocument();
  });

  it('marks the matching preset as selected and highlights it', () => {
    render(<ControlledDurationPicker />);

    const oneHourButton = screen.getByRole('button', { name: '1h' });
    fireEvent.click(oneHourButton);

    expect(oneHourButton).toHaveAttribute('aria-pressed', 'true');
  });

  it('allows a custom start and end via datetime-local inputs and reports the cost', () => {
    render(<ControlledDurationPicker />);

    const startInput = screen.getByLabelText('Start');
    const endInput = screen.getByLabelText('End');

    fireEvent.change(startInput, { target: { value: '2026-07-02T12:00' } });
    fireEvent.change(endInput, { target: { value: '2026-07-02T13:30' } });

    expect(screen.getByText('$20.00')).toBeInTheDocument();
  });

  it('shows no cost preview when the range is empty', () => {
    render(<ControlledDurationPicker />);

    expect(screen.queryByTestId('duration-cost-preview')).not.toBeInTheDocument();
  });
});
