exports.shorthands = undefined;

exports.up = (pgm) => {
  pgm.createTable('audit_logs', {
    id: {
      type: 'uuid',
      primaryKey: true,
      default: pgm.func('uuid_generate_v4()'),
    },
    user_id: {
      type: 'uuid',
      references: 'app_users',
      onDelete: 'SET NULL',
      comment: 'User who performed the action',
    },
    entity_type: {
      type: 'varchar(100)',
      notNull: true,
      comment: 'Type of entity: attendance, leave, user, device, etc.',
    },
    entity_id: {
      type: 'uuid',
      comment: 'ID of the affected entity',
    },
    action: {
      type: 'varchar(50)',
      notNull: true,
      comment: 'Action: create, update, delete, approve, reject',
    },
    old_values: {
      type: 'jsonb',
      comment: 'Previous state of the entity',
    },
    new_values: {
      type: 'jsonb',
      comment: 'New state of the entity',
    },
    metadata: {
      type: 'jsonb',
      default: '{}',
      comment: 'Additional context: IP address, user agent, etc.',
    },
    ip_address: {
      type: 'inet',
    },
    user_agent: {
      type: 'text',
    },
    created_at: {
      type: 'timestamp with time zone',
      notNull: true,
      default: pgm.func('CURRENT_TIMESTAMP'),
    },
  });

  pgm.createIndex('audit_logs', 'user_id');
  pgm.createIndex('audit_logs', 'entity_type');
  pgm.createIndex('audit_logs', 'entity_id');
  pgm.createIndex('audit_logs', 'action');
  pgm.createIndex('audit_logs', 'created_at');
  pgm.createIndex('audit_logs', ['entity_type', 'entity_id']);
  pgm.createIndex('audit_logs', 'metadata', { method: 'gin' });

  pgm.sql(`
    CREATE INDEX idx_audit_logs_created_at_brin ON audit_logs USING brin(created_at);
  `);
};

exports.down = (pgm) => {
  pgm.dropTable('audit_logs', { cascade: true });
};
