exports.shorthands = undefined;

exports.up = (pgm) => {
  pgm.createTable('app_users', {
    id: {
      type: 'uuid',
      primaryKey: true,
      default: pgm.func('uuid_generate_v4()'),
    },
    email: {
      type: 'varchar(255)',
      notNull: true,
      unique: true,
    },
    full_name: {
      type: 'varchar(255)',
      notNull: true,
    },
    phone_number: {
      type: 'varchar(20)',
    },
    role: {
      type: 'varchar(50)',
      notNull: true,
      default: 'employee',
      comment: 'Roles: admin, manager, employee',
    },
    department: {
      type: 'varchar(100)',
    },
    employee_id: {
      type: 'varchar(50)',
      unique: true,
    },
    password_hash: {
      type: 'text',
      notNull: true,
    },
    is_active: {
      type: 'boolean',
      notNull: true,
      default: true,
    },
    last_login_at: {
      type: 'timestamp with time zone',
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

  pgm.createIndex('app_users', 'email');
  pgm.createIndex('app_users', 'employee_id');
  pgm.createIndex('app_users', 'role');
  pgm.createIndex('app_users', 'is_active');

  pgm.sql(`
    CREATE OR REPLACE FUNCTION update_updated_at_column()
    RETURNS TRIGGER AS $$
    BEGIN
      NEW.updated_at = CURRENT_TIMESTAMP;
      RETURN NEW;
    END;
    $$ LANGUAGE plpgsql;
  `);

  pgm.sql(`
    CREATE TRIGGER update_app_users_updated_at
    BEFORE UPDATE ON app_users
    FOR EACH ROW
    EXECUTE FUNCTION update_updated_at_column();
  `);
};

exports.down = (pgm) => {
  pgm.dropTable('app_users', { cascade: true });
  pgm.sql('DROP FUNCTION IF EXISTS update_updated_at_column() CASCADE;');
};
