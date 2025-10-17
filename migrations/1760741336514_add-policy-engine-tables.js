/**
 * @type {import('node-pg-migrate').ColumnDefinitions | undefined}
 */
exports.shorthands = undefined;

/**
 * @param pgm {import('node-pg-migrate').MigrationBuilder}
 * @param run {() => void | undefined}
 * @returns {Promise<void> | void}
 */
exports.up = (pgm) => {
  // Create office_policies table
  pgm.createTable('office_policies', {
    id: {
      type: 'uuid',
      primaryKey: true,
    },
    name: {
      type: 'varchar(255)',
      notNull: true,
    },
    description: {
      type: 'text',
    },
    office_id: {
      type: 'uuid',
      references: 'offices(id)',
      onDelete: 'CASCADE',
    },
    version: {
      type: 'integer',
      notNull: true,
      default: 1,
    },
    is_active: {
      type: 'boolean',
      notNull: true,
      default: true,
    },
    priority: {
      type: 'integer',
      notNull: true,
      default: 0,
    },
    required_factors: {
      type: 'jsonb',
      notNull: true,
    },
    geo_distance: {
      type: 'jsonb',
    },
    liveness_config: {
      type: 'jsonb',
    },
    working_hours_start: {
      type: 'varchar(5)',
      notNull: true,
    },
    working_hours_end: {
      type: 'varchar(5)',
      notNull: true,
    },
    working_days: {
      type: 'integer[]',
      notNull: true,
    },
    late_threshold_minutes: {
      type: 'integer',
      notNull: true,
      default: 15,
    },
    early_departure_threshold_minutes: {
      type: 'integer',
      notNull: true,
      default: 15,
    },
    created_at: {
      type: 'timestamp',
      notNull: true,
      default: pgm.func('NOW()'),
    },
    updated_at: {
      type: 'timestamp',
      notNull: true,
      default: pgm.func('NOW()'),
    },
    created_by: {
      type: 'uuid',
    },
    updated_by: {
      type: 'uuid',
    },
  });

  // Create indexes for office_policies
  pgm.createIndex('office_policies', 'office_id');
  pgm.createIndex('office_policies', 'is_active');
  pgm.createIndex('office_policies', ['office_id', 'is_active', 'priority']);

  // Create policy_audit_logs table
  pgm.createTable('policy_audit_logs', {
    id: {
      type: 'uuid',
      primaryKey: true,
    },
    policy_id: {
      type: 'uuid',
      notNull: true,
    },
    action: {
      type: 'varchar(50)',
      notNull: true,
    },
    version: {
      type: 'integer',
      notNull: true,
    },
    previous_version: {
      type: 'integer',
    },
    changes: {
      type: 'jsonb',
    },
    performed_by: {
      type: 'uuid',
      notNull: true,
    },
    performed_at: {
      type: 'timestamp',
      notNull: true,
      default: pgm.func('NOW()'),
    },
    reason: {
      type: 'text',
    },
  });

  // Create indexes for policy_audit_logs
  pgm.createIndex('policy_audit_logs', 'policy_id');
  pgm.createIndex('policy_audit_logs', 'performed_by');
  pgm.createIndex('policy_audit_logs', 'performed_at');
  pgm.createIndex('policy_audit_logs', 'action');
};

/**
 * @param pgm {import('node-pg-migrate').MigrationBuilder}
 * @param run {() => void | undefined}
 * @returns {Promise<void> | void}
 */
exports.down = (pgm) => {
  pgm.dropTable('policy_audit_logs');
  pgm.dropTable('office_policies');
};
