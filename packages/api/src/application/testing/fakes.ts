import { randomUUID } from 'node:crypto';
import type {
  AdminUserRecord,
  AdminUserRepository,
  Clock,
  LotRecord,
  LotRepository,
  PaymentGateway,
  ReservationRecord,
  ReservationRepository,
  ReservationTxn,
  ReservationUnitOfWork,
} from '../ports.js';

/**
 * Shared in-memory tables backing the fake repositories/unit-of-work below.
 * Tests construct one InMemoryDatabase and wire it into whichever fakes they need,
 * so writes made through the reservation flow are visible to the lot/reservation reads.
 */
export class InMemoryDatabase {
  readonly lots = new Map<string, LotRecord>();
  readonly reservations = new Map<string, ReservationRecord>();
  readonly customers = new Map<string, { id: string; name: string; email: string; phone: string }>();
  readonly payments: Array<{
    reservationId: string;
    amountCents: number;
    status: 'succeeded' | 'declined';
    transactionId: string;
    cardLast4: string;
  }> = [];

  seedLot(overrides: Partial<LotRecord> = {}): LotRecord {
    const lot: LotRecord = {
      id: randomUUID(),
      name: 'Test Lot',
      address: '123 Main St',
      neighborhood: 'Downtown',
      lat: 0,
      lng: 0,
      capacity: 10,
      hourlyRateCents: 500,
      status: 'active',
      createdAt: new Date(),
      ...overrides,
    };
    this.lots.set(lot.id, lot);
    return lot;
  }

  activeReservationCount(lotId: string): number {
    let count = 0;
    for (const reservation of this.reservations.values()) {
      if (reservation.lotId === lotId && reservation.status === 'active') {
        count++;
      }
    }
    return count;
  }
}

export class FakeLotRepository implements LotRepository {
  constructor(private readonly db: InMemoryDatabase) {}

  async findAllActive(): Promise<Array<LotRecord & { activeReservations: number }>> {
    return [...this.db.lots.values()]
      .filter((lot) => lot.status !== 'deleted')
      .map((lot) => ({ ...lot, activeReservations: this.db.activeReservationCount(lot.id) }));
  }

  async findById(id: string): Promise<(LotRecord & { activeReservations: number }) | null> {
    const lot = this.db.lots.get(id);
    if (!lot) return null;
    return { ...lot, activeReservations: this.db.activeReservationCount(lot.id) };
  }

  async create(data: Omit<LotRecord, 'id' | 'createdAt' | 'status'>): Promise<LotRecord> {
    const lot: LotRecord = { ...data, id: randomUUID(), status: 'active', createdAt: new Date() };
    this.db.lots.set(lot.id, lot);
    return lot;
  }

  async update(id: string, data: Partial<Omit<LotRecord, 'id' | 'createdAt'>>): Promise<LotRecord | null> {
    const existing = this.db.lots.get(id);
    if (!existing) return null;
    const updated: LotRecord = { ...existing, ...data };
    this.db.lots.set(id, updated);
    return updated;
  }

  async softDelete(id: string): Promise<boolean> {
    const existing = this.db.lots.get(id);
    if (!existing || existing.status === 'deleted') return false;
    this.db.lots.set(id, { ...existing, status: 'deleted' });
    return true;
  }
}

/**
 * Stages every write made during a single uow.execute() call and only applies
 * them to the shared InMemoryDatabase once the caller's fn resolves. If fn
 * throws, execute() never calls commit(), so nothing lands in the store —
 * mirroring a rolled-back Postgres transaction.
 */
class StagedReservationTxn implements ReservationTxn {
  private stagedCustomer: { id: string; name: string; email: string; phone: string } | undefined;
  private stagedReservation: ReservationRecord | undefined;
  private stagedPayment:
    | {
        reservationId: string;
        amountCents: number;
        status: 'succeeded' | 'declined';
        transactionId: string;
        cardLast4: string;
      }
    | undefined;

  constructor(private readonly db: InMemoryDatabase) {}

  async getLotForUpdate(lotId: string): Promise<LotRecord | null> {
    const lot = this.db.lots.get(lotId);
    return lot ? { ...lot } : null;
  }

