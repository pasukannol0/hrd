exports.shorthands = undefined;

exports.up = (pgm) => {
  pgm.createTable('leaves', {
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
    leave_type: {
      type: 'varchar(50)',
      notNull: true,
      comment: 'Types: sick, vacation, personal, unpaid, bereavement, etc.',
    },
    start_date: {
      type: 'date',
      notNull: true,
    },
    end_date: {
      type: 'date',
      notNull: true,
    },
    total_days: {
      type: 'decimal(4,1)',
      notNull: true,
      comment: 'Total leave days (supports half days)',
    },
    reason: {
      type: 'text',
    },
    status: {
      type: 'varchar(50)',
      notNull: true,
      default: 'pending',
      comment: 'Status: pending, approved, rejected, cancelled',
    },
    approved_by: {
      type: 'uuid',
      references: 'app_users',
      onDelete: 'SET NULL',
    },
    approved_at: {
      type: 'timestamp with time zone',
    },
    rejection_reason: {
      type: 'text',
    },
    attachment_urls: {
      type: 'text[]',
      comment: 'URLs to supporting documents',
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

  pgm.createIndex('leaves', 'user_id');
  pgm.createIndex('leaves', 'status');
  pgm.createIndex('leaves', ['user_id', 'status']);
  pgm.createIndex('leaves', ['start_date', 'end_date']);
  pgm.createIndex('leaves', 'approved_by');

  pgm.addConstraint('leaves', 'check_end_date_after_start', {
    check: 'end_date >= start_date',
  });

  pgm.sql(`
    CREATE TRIGGER update_leaves_updated_at
    BEFORE UPDATE ON leaves
    FOR EACH ROW
    EXECUTE FUNCTION update_updated_at_column();
  `);
};

exports.down = (pgm) => {
  pgm.dropTable('leaves', { cascade: true });
};
