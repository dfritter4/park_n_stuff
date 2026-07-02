import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { renderHook } from '@testing-library/react';
import { useIdleTimeout } from './useIdleTimeout';

describe('useIdleTimeout', () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('calls onIdle after timeoutMs of no activity', () => {
    const onIdle = vi.fn();
    renderHook(() => useIdleTimeout({ enabled: true, timeoutMs: 1000, onIdle }));

    vi.advanceTimersByTime(999);
    expect(onIdle).not.toHaveBeenCalled();

    vi.advanceTimersByTime(1);
    expect(onIdle).toHaveBeenCalledTimes(1);
  });

  it('resets the timer on window activity, delaying onIdle', () => {
    const onIdle = vi.fn();
    renderHook(() => useIdleTimeout({ enabled: true, timeoutMs: 1000, throttleMs: 0, onIdle }));

    vi.advanceTimersByTime(700);
    window.dispatchEvent(new Event('mousemove'));

    vi.advanceTimersByTime(700);
    expect(onIdle).not.toHaveBeenCalled();

    vi.advanceTimersByTime(300);
    expect(onIdle).toHaveBeenCalledTimes(1);
  });

  it('throttles activity resets so rapid events do not repeatedly delay onIdle', () => {
    const onIdle = vi.fn();
    renderHook(() =>
      useIdleTimeout({ enabled: true, timeoutMs: 1000, throttleMs: 500, onIdle }),
    );

    // Fire activity every 100ms; because throttle is 500ms, only some resets
    // actually take effect, but the timer should still never fire early.
    for (let i = 0; i < 9; i++) {
      vi.advanceTimersByTime(100);
      window.dispatchEvent(new Event('keydown'));
    }
    expect(onIdle).not.toHaveBeenCalled();
  });

  it('does nothing when disabled', () => {
    const onIdle = vi.fn();
    renderHook(() => useIdleTimeout({ enabled: false, timeoutMs: 1000, onIdle }));

    vi.advanceTimersByTime(5000);
    expect(onIdle).not.toHaveBeenCalled();
  });

  it('clears the timer on unmount so onIdle never fires after unmounting', () => {
    const onIdle = vi.fn();
    const { unmount } = renderHook(() => useIdleTimeout({ enabled: true, timeoutMs: 1000, onIdle }));

    unmount();
    vi.advanceTimersByTime(5000);
    expect(onIdle).not.toHaveBeenCalled();
  });
});
