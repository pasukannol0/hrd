exports.shorthands = undefined;

exports.up = (pgm) => {
  pgm.createTable('devices', {
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
    device_identifier: {
      type: 'varchar(255)',
      notNull: true,
      unique: true,
      comment: 'Unique device identifier (IMEI, UUID, etc.)',
    },
    device_name: {
      type: 'varchar(255)',
      comment: 'User-friendly device name',
    },
    device_type: {
      type: 'varchar(50)',
      notNull: true,
      comment: 'Types: android, ios, web',
    },
    os_version: {
      type: 'varchar(50)',
    },
    app_version: {
      type: 'varchar(50)',
    },
    push_token: {
      type: 'text',
      comment: 'FCM/APNS push notification token',
    },
    is_trusted: {
      type: 'boolean',
      notNull: true,
      default: false,
      comment: 'Whether device is trusted for attendance',
    },
    is_active: {
      type: 'boolean',
      notNull: true,
      default: true,
    },
    last_seen_at: {
      type: 'timestamp with time zone',
    },
    registered_at: {
      type: 'timestamp with time zone',
      notNull: true,
      default: pgm.func('CURRENT_TIMESTAMP'),
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

  pgm.createIndex('devices', 'user_id');
  pgm.createIndex('devices', 'device_identifier');
  pgm.createIndex('devices', ['user_id', 'is_active']);
  pgm.createIndex('devices', 'is_trusted');

  pgm.sql(`
    CREATE TRIGGER update_devices_updated_at
    BEFORE UPDATE ON devices
    FOR EACH ROW
    EXECUTE FUNCTION update_updated_at_column();
  `);
};

exports.down = (pgm) => {
  pgm.dropTable('devices', { cascade: true });
};
