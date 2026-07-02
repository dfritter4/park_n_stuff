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
