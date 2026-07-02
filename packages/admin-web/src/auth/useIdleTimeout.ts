import { useEffect, useRef } from 'react';

const ACTIVITY_EVENTS = ['mousemove', 'keydown', 'click', 'scroll'] as const;

interface UseIdleTimeoutOptions {
  enabled: boolean;
  timeoutMs: number;
  throttleMs?: number;
  onIdle: () => void;
}

/**
 * Calls `onIdle` after `timeoutMs` of no user activity. Activity is detected
 * via mousemove/keydown/click/scroll listeners on `window`, throttled to
 * avoid resetting the timer on every mouse-move event.
 */
export function useIdleTimeout({ enabled, timeoutMs, throttleMs = 1000, onIdle }: UseIdleTimeoutOptions): void {
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const lastResetRef = useRef(0);
  const onIdleRef = useRef(onIdle);
  onIdleRef.current = onIdle;

  useEffect(() => {
    if (!enabled) {
      return;
    }

    function resetTimer() {
      if (timerRef.current) {
        clearTimeout(timerRef.current);
      }
      timerRef.current = setTimeout(() => onIdleRef.current(), timeoutMs);
    }

    function handleActivity() {
      const now = Date.now();
      if (now - lastResetRef.current < throttleMs) {
        return;
      }
      lastResetRef.current = now;
      resetTimer();
    }

    resetTimer();
    for (const eventName of ACTIVITY_EVENTS) {
      window.addEventListener(eventName, handleActivity);
    }

    return () => {
      if (timerRef.current) {
        clearTimeout(timerRef.current);
        timerRef.current = null;
      }
      for (const eventName of ACTIVITY_EVENTS) {
        window.removeEventListener(eventName, handleActivity);
      }
    };
  }, [enabled, timeoutMs, throttleMs]);
}
