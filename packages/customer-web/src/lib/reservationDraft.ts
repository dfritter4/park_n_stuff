import { createContext, createElement, useContext, useState, type ReactNode } from 'react';
import type { Lot } from '@parking/shared';

export interface ReservationDraftCustomer {
  name: string;
  email: string;
  phone: string;
}

export interface ReservationDraftVehicle {
  make: string;
  model: string;
  licensePlate: string;
}

/**
 * Everything collected on the reservation form that PaymentPage needs to
 * submit `POST /api/reservations`. Held in memory only (React context) — a
 * hard refresh or direct navigation to /pay loses it, which is intentional:
 * PaymentPage treats a missing draft as an invalid deep link and redirects
 * back to the lot detail page.
 */
export interface ReservationDraft {
  lot: Lot;
  customer: ReservationDraftCustomer;
  vehicle: ReservationDraftVehicle;
  startTime: string;
  endTime: string;
}

interface ReservationDraftContextValue {
  draft: ReservationDraft | null;
  setDraft: (draft: ReservationDraft) => void;
  clearDraft: () => void;
}

const ReservationDraftContext = createContext<ReservationDraftContextValue | undefined>(undefined);

export function ReservationDraftProvider({ children }: { children: ReactNode }) {
  const [draft, setDraftState] = useState<ReservationDraft | null>(null);

  const value: ReservationDraftContextValue = {
    draft,
    setDraft: setDraftState,
    clearDraft: () => setDraftState(null),
  };

  return createElement(ReservationDraftContext.Provider, { value }, children);
}

export function useReservationDraft(): ReservationDraftContextValue {
  const ctx = useContext(ReservationDraftContext);
  if (!ctx) {
    throw new Error('useReservationDraft must be used within a ReservationDraftProvider');
  }
  return ctx;
}
