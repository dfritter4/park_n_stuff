export interface LotRecord {
  id: string;
  name: string;
  address: string;
  neighborhood: string;
  lat: number;
  lng: number;
  capacity: number;
  hourlyRateCents: number;
  status: 'active' | 'maintenance' | 'deleted';
  createdAt: Date;
}
export interface ReservationRecord {
  id: string;
  reservationNumber: string;
  lotId: string;
  customerId: string;
  vehicleMake: string;
  vehicleModel: string;
  licensePlate: string;
  startTime: Date;
  endTime: Date;
  totalCostCents: number;
  status: 'active' | 'completed' | 'cancelled';
  createdAt: Date;
}
export interface LotRepository {
  findAllActive(): Promise<Array<LotRecord & { activeReservations: number }>>;
  findById(id: string): Promise<(LotRecord & { activeReservations: number }) | null>;
  create(data: Omit<LotRecord, 'id' | 'createdAt' | 'status'>): Promise<LotRecord>;
  update(id: string, data: Partial<Omit<LotRecord, 'id' | 'createdAt'>>): Promise<LotRecord | null>;
  softDelete(id: string): Promise<boolean>;
}
export interface ReservationUnitOfWork {
  // Runs fn transactionally with the lot row locked; countActiveOverlapping counts
  // status='active' reservations overlapping [start,end) for the lot.
  execute<T>(lotId: string, fn: (txn: ReservationTxn) => Promise<T>): Promise<T>;
}
export interface ReservationTxn {
  getLotForUpdate(lotId: string): Promise<LotRecord | null>;
  countActiveOverlapping(lotId: string, start: Date, end: Date): Promise<number>;
  /**
   * Capacity overrides overlapping [start, end), read via the same client as
   * the lot's FOR UPDATE lock so the capacity gate sees a consistent
   * snapshot within the transaction (P2 extension — mirrors
   * CapacityOverrideRepository.listActiveForWindow's contract).
   */
  listActiveCapacityOverrides(lotId: string, start: Date, end: Date): Promise<CapacityOverrideRecord[]>;
  /**
   * Looks up an existing customer's flagged status by email, read inside the
   * transaction so the flagged gate is checked before any charge is
   * attempted (P2 extension, needed by the CUSTOMER_FLAGGED gate).
   */
  findCustomerByEmail(email: string): Promise<{ id: string; flagged: boolean } | null>;
  upsertCustomer(c: { name: string; email: string; phone: string }): Promise<{ id: string }>;
  insertReservation(r: Omit<ReservationRecord, 'id' | 'createdAt'>): Promise<ReservationRecord>;
  insertPayment(p: {
    reservationId: string;
    amountCents: number;
    status: 'succeeded' | 'declined';
    transactionId: string;
    cardLast4: string;
  }): Promise<void>;
}
export interface ReservationRepository {
  findByIdWithDetails(
    id: string,
  ): Promise<
    (ReservationRecord & { lotName: string; lotAddress: string; customerName: string; cardLast4: string }) | null
  >;
}
export interface AdminUserRecord {
  id: string;
  email: string;
  passwordHash: string;
}
export interface AdminUserRepository {
  findByEmail(email: string): Promise<AdminUserRecord | null>;
  create(email: string, passwordHash: string): Promise<AdminUserRecord>;
}
export interface PaymentGateway {
  charge(input: { cardNumber: string; amountCents: number }): Promise<{ success: boolean; transactionId: string }>;
}
export interface Clock {
  now(): Date;
}

export interface Pagination {
  page: number;
  pageSize: number;
}

export interface PricingRuleRecord {
  id: string;
  lotId: string;
  dayType: 'weekday' | 'weekend' | 'all';
  startHour: number;
  endHour: number;
  hourlyRateCents: number;
  createdAt: Date;
}
export interface PricingRuleRepository {
  listByLot(lotId: string): Promise<PricingRuleRecord[]>;
  create(lotId: string, data: Omit<PricingRuleRecord, 'id' | 'lotId' | 'createdAt'>): Promise<PricingRuleRecord>;
  delete(id: string): Promise<boolean>;
}

