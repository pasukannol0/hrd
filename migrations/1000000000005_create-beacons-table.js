exports.shorthands = undefined;

exports.up = (pgm) => {
  pgm.createTable('beacons', {
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
    uuid: {
      type: 'varchar(36)',
      notNull: true,
      comment: 'Beacon UUID (iBeacon format)',
    },
    major: {
      type: 'integer',
      notNull: true,
    },
    minor: {
      type: 'integer',
      notNull: true,
    },
    location_description: {
      type: 'text',
      comment: 'Human-readable description of beacon placement',
    },
    location_point: {
      type: 'geography(Point, 4326)',
      comment: 'Geographic location of the beacon',
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

  pgm.createIndex('beacons', 'office_id');
  pgm.createIndex('beacons', ['uuid', 'major', 'minor']);
  pgm.createIndex('beacons', 'is_active');
  pgm.createIndex('beacons', 'location_point', { method: 'gist' });
  pgm.addConstraint('beacons', 'unique_beacon_identifier', {
    unique: ['office_id', 'uuid', 'major', 'minor'],
  });

  pgm.sql(`
    CREATE TRIGGER update_beacons_updated_at
    BEFORE UPDATE ON beacons
    FOR EACH ROW
    EXECUTE FUNCTION update_updated_at_column();
  `);
};

exports.down = (pgm) => {
  pgm.dropTable('beacons', { cascade: true });
};
