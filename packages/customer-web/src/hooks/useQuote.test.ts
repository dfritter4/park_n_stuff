import { act, renderHook } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { useQuote } from './useQuote';
import { apiFetch } from '../api/client';

vi.mock('../api/client', () => ({
  apiFetch: vi.fn(),
}));

const mockedApiFetch = vi.mocked(apiFetch);

const LOT_ID = '11111111-1111-1111-1111-111111111111';
const START = '2026-07-02T10:00:00.000Z';
const END = '2026-07-02T12:00:00.000Z';

describe('useQuote', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    mockedApiFetch.mockReset();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('does not call the API before the 400ms debounce elapses', () => {
    mockedApiFetch.mockResolvedValue({ totalCostCents: 2500, billedHours: 2 });

    renderHook(() => useQuote(LOT_ID, START, END));

    act(() => {
      vi.advanceTimersByTime(399);
    });

    expect(mockedApiFetch).not.toHaveBeenCalled();
  });

  it('fetches the quote once the debounce elapses and exposes it', async () => {
    mockedApiFetch.mockResolvedValue({ totalCostCents: 2500, billedHours: 2 });

    const { result } = renderHook(() => useQuote(LOT_ID, START, END));

    expect(result.current.isLoading).toBe(true);

    await act(async () => {
      await vi.advanceTimersByTimeAsync(400);
    });

    expect(mockedApiFetch).toHaveBeenCalledWith(
      `/api/lots/${LOT_ID}/quote?startTime=${encodeURIComponent(START)}&endTime=${encodeURIComponent(END)}`,
    );
    expect(result.current.quote).toEqual({ totalCostCents: 2500, billedHours: 2 });
    expect(result.current.isLoading).toBe(false);
  });

  it('resets the debounce timer when the window changes before it fires', () => {
    mockedApiFetch.mockResolvedValue({ totalCostCents: 2500, billedHours: 2 });

    const { rerender } = renderHook(({ start, end }) => useQuote(LOT_ID, start, end), {
      initialProps: { start: START, end: END },
    });

    act(() => {
      vi.advanceTimersByTime(300);
    });

    rerender({ start: START, end: '2026-07-02T13:00:00.000Z' });

    act(() => {
      vi.advanceTimersByTime(300);
    });

    expect(mockedApiFetch).not.toHaveBeenCalled();

    act(() => {
      vi.advanceTimersByTime(100);
    });

    expect(mockedApiFetch).toHaveBeenCalledTimes(1);
  });

  it('keeps quote null and stops loading when the request errors', async () => {
    mockedApiFetch.mockRejectedValue(new Error('network down'));

    const { result } = renderHook(() => useQuote(LOT_ID, START, END));

    await act(async () => {
      await vi.advanceTimersByTimeAsync(400);
    });

    expect(result.current.isLoading).toBe(false);
    expect(result.current.quote).toBeNull();
  });

  it('does not fetch when the window is invalid or incomplete', () => {
    renderHook(() => useQuote(LOT_ID, '', ''));
    act(() => {
      vi.advanceTimersByTime(1000);
    });
    expect(mockedApiFetch).not.toHaveBeenCalled();

    renderHook(() => useQuote(LOT_ID, END, START));
    act(() => {
      vi.advanceTimersByTime(1000);
    });
    expect(mockedApiFetch).not.toHaveBeenCalled();
  });
});
