exports.shorthands = undefined;

exports.up = (pgm) => {
  pgm.dropConstraint('payments', 'payments_status_check');
  pgm.addConstraint('payments', 'payments_status_check', {
    check: "status IN ('succeeded', 'declined', 'refunded')",
  });

  pgm.addColumns('customers', {
    flagged: { type: 'boolean', notNull: true, default: false },
    flag_reason: { type: 'text' },
  });

  pgm.createTable('pricing_rules', {
    id: {
      type: 'uuid',
      primaryKey: true,
      default: pgm.func('gen_random_uuid()'),
    },
    lot_id: { type: 'uuid', notNull: true, references: 'lots', onDelete: 'CASCADE' },
    day_type: {
      type: 'text',
      notNull: true,
      check: "day_type IN ('weekday', 'weekend', 'all')",
    },
    start_hour: {
      type: 'integer',
      notNull: true,
      check: 'start_hour >= 0 AND start_hour <= 23',
    },
    end_hour: {
      type: 'integer',
      notNull: true,
      check: 'end_hour >= 1 AND end_hour <= 24 AND end_hour > start_hour',
    },
    hourly_rate_cents: {
      type: 'integer',
      notNull: true,
      check: 'hourly_rate_cents > 0',
    },
    created_at: {
      type: 'timestamptz',
      default: pgm.func('now()'),
    },
  });
  pgm.createIndex('pricing_rules', 'lot_id');

  pgm.createTable('capacity_overrides', {
    id: {
      type: 'uuid',
      primaryKey: true,
      default: pgm.func('gen_random_uuid()'),
    },
    lot_id: { type: 'uuid', notNull: true, references: 'lots', onDelete: 'CASCADE' },
    spaces_closed: {
      type: 'integer',
      notNull: true,
      check: 'spaces_closed > 0',
    },
    reason: { type: 'text' },
    starts_at: { type: 'timestamptz', notNull: true },
    ends_at: { type: 'timestamptz' },
    created_at: {
      type: 'timestamptz',
      default: pgm.func('now()'),
    },
  });
  pgm.createIndex('capacity_overrides', 'lot_id');

  pgm.createTable('declined_attempts', {
    id: {
      type: 'uuid',
      primaryKey: true,
      default: pgm.func('gen_random_uuid()'),
    },
    lot_id: { type: 'uuid', references: 'lots' },
    amount_cents: { type: 'integer' },
    card_last4: { type: 'text' },
    created_at: {
      type: 'timestamptz',
      default: pgm.func('now()'),
    },
  });
  pgm.createIndex('declined_attempts', 'created_at');
};

exports.down = (pgm) => {
  pgm.dropTable('declined_attempts');
  pgm.dropTable('capacity_overrides');
  pgm.dropTable('pricing_rules');
  pgm.dropColumns('customers', ['flagged', 'flag_reason']);
  pgm.dropConstraint('payments', 'payments_status_check');
  pgm.addConstraint('payments', 'payments_status_check', {
    check: "status IN ('succeeded', 'declined')",
  });
};
