import { describe, expect, it } from 'vitest';
import { render, screen } from '@testing-library/react';
import { LotGauge } from './LotGauge';

describe('LotGauge', () => {
  it('renders the capacity fraction and revenue', () => {
    render(<LotGauge name="Loop Garage" capacity={250} occupied={42} revenueTodayCents={5000} />);

    expect(screen.getByText('Loop Garage')).toBeInTheDocument();
    expect(screen.getByText('42 / 250')).toBeInTheDocument();
    expect(screen.getByText('$50.00 today')).toBeInTheDocument();
  });

  it('colors the fill success when comfortably under capacity', () => {
    const { container } = render(<LotGauge name="Loop Garage" capacity={100} occupied={40} revenueTodayCents={0} />);

    expect(container.querySelector('.lot-gauge-bar-fill-success')).toBeInTheDocument();
    expect(screen.getByText('40%')).toBeInTheDocument();
  });

  it('colors the fill warning between 70 and 90 percent', () => {
    const { container } = render(<LotGauge name="Loop Garage" capacity={100} occupied={80} revenueTodayCents={0} />);

    expect(container.querySelector('.lot-gauge-bar-fill-warning')).toBeInTheDocument();
  });

  it('colors the fill danger above 90 percent', () => {
    const { container } = render(<LotGauge name="Loop Garage" capacity={100} occupied={95} revenueTodayCents={0} />);

    expect(container.querySelector('.lot-gauge-bar-fill-danger')).toBeInTheDocument();
  });
});