  async countActiveOverlapping(lotId: string, start: Date, end: Date): Promise<number> {
    let count = 0;
    for (const reservation of this.db.reservations.values()) {
      if (
        reservation.lotId === lotId &&
        reservation.status === 'active' &&
        reservation.startTime < end &&
        reservation.endTime > start
      ) {
        count++;
      }
    }
    return count;
  }

  async upsertCustomer(c: { name: string; email: string; phone: string }): Promise<{ id: string }> {
    const existing = [...this.db.customers.values()].find((customer) => customer.email === c.email);
    const id = existing?.id ?? randomUUID();
    this.stagedCustomer = { id, name: c.name, email: c.email, phone: c.phone };
    return { id };
  }

  async insertReservation(r: Omit<ReservationRecord, 'id' | 'createdAt'>): Promise<ReservationRecord> {
    const reservation: ReservationRecord = { ...r, id: randomUUID(), createdAt: new Date() };
    this.stagedReservation = reservation;
    return reservation;
  }

  async insertPayment(p: {
    reservationId: string;
    amountCents: number;
    status: 'succeeded' | 'declined';
    transactionId: string;
    cardLast4: string;
  }): Promise<void> {
    this.stagedPayment = p;
  }

  commit(): void {
    if (this.stagedCustomer) {
      this.db.customers.set(this.stagedCustomer.id, this.stagedCustomer);
    }
    if (this.stagedReservation) {
      this.db.reservations.set(this.stagedReservation.id, this.stagedReservation);
    }
    if (this.stagedPayment) {
      this.db.payments.push(this.stagedPayment);
    }
  }
}

export class FakeReservationUnitOfWork implements ReservationUnitOfWork {
  constructor(private readonly db: InMemoryDatabase) {}

  async execute<T>(_lotId: string, fn: (txn: ReservationTxn) => Promise<T>): Promise<T> {
    const txn = new StagedReservationTxn(this.db);
    const result = await fn(txn);
    txn.commit();
    return result;
  }
}

export class FakeReservationRepository implements ReservationRepository {
  constructor(private readonly db: InMemoryDatabase) {}

  async findByIdWithDetails(
    id: string,
  ): Promise<
    (ReservationRecord & { lotName: string; lotAddress: string; customerName: string; cardLast4: string }) | null
  > {
    const reservation = this.db.reservations.get(id);
    if (!reservation) return null;
    const lot = this.db.lots.get(reservation.lotId);
    const customer = this.db.customers.get(reservation.customerId);
    const payment = this.db.payments.find((p) => p.reservationId === id);
    return {
      ...reservation,
      lotName: lot?.name ?? '',
      lotAddress: lot?.address ?? '',
      customerName: customer?.name ?? '',
      cardLast4: payment?.cardLast4 ?? '',
    };
  }
}

export class FakePaymentGateway implements PaymentGateway {
  readonly calls: Array<{ cardNumber: string; amountCents: number }> = [];

  constructor(
    private readonly shouldSucceed:
      | boolean
      | ((input: { cardNumber: string; amountCents: number }) => boolean) = true,
  ) {}

  async charge(input: { cardNumber: string; amountCents: number }): Promise<{
    success: boolean;
    transactionId: string;
  }> {
    this.calls.push(input);
    const success = typeof this.shouldSucceed === 'function' ? this.shouldSucceed(input) : this.shouldSucceed;
    return { success, transactionId: success ? `txn_fake_${this.calls.length}` : '' };
  }
}

export class FakeAdminUserRepository implements AdminUserRepository {
  private readonly usersByEmail = new Map<string, AdminUserRecord>();

  seedAdmin(overrides: Partial<AdminUserRecord> = {}): AdminUserRecord {
    const admin: AdminUserRecord = {
      id: randomUUID(),
      email: 'admin@example.com',
      passwordHash: '',
      ...overrides,
    };
    this.usersByEmail.set(admin.email, admin);
    return admin;
  }

  async findByEmail(email: string): Promise<AdminUserRecord | null> {
    return this.usersByEmail.get(email) ?? null;
  }

  async create(email: string, passwordHash: string): Promise<AdminUserRecord> {
    const admin: AdminUserRecord = { id: randomUUID(), email, passwordHash };
    this.usersByEmail.set(email, admin);
    return admin;
  }
}

export class FakeClock implements Clock {
  constructor(private date: Date = new Date('2026-01-01T00:00:00Z')) {}

  now(): Date {
    return this.date;
  }

  set(date: Date): void {
    this.date = date;
  }
}
