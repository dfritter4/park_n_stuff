import { describe, expect, it } from 'vitest';
import { render, screen } from '@testing-library/react';
import { MetricCard } from './MetricCard';
import { formatCentsAsDollars } from '../lib/format';

describe('MetricCard', () => {
  it('renders the label and value', () => {
    render(<MetricCard label="Revenue today" value={formatCentsAsDollars(123456)} />);

    expect(screen.getByText('Revenue today')).toBeInTheDocument();
    expect(screen.getByText('$1234.56')).toBeInTheDocument();
  });

  it('renders whole-dollar cent amounts with two decimal places', () => {
    render(<MetricCard label="Revenue today" value={formatCentsAsDollars(500)} />);

    expect(screen.getByText('$5.00')).toBeInTheDocument();
  });

  it('renders zero cents correctly', () => {
    render(<MetricCard label="Revenue today" value={formatCentsAsDollars(0)} />);

    expect(screen.getByText('$0.00')).toBeInTheDocument();
  });
});
