import { useEffect, useState } from 'react';

export type GeolocationStatus = 'idle' | 'granted' | 'denied';

export interface GeolocationState {
  status: GeolocationStatus;
  coords: { lat: number; lng: number } | null;
}

/**
 * Requests the browser's geolocation once on mount. `idle` is the transient
 * state while the permission prompt / lookup is in flight; callers should
 * treat `idle` and `denied` the same way for fallback UI, distinguishing
 * only to avoid flashing a "denied" state before the browser has answered.
 */
export function useGeolocation(): GeolocationState {
  const [state, setState] = useState<GeolocationState>({ status: 'idle', coords: null });

  useEffect(() => {
    if (typeof navigator === 'undefined' || !navigator.geolocation) {
      setState({ status: 'denied', coords: null });
      return;
    }

    navigator.geolocation.getCurrentPosition(
      (position) => {
        setState({
          status: 'granted',
          coords: { lat: position.coords.latitude, lng: position.coords.longitude },
        });
      },
      () => {
        setState({ status: 'denied', coords: null });
      },
    );
  }, []);

  return state;
}
