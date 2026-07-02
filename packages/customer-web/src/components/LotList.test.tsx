import { describe, expect, it } from 'vitest';
import { render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import type { Lot } from '@parking/shared';
import { LotList, getAvailabilityLevel } from './LotList';

function buildLot(overrides: Partial<Lot>): Lot {
  return {
    id: 'a2f4c1a0-1b2c-4d3e-8f4a-5b6c7d8e9f0a',
    name: 'Loop Garage',
    address: '123 Main St',
    neighborhood: 'Loop',
    lat: 41.8781,
    lng: -87.6298,
    capacity: 100,
    hourlyRateCents: 1200,
    status: 'active',
    availableSpaces: 50,
    createdAt: new Date().toISOString(),
    ...overrides,
  };
}

describe('getAvailabilityLevel', () => {
  it('returns green when more than 30% of capacity is free', () => {
    expect(getAvailabilityLevel(31, 100)).toBe('green');
  });

  it('returns amber at the 30% boundary', () => {
    expect(getAvailabilityLevel(30, 100)).toBe('amber');
  });

  it('returns amber at the 10% boundary', () => {
    expect(getAvailabilityLevel(10, 100)).toBe('amber');
  });

  it('returns red when less than 10% is free', () => {
    expect(getAvailabilityLevel(9, 100)).toBe('red');
  });

  it('returns red when nothing is available', () => {
    expect(getAvailabilityLevel(0, 100)).toBe('red');
  });
});

describe('LotList', () => {
  it('renders a badge and rate for each lot', () => {
    const lots = [
      buildLot({ id: 'lot-1', name: 'Loop Garage', availableSpaces: 50, capacity: 100, hourlyRateCents: 1200 }),
      buildLot({ id: 'lot-2', name: 'Full Lot', availableSpaces: 0, capacity: 50, hourlyRateCents: 500 }),
    ];

    render(
      <MemoryRouter>
        <LotList lots={lots} />
      </MemoryRouter>,
    );

    expect(screen.getByText('Loop Garage')).toBeInTheDocument();
    expect(screen.getByText('$12.00/hr')).toBeInTheDocument();
    expect(screen.getByText('Full')).toBeInTheDocument();

    const badges = screen.getAllByTestId('availability-badge');
    expect(badges[0]).toHaveClass('availability-green');
    expect(badges[1]).toHaveClass('availability-red');
  });

  it('shows an empty state when there are no lots', () => {
    render(
      <MemoryRouter>
        <LotList lots={[]} />
      </MemoryRouter>,
    );

    expect(screen.getByText('No lots found.')).toBeInTheDocument();
  });
});
