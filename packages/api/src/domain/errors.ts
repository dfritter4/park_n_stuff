export class DomainError extends Error {
  constructor(
    public code: string,
    message: string,
    public httpStatus: number,
  ) {
    super(message);
    this.name = new.target.name;
  }
}

export class LotNotFoundError extends DomainError {
  constructor(message = 'Lot not found') {
    super('LOT_NOT_FOUND', message, 404);
  }
}

export class LotFullError extends DomainError {
  constructor(message = 'Lot is full') {
    super('LOT_FULL', message, 409);
  }
}

export class LotNotReservableError extends DomainError {
  constructor(message = 'Lot is not reservable') {
    super('LOT_NOT_RESERVABLE', message, 409);
  }
}

export class PaymentDeclinedError extends DomainError {
  constructor(message = 'Payment declined') {
    super('PAYMENT_DECLINED', message, 402);
  }
}

export class InvalidCredentialsError extends DomainError {
  constructor(message = 'Invalid credentials') {
    super('INVALID_CREDENTIALS', message, 401);
  }
}

export class ValidationError extends DomainError {
  constructor(message = 'Validation failed') {
    super('VALIDATION_ERROR', message, 400);
  }
}

export class ReservationNotFoundError extends DomainError {
  constructor(message = 'Reservation not found') {
    super('RESERVATION_NOT_FOUND', message, 404);
  }
}

export class ReservationNotActiveError extends DomainError {
  constructor(message = 'Reservation is not active') {
    super('RESERVATION_NOT_ACTIVE', message, 409);
  }
}

export class CustomerFlaggedError extends DomainError {
  constructor(message = 'Customer is flagged and cannot make new reservations') {
    super('CUSTOMER_FLAGGED', message, 403);
  }
}

export class InvalidExtensionError extends DomainError {
  constructor(message = 'Invalid extension') {
    super('INVALID_EXTENSION', message, 400);
  }
}

export class PricingRuleOverlapError extends DomainError {
  constructor(message = 'Pricing rule overlaps an existing rule for this lot') {
    super('PRICING_RULE_OVERLAP', message, 409);
  }
}

export class CustomerNotFoundError extends DomainError {
  constructor(message = 'Customer not found') {
    super('CUSTOMER_NOT_FOUND', message, 404);
  }
}

export class PricingRuleNotFoundError extends DomainError {
  constructor(message = 'Pricing rule not found') {
    super('PRICING_RULE_NOT_FOUND', message, 404);
  }
}

export class CapacityOverrideNotFoundError extends DomainError {
  constructor(message = 'Capacity override not found') {
    super('CAPACITY_OVERRIDE_NOT_FOUND', message, 404);
  }
}