export interface CapacityOverrideRecord {
  id: string;
  lotId: string;
  spacesClosed: number;
  reason: string | null;
  startsAt: Date;
  endsAt: Date | null;
  createdAt: Date;
}
export interface CapacityOverrideRepository {
  listByLot(lotId: string): Promise<CapacityOverrideRecord[]>;
  /** Overrides overlapping [start, end) — the set effectiveCapacity() needs for a window. */
  listActiveForWindow(lotId: string, start: Date, end: Date): Promise<CapacityOverrideRecord[]>;
  create(
    lotId: string,
    data: Omit<CapacityOverrideRecord, 'id' | 'lotId' | 'createdAt'>,
  ): Promise<CapacityOverrideRecord>;
  delete(id: string): Promise<boolean>;
}

export interface DeclinedAttemptRecord {
  id: string;
  lotId: string;
  lotName: string;
  amountCents: number;
  cardLast4: string;
  createdAt: Date;
}
export interface DeclinedAttemptRepository {
  insert(data: { lotId: string; amountCents: number; cardLast4: string }): Promise<void>;
  /** Every attempt recorded at/after `since`, newest-first — callers derive totals/byDay/recent from this. */
  listSince(since: Date): Promise<DeclinedAttemptRecord[]>;
}

export interface AdminReservationListItem {
  id: string;
  reservationNumber: string;
  lotId: string;
  lotName: string;
  customerName: string;
  vehicleMake: string;
  vehicleModel: string;
  licensePlate: string;
  startTime: Date;
  endTime: Date;
  totalCostCents: number;
  status: 'active' | 'completed' | 'cancelled';
  createdAt: Date;
}
export interface AdminReservationDetailRecord extends AdminReservationListItem {
  customer: { name: string; email: string; phone: string; flagged: boolean };
  payments: Array<{
    amountCents: number;
    status: 'succeeded' | 'declined' | 'refunded';
    transactionId: string;
    cardLast4: string;
    createdAt: Date;
  }>;
}
export interface AdminReservationFilters {
  lotId?: string;
  status?: 'active' | 'completed' | 'cancelled';
  from?: Date;
  to?: Date;
  search?: string;
  activeNow?: boolean;
}
export interface CurrentInLotRecord {
  reservationNumber: string;
  licensePlate: string;
  vehicleMake: string;
  vehicleModel: string;
  customerName: string;
  startTime: Date;
  endTime: Date;
}
/**
 * Transactional handle for cancel/extend, mirroring the lock-then-mutate
 * shape of ReservationTxn above: callers fetch the reservation (and, for
 * extend, the lot) FOR UPDATE before validating and writing so concurrent
 * requests against the same reservation/lot serialize correctly.
 */
export interface AdminReservationTxn {
  getReservationForUpdate(id: string): Promise<(ReservationRecord & { lotId: string }) | null>;
  getLotForUpdate(lotId: string): Promise<LotRecord | null>;
  countActiveOverlapping(lotId: string, start: Date, end: Date, excludeReservationId?: string): Promise<number>;
  getOriginalCardLast4(reservationId: string): Promise<string | null>;
  cancelReservation(id: string): Promise<void>;
  refundSucceededPayments(reservationId: string): Promise<void>;
  extendReservation(id: string, newEndTime: Date, newTotalCostCents: number): Promise<void>;
  insertPayment(p: {
    reservationId: string;
    amountCents: number;
    status: 'succeeded' | 'declined' | 'refunded';
    transactionId: string;
    cardLast4: string;
  }): Promise<void>;
}
export interface AdminReservationRepository {
  list(
    filters: AdminReservationFilters,
    pagination: Pagination,
  ): Promise<{ rows: AdminReservationListItem[]; total: number }>;
  findDetailById(id: string): Promise<AdminReservationDetailRecord | null>;
  listCurrentInLot(lotId: string, now: Date): Promise<CurrentInLotRecord[]>;
  withTransaction<T>(fn: (txn: AdminReservationTxn) => Promise<T>): Promise<T>;
}

export interface AdminCustomerListItem {
  id: string;
  name: string;
  email: string;
  phone: string;
  flagged: boolean;
  flagReason: string | null;
  reservationCount: number;
  lifetimeSpendCents: number;
}
export interface AdminCustomerDetailRecord extends AdminCustomerListItem {
  /** Latest 50 reservations for this customer, newest-first. */
  reservations: AdminReservationListItem[];
}
export interface AdminCustomerRepository {
  list(
    filters: { search?: string },
    pagination: Pagination,
  ): Promise<{ rows: AdminCustomerListItem[]; total: number }>;
  findDetailById(id: string): Promise<AdminCustomerDetailRecord | null>;
  setFlag(id: string, flagged: boolean, reason: string | null): Promise<boolean>;
}
