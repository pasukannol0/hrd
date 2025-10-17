exports.shorthands = undefined;

exports.up = (pgm) => {
  pgm.createTable('attendance', {
    id: {
      type: 'uuid',
      primaryKey: true,
      default: pgm.func('uuid_generate_v4()'),
    },
    user_id: {
      type: 'uuid',
      notNull: true,
      references: 'app_users',
      onDelete: 'CASCADE',
    },
    device_id: {
      type: 'uuid',
      notNull: true,
      references: 'devices',
      onDelete: 'CASCADE',
    },
    office_id: {
      type: 'uuid',
      notNull: true,
      references: 'offices',
      onDelete: 'CASCADE',
    },
    policy_set_id: {
      type: 'uuid',
      references: 'policy_sets',
      onDelete: 'SET NULL',
    },
    check_in_time: {
      type: 'timestamp with time zone',
      notNull: true,
    },
    check_out_time: {
      type: 'timestamp with time zone',
    },
    check_in_location: {
      type: 'geography(Point, 4326)',
      notNull: true,
      comment: 'Geographic location at check-in',
    },
    check_out_location: {
      type: 'geography(Point, 4326)',
      comment: 'Geographic location at check-out',
    },
    check_in_method: {
      type: 'varchar(50)',
      notNull: true,
      comment: 'Method: gps, wifi, beacon, nfc, manual',
    },
    check_out_method: {
      type: 'varchar(50)',
      comment: 'Method: gps, wifi, beacon, nfc, manual',
    },
    beacon_id: {
      type: 'uuid',
      references: 'beacons',
      onDelete: 'SET NULL',
      comment: 'Beacon used for check-in/out',
    },
    nfc_tag_id: {
      type: 'uuid',
      references: 'nfc_tags',
      onDelete: 'SET NULL',
      comment: 'NFC tag used for check-in/out',
    },
    network_ssid: {
      type: 'varchar(255)',
      comment: 'WiFi SSID at time of check-in/out',
    },
    status: {
      type: 'varchar(50)',
      notNull: true,
      default: 'present',
      comment: 'Status: present, late, early_departure, absent',
    },
    work_duration_minutes: {
      type: 'integer',
      comment: 'Calculated work duration in minutes',
    },
    integrity_verdict: {
      type: 'jsonb',
      notNull: true,
      default: '{}',
      comment: 'Integrity check results: geofence, network, beacon, device_trust, etc.',
    },
    signature_check_in: {
      type: 'text',
      comment: 'Cryptographic signature for check-in data',
    },
    signature_check_out: {
      type: 'text',
      comment: 'Cryptographic signature for check-out data',
    },
    notes: {
      type: 'text',
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

  pgm.createIndex('attendance', 'user_id');
  pgm.createIndex('attendance', 'device_id');
  pgm.createIndex('attendance', 'office_id');
  pgm.createIndex('attendance', 'policy_set_id');
  pgm.createIndex('attendance', 'check_in_time');
  pgm.createIndex('attendance', 'status');
  pgm.createIndex('attendance', ['user_id', 'check_in_time']);
  pgm.createIndex('attendance', ['office_id', 'check_in_time']);
  pgm.createIndex('attendance', 'check_in_location', { method: 'gist' });
  pgm.createIndex('attendance', 'check_out_location', { method: 'gist' });
  pgm.createIndex('attendance', 'integrity_verdict', { method: 'gin' });

  pgm.sql(`
    CREATE TRIGGER update_attendance_updated_at
    BEFORE UPDATE ON attendance
    FOR EACH ROW
    EXECUTE FUNCTION update_updated_at_column();
  `);

  pgm.sql(`
    CREATE OR REPLACE FUNCTION calculate_work_duration()
    RETURNS TRIGGER AS $$
    BEGIN
      IF NEW.check_out_time IS NOT NULL THEN
        NEW.work_duration_minutes := EXTRACT(EPOCH FROM (NEW.check_out_time - NEW.check_in_time)) / 60;
      END IF;
      RETURN NEW;
    END;
    $$ LANGUAGE plpgsql;
  `);

  pgm.sql(`
    CREATE TRIGGER calculate_attendance_work_duration
    BEFORE INSERT OR UPDATE ON attendance
    FOR EACH ROW
    EXECUTE FUNCTION calculate_work_duration();
  `);
};

exports.down = (pgm) => {
  pgm.dropTable('attendance', { cascade: true });
  pgm.sql('DROP FUNCTION IF EXISTS calculate_work_duration() CASCADE;');
};
