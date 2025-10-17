exports.shorthands = undefined;

exports.up = (pgm) => {
  pgm.createTable('nfc_tags', {
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
    tag_uid: {
      type: 'varchar(64)',
      notNull: true,
      unique: true,
      comment: 'Unique identifier of the NFC tag',
    },
    tag_type: {
      type: 'varchar(50)',
      comment: 'NFC tag type (NTAG213, NTAG215, etc.)',
    },
    location_description: {
      type: 'text',
      comment: 'Human-readable description of tag placement',
    },
    location_point: {
      type: 'geography(Point, 4326)',
      comment: 'Geographic location of the NFC tag',
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

  pgm.createIndex('nfc_tags', 'office_id');
  pgm.createIndex('nfc_tags', 'tag_uid');
  pgm.createIndex('nfc_tags', 'is_active');
  pgm.createIndex('nfc_tags', 'location_point', { method: 'gist' });

  pgm.sql(`
    CREATE TRIGGER update_nfc_tags_updated_at
    BEFORE UPDATE ON nfc_tags
    FOR EACH ROW
    EXECUTE FUNCTION update_updated_at_column();
  `);
};

exports.down = (pgm) => {
  pgm.dropTable('nfc_tags', { cascade: true });
};
