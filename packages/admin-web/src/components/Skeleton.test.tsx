import { describe, expect, it } from 'vitest';
import { render } from '@testing-library/react';
import { Skeleton } from './Skeleton';

describe('Skeleton', () => {
  it('renders a single hidden skeleton span by default', () => {
    const { container } = render(<Skeleton />);
    const spans = container.querySelectorAll('span.skeleton');
    expect(spans).toHaveLength(1);
    expect(spans[0]).toHaveAttribute('aria-hidden', 'true');
  });

  it('renders `count` skeleton spans', () => {
    const { container } = render(<Skeleton count={4} />);
    expect(container.querySelectorAll('span.skeleton')).toHaveLength(4);
  });

  it('applies the given height and width as inline styles', () => {
    const { container } = render(<Skeleton height="2rem" width="10rem" />);
    const span = container.querySelector('span.skeleton') as HTMLElement;
    expect(span.style.height).toBe('2rem');
    expect(span.style.width).toBe('10rem');
  });
});
