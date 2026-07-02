exports.shorthands = undefined;

exports.up = (pgm) => {
  pgm.createTable('lots', {
    id: {
      type: 'uuid',
      primaryKey: true,
      default: pgm.func('gen_random_uuid()'),
    },
    name: { type: 'text' },
    address: { type: 'text' },
    neighborhood: { type: 'text' },
    lat: { type: 'double precision' },
    lng: { type: 'double precision' },
    capacity: {
      type: 'integer',
      check: 'capacity > 0',
    },
    hourly_rate_cents: {
      type: 'integer',
      check: 'hourly_rate_cents > 0',
    },
    status: {
      type: 'text',
      default: 'active',
      check: "status IN ('active', 'maintenance', 'deleted')",
    },
    created_at: {
      type: 'timestamptz',
      default: pgm.func('now()'),
    },
  });

  pgm.createTable('customers', {
    id: {
      type: 'uuid',
      primaryKey: true,
      default: pgm.func('gen_random_uuid()'),
    },
    name: { type: 'text' },
    email: { type: 'text', unique: true },
    phone: { type: 'text' },
    created_at: {
      type: 'timestamptz',
      default: pgm.func('now()'),
    },
  });

  pgm.createTable('admin_users', {
    id: {
      type: 'uuid',
      primaryKey: true,
      default: pgm.func('gen_random_uuid()'),
    },
    email: { type: 'text', unique: true },
    password_hash: { type: 'text' },
    created_at: {
      type: 'timestamptz',
      default: pgm.func('now()'),
    },
  });

  pgm.createTable('reservations', {
    id: {
      type: 'uuid',
      primaryKey: true,
      default: pgm.func('gen_random_uuid()'),
    },
    reservation_number: { type: 'text', unique: true },
    lot_id: { type: 'uuid', references: 'lots' },
    customer_id: { type: 'uuid', references: 'customers' },
    vehicle_make: { type: 'text' },
    vehicle_model: { type: 'text' },
    license_plate: { type: 'text' },
    start_time: { type: 'timestamptz' },
    end_time: { type: 'timestamptz' },
    total_cost_cents: { type: 'integer' },
    status: {
      type: 'text',
      check: "status IN ('active', 'completed', 'cancelled')",
    },
    created_at: {
      type: 'timestamptz',
      default: pgm.func('now()'),
    },
  });

  pgm.createIndex('reservations', ['lot_id', 'status']);
  pgm.createIndex('reservations', 'start_time');
  pgm.createIndex('reservations', 'created_at');

  pgm.createTable('payments', {
    id: {
      type: 'uuid',
      primaryKey: true,
      default: pgm.func('gen_random_uuid()'),
    },
    reservation_id: { type: 'uuid', references: 'reservations' },
    amount_cents: { type: 'integer' },
    status: {
      type: 'text',
      check: "status IN ('succeeded', 'declined')",
    },
    transaction_id: { type: 'text' },
    card_last4: { type: 'text' },
    created_at: {
      type: 'timestamptz',
      default: pgm.func('now()'),
    },
  });
};

exports.down = (pgm) => {
  pgm.dropTable('payments');
  pgm.dropTable('reservations');
  pgm.dropTable('admin_users');
  pgm.dropTable('customers');
  pgm.dropTable('lots');
};
