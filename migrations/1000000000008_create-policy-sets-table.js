exports.shorthands = undefined;

exports.up = (pgm) => {
  pgm.createTable('policy_sets', {
    id: {
      type: 'uuid',
      primaryKey: true,
      default: pgm.func('uuid_generate_v4()'),
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
      references: 'offices',
      onDelete: 'CASCADE',
      comment: 'If null, policy applies globally',
    },
    working_hours_start: {
      type: 'time',
      notNull: true,
      default: '09:00:00',
    },
    working_hours_end: {
      type: 'time',
      notNull: true,
      default: '17:00:00',
    },
    working_days: {
      type: 'integer[]',
      notNull: true,
      default: '{1,2,3,4,5}',
      comment: 'Array of weekday numbers (1=Monday, 7=Sunday)',
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
    require_geofence: {
      type: 'boolean',
      notNull: true,
      default: true,
    },
    require_network_validation: {
      type: 'boolean',
      notNull: true,
      default: false,
    },
    require_beacon_proximity: {
      type: 'boolean',
      notNull: true,
      default: false,
    },
    require_nfc_tap: {
      type: 'boolean',
      notNull: true,
      default: false,
    },
    max_checkin_distance_meters: {
      type: 'integer',
      default: 100,
      comment: 'Maximum distance from office for check-in',
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
      comment: 'Higher priority policies override lower ones',
    },
    created_at: {
      type: 'timestamp with time zone',
      notNull: true,
      default: pgm.func('CURRENT_TIMESTAMP'),
    },
    updated_at: {
      type: 'timestamp with time zone',
      notNull: true,
      default: pgm.func('CURRENT_TIMESTAMP'),
    },
  });

  pgm.createIndex('policy_sets', 'office_id');
  pgm.createIndex('policy_sets', 'is_active');
  pgm.createIndex('policy_sets', ['office_id', 'is_active', 'priority']);

  pgm.sql(`
    CREATE TRIGGER update_policy_sets_updated_at
    BEFORE UPDATE ON policy_sets
    FOR EACH ROW
    EXECUTE FUNCTION update_updated_at_column();
  `);
};

exports.down = (pgm) => {
  pgm.dropTable('policy_sets', { cascade: true });
};
