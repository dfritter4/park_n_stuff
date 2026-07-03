import { describe, expect, it } from 'vitest';
import { render, screen } from '@testing-library/react';
import type { DashboardResponse } from '@parking/shared';
import { ActivityFeed } from './ActivityFeed';

function makeReservation(
  overrides: Partial<DashboardResponse['recentReservations'][number]> = {},
): DashboardResponse['recentReservations'][number] {
  return {
    reservationNumber: 'RES-1',
    lotName: 'Loop Garage',
    startTime: '2026-07-02T10:00:00.000Z',
    endTime: '2026-07-02T12:00:00.000Z',
    totalCostCents: 1500,
    createdAt: new Date().toISOString(),
    ...overrides,
  };
}

describe('ActivityFeed', () => {
  it('renders a status dot and reservation details per row', () => {
    const { container } = render(<ActivityFeed reservations={[makeReservation()]} />);

    expect(container.querySelector('.activity-feed-status-dot')).toBeInTheDocument();
    expect(screen.getByText('RES-1')).toBeInTheDocument();
    expect(screen.getByText('Loop Garage')).toBeInTheDocument();
  });

  it('shows the relative created-at time as the last (right-aligned) column', () => {
    const { container } = render(<ActivityFeed reservations={[makeReservation()]} />);

    const secondary = container.querySelector('.activity-feed-secondary');
    expect(secondary?.lastElementChild).toHaveClass('activity-feed-created-at');
    expect(secondary?.lastElementChild).toHaveTextContent('just now');
  });

  it('renders an empty state with no reservations', () => {
    render(<ActivityFeed reservations={[]} />);

    expect(screen.getByText('No recent reservations.')).toBeInTheDocument();
  });
});
