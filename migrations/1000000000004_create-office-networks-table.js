exports.shorthands = undefined;

exports.up = (pgm) => {
  pgm.createTable('office_networks', {
    id: {
      type: 'uuid',
      primaryKey: true,
      default: pgm.func('uuid_generate_v4()'),
    },
    office_id: {
      type: 'uuid',
      notNull: true,
      references: 'offices',
      onDelete: 'CASCADE',
    },
    ssid: {
      type: 'varchar(255)',
      notNull: true,
    },
    bssid: {
      type: 'varchar(17)',
      comment: 'MAC address of the access point',
    },
    network_type: {
      type: 'varchar(20)',
      notNull: true,
      default: 'wifi',
      comment: 'Types: wifi, ethernet',
    },
    is_active: {
      type: 'boolean',
      notNull: true,
      default: true,
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

  pgm.createIndex('office_networks', 'office_id');
  pgm.createIndex('office_networks', 'ssid');
  pgm.createIndex('office_networks', ['office_id', 'is_active']);
  pgm.addConstraint('office_networks', 'unique_office_ssid_bssid', {
    unique: ['office_id', 'ssid', 'bssid'],
  });

  pgm.sql(`
    CREATE TRIGGER update_office_networks_updated_at
    BEFORE UPDATE ON office_networks
    FOR EACH ROW
    EXECUTE FUNCTION update_updated_at_column();
  `);
};

exports.down = (pgm) => {
  pgm.dropTable('office_networks', { cascade: true });
};
