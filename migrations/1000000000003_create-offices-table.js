exports.shorthands = undefined;

exports.up = (pgm) => {
  pgm.createTable('offices', {
    id: {
      type: 'uuid',
      primaryKey: true,
      default: pgm.func('uuid_generate_v4()'),
    },
    name: {
      type: 'varchar(255)',
      notNull: true,
    },
    address: {
      type: 'text',
      notNull: true,
    },
    city: {
      type: 'varchar(100)',
      notNull: true,
    },
    state: {
      type: 'varchar(100)',
    },
    country: {
      type: 'varchar(100)',
      notNull: true,
    },
    postal_code: {
      type: 'varchar(20)',
    },
    boundary: {
      type: 'geography(Polygon, 4326)',
      notNull: true,
      comment: 'Geographic polygon defining office boundary',
    },
    timezone: {
      type: 'varchar(50)',
      notNull: true,
      default: 'UTC',
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

  pgm.createIndex('offices', 'boundary', { method: 'gist' });
  pgm.createIndex('offices', 'is_active');
  pgm.createIndex('offices', ['city', 'country']);

  pgm.sql(`
    CREATE TRIGGER update_offices_updated_at
    BEFORE UPDATE ON offices
    FOR EACH ROW
    EXECUTE FUNCTION update_updated_at_column();
  `);
};

exports.down = (pgm) => {
  pgm.dropTable('offices', { cascade: true });
};
