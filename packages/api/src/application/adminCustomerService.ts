import type { AdminCustomer, AdminCustomerDetail, AdminCustomerListResponse, AdminReservation } from '@parking/shared';
import { CustomerNotFoundError } from '../domain/errors.js';
import type { AdminCustomerListItem, AdminCustomerRepository, AdminReservationListItem, Pagination } from './ports.js';

function toAdminCustomer(record: AdminCustomerListItem): AdminCustomer {
  return {
    id: record.id,
    name: record.name,
    email: record.email,
    phone: record.phone,
    flagged: record.flagged,
    flagReason: record.flagReason,
    reservationCount: record.reservationCount,
    lifetimeSpendCents: record.lifetimeSpendCents,
  };
}

function toAdminReservation(record: AdminReservationListItem): AdminReservation {
  return {
    id: record.id,
    reservationNumber: record.reservationNumber,
    lotId: record.lotId,
    lotName: record.lotName,
    customerName: record.customerName,
    vehicleMake: record.vehicleMake,
    vehicleModel: record.vehicleModel,
    licensePlate: record.licensePlate,
    startTime: record.startTime.toISOString(),
    endTime: record.endTime.toISOString(),
    totalCostCents: record.totalCostCents,
    status: record.status,
    createdAt: record.createdAt.toISOString(),
  };
}

export class AdminCustomerService {
  constructor(private readonly repository: AdminCustomerRepository) {}

  async list(filters: { search?: string }, pagination: Pagination): Promise<AdminCustomerListResponse> {
    const { rows, total } = await this.repository.list(filters, pagination);
    return { rows: rows.map(toAdminCustomer), total };
  }

  async getDetail(id: string): Promise<AdminCustomerDetail> {
    const record = await this.repository.findDetailById(id);
    if (!record) {
      throw new CustomerNotFoundError();
    }
    return {
      ...toAdminCustomer(record),
      reservations: record.reservations.map(toAdminReservation),
    };
  }

  async flag(id: string, reason: string): Promise<AdminCustomerDetail> {
    const updated = await this.repository.setFlag(id, true, reason);
    if (!updated) {
      throw new CustomerNotFoundError();
    }
    return this.getDetail(id);
  }

  async unflag(id: string): Promise<AdminCustomerDetail> {
    const updated = await this.repository.setFlag(id, false, null);
    if (!updated) {
      throw new CustomerNotFoundError();
    }
    return this.getDetail(id);
  }
}
