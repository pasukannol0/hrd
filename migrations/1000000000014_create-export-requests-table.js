exports.shorthands = undefined;

exports.up = (pgm) => {
  pgm.createTable('export_requests', {
    id: {
      type: 'uuid',
      primaryKey: true,
      default: pgm.func('gen_random_uuid()'),
    },
    report_type: {
      type: 'varchar(50)',
      notNull: true,
    },
    format: {
      type: 'varchar(10)',
      notNull: true,
    },
    filters: {
      type: 'jsonb',
      notNull: true,
      default: '{}',
    },
    requested_by: {
      type: 'uuid',
      notNull: true,
      references: 'app_users',
      onDelete: 'CASCADE',
    },
    requested_at: {
      type: 'timestamp',
      notNull: true,
      default: pgm.func('current_timestamp'),
    },
    status: {
      type: 'varchar(20)',
      notNull: true,
      default: 'pending',
    },
    file_path: {
      type: 'text',
    },
    file_id: {
      type: 'varchar(255)',
    },
    signed_url_token: {
      type: 'text',
    },
    url_expires_at: {
      type: 'timestamp',
    },
    record_count: {
      type: 'integer',
    },
    generation_time_ms: {
      type: 'integer',
    },
    error_message: {
      type: 'text',
    },
    completed_at: {
      type: 'timestamp',
    },
    created_at: {
      type: 'timestamp',
      notNull: true,
      default: pgm.func('current_timestamp'),
    },
    updated_at: {
      type: 'timestamp',
      notNull: true,
      default: pgm.func('current_timestamp'),
    },
  });

  pgm.createIndex('export_requests', 'requested_by');
  pgm.createIndex('export_requests', 'status');
  pgm.createIndex('export_requests', 'report_type');
  pgm.createIndex('export_requests', 'requested_at');
  pgm.createIndex('export_requests', ['requested_by', 'requested_at']);
  pgm.createIndex('export_requests', 'file_id');

  pgm.sql(`
    CREATE TRIGGER update_export_requests_updated_at
    BEFORE UPDATE ON export_requests
    FOR EACH ROW
    EXECUTE FUNCTION update_updated_at_column();
  `);

  pgm.sql(`
    COMMENT ON TABLE export_requests IS 
    'Tracks report export requests with signed URLs for secure downloads';
  `);

  pgm.sql(`
    COMMENT ON COLUMN export_requests.report_type IS 
    'Type of report: daily, weekly, monthly, occupancy';
  `);

  pgm.sql(`
    COMMENT ON COLUMN export_requests.format IS 
    'Export format: csv or pdf';
  `);

  pgm.sql(`
    COMMENT ON COLUMN export_requests.filters IS 
    'JSON object containing report filters (date range, office_id, user_id, etc.)';
  `);

  pgm.sql(`
    COMMENT ON COLUMN export_requests.status IS 
    'Request status: pending, processing, completed, failed';
  `);
};

exports.down = (pgm) => {
  pgm.dropTable('export_requests');
};
