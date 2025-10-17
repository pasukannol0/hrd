# Zero-Downtime Migration Templates

This document provides templates for common zero-downtime migration patterns using the Expand/Backfill/Contract strategy.

## Table of Contents

1. [Adding a Column](#adding-a-column)
2. [Renaming a Column](#renaming-a-column)
3. [Changing Column Type](#changing-column-type)
4. [Adding a Foreign Key](#adding-a-foreign-key)
5. [Adding an Index](#adding-an-index)
6. [Splitting a Table](#splitting-a-table)
7. [Adding a NOT NULL Constraint](#adding-a-not-null-constraint)
8. [Renaming a Table](#renaming-a-table)

---

## Adding a Column

### Phase 1: Expand (Make Additive Changes)

**Migration: `YYYYMMDDHHMMSS_add_column_expand.js`**

```javascript
exports.up = (pgm) => {
  // Add new column without NOT NULL constraint
  pgm.addColumn('table_name', {
    new_column: {
      type: 'varchar(255)',
      notNull: false,
      default: null
    }
  });

  // Optional: Add index if needed for queries
  pgm.createIndex('table_name', 'new_column');

  // Add documentation
  pgm.sql(`
    COMMENT ON COLUMN table_name.new_column IS 
    'Description of column - Added in Expand phase';
  `);
};

exports.down = (pgm) => {
  pgm.dropColumn('table_name', 'new_column');
};
```

**Deploy**: Application code can now use the new column, handling NULL values gracefully.

### Phase 2: Backfill (Populate Data)

**Migration: `YYYYMMDDHHMMSS_add_column_backfill.js`**

```javascript
exports.up = (pgm) => {
  // Backfill data in batches to avoid long locks
  pgm.sql(`
    DO $$
    DECLARE
      batch_size INTEGER := 1000;
      rows_updated INTEGER;
    BEGIN
      LOOP
        UPDATE table_name
        SET new_column = <calculation or default value>
        WHERE new_column IS NULL
          AND id IN (
            SELECT id FROM table_name
            WHERE new_column IS NULL
            LIMIT batch_size
          );
        
        GET DIAGNOSTICS rows_updated = ROW_COUNT;
        EXIT WHEN rows_updated = 0;
        
        RAISE NOTICE 'Updated % rows', rows_updated;
        COMMIT;
      END LOOP;
    END $$;
  `);
};

exports.down = (pgm) => {
  pgm.sql('UPDATE table_name SET new_column = NULL;');
};
```

**Deploy**: Run during low-traffic period or off-hours.

### Phase 3: Contract (Enforce Constraints)

**Migration: `YYYYMMDDHHMMSS_add_column_contract.js`**

```javascript
exports.up = (pgm) => {
  // Add NOT NULL constraint now that data is backfilled
  pgm.alterColumn('table_name', 'new_column', {
    notNull: true
  });

  // Optional: Remove default if it was temporary
  pgm.alterColumn('table_name', 'new_column', {
    default: null
  });
};

exports.down = (pgm) => {
  pgm.alterColumn('table_name', 'new_column', {
    notNull: false
  });
};
```

---

## Renaming a Column

### Phase 1: Expand (Add New Column and Sync)

**Migration: `YYYYMMDDHHMMSS_rename_column_expand.js`**

```javascript
exports.up = (pgm) => {
  // Add new column
  pgm.addColumn('table_name', {
    new_column_name: {
      type: 'same_type_as_old',
      notNull: false
    }
  });

  // Copy existing data
  pgm.sql(`
    UPDATE table_name 
    SET new_column_name = old_column_name;
  `);

  // Create trigger to keep columns in sync during transition
  pgm.sql(`
    CREATE OR REPLACE FUNCTION sync_column_rename()
    RETURNS TRIGGER AS $$
    BEGIN
      IF NEW.old_column_name IS DISTINCT FROM OLD.old_column_name THEN
        NEW.new_column_name := NEW.old_column_name;
      END IF;
      IF NEW.new_column_name IS DISTINCT FROM OLD.new_column_name THEN
        NEW.old_column_name := NEW.new_column_name;
      END IF;
      RETURN NEW;
    END;
    $$ LANGUAGE plpgsql;

    CREATE TRIGGER sync_column_rename_trigger
    BEFORE UPDATE ON table_name
    FOR EACH ROW
    EXECUTE FUNCTION sync_column_rename();
  `);

  // Copy indexes from old column to new column
  pgm.createIndex('table_name', 'new_column_name');
};

exports.down = (pgm) => {
  pgm.sql('DROP TRIGGER IF EXISTS sync_column_rename_trigger ON table_name;');
  pgm.sql('DROP FUNCTION IF EXISTS sync_column_rename();');
  pgm.dropColumn('table_name', 'new_column_name');
};
```

**Deploy**: Application code reads/writes to both columns.

### Phase 2: Update Application

**No migration required** - Deploy application code to use only `new_column_name`.

### Phase 3: Contract (Remove Old Column)

**Migration: `YYYYMMDDHHMMSS_rename_column_contract.js`**

```javascript
exports.up = (pgm) => {
  // Drop sync trigger
  pgm.sql('DROP TRIGGER IF EXISTS sync_column_rename_trigger ON table_name;');
  pgm.sql('DROP FUNCTION IF EXISTS sync_column_rename();');

  // Drop old column
  pgm.dropColumn('table_name', 'old_column_name');

  // Add NOT NULL constraint if needed
  pgm.alterColumn('table_name', 'new_column_name', {
    notNull: true
  });
};

exports.down = (pgm) => {
  // Re-add old column
  pgm.addColumn('table_name', {
    old_column_name: {
      type: 'same_type',
      notNull: false
    }
  });

  // Copy data back
  pgm.sql('UPDATE table_name SET old_column_name = new_column_name;');
};
```

---

## Changing Column Type

### Phase 1: Expand (Add New Column)

**Migration: `YYYYMMDDHHMMSS_change_type_expand.js`**

```javascript
exports.up = (pgm) => {
  // Add new column with new type
  pgm.addColumn('table_name', {
    column_new_type: {
      type: 'new_type',
      notNull: false
    }
  });

  // Copy and cast data
  pgm.sql(`
    UPDATE table_name 
    SET column_new_type = column_old_type::new_type;
  `);

  // Create trigger to keep in sync
  pgm.sql(`
    CREATE OR REPLACE FUNCTION sync_type_change()
    RETURNS TRIGGER AS $$
    BEGIN
      IF NEW.column_old_type IS DISTINCT FROM OLD.column_old_type THEN
        NEW.column_new_type := NEW.column_old_type::new_type;
      END IF;
      IF NEW.column_new_type IS DISTINCT FROM OLD.column_new_type THEN
        NEW.column_old_type := NEW.column_new_type::old_type;
      END IF;
      RETURN NEW;
    END;
    $$ LANGUAGE plpgsql;

    CREATE TRIGGER sync_type_change_trigger
    BEFORE UPDATE ON table_name
    FOR EACH ROW
    EXECUTE FUNCTION sync_type_change();
  `);
};

exports.down = (pgm) => {
  pgm.sql('DROP TRIGGER IF EXISTS sync_type_change_trigger ON table_name;');
  pgm.sql('DROP FUNCTION IF EXISTS sync_type_change();');
  pgm.dropColumn('table_name', 'column_new_type');
};
```

### Phase 2: Update Application

Deploy application code to use `column_new_type`.

### Phase 3: Contract (Remove Old Column)

**Migration: `YYYYMMDDHHMMSS_change_type_contract.js`**

```javascript
exports.up = (pgm) => {
  pgm.sql('DROP TRIGGER IF EXISTS sync_type_change_trigger ON table_name;');
  pgm.sql('DROP FUNCTION IF EXISTS sync_type_change();');
  pgm.dropColumn('table_name', 'column_old_type');
  
  // Rename new column to old name if desired
  pgm.renameColumn('table_name', 'column_new_type', 'column_old_type');
};

exports.down = (pgm) => {
  pgm.renameColumn('table_name', 'column_old_type', 'column_new_type');
};
```

---

## Adding a Foreign Key

### Phase 1: Add Column Without Constraint

**Migration: `YYYYMMDDHHMMSS_add_fk_expand.js`**

```javascript
exports.up = (pgm) => {
  // Add column without FK constraint
  pgm.addColumn('child_table', {
    parent_id: {
      type: 'uuid',
      notNull: false
    }
  });

  // Add index for performance
  pgm.createIndex('child_table', 'parent_id');
};

exports.down = (pgm) => {
  pgm.dropColumn('child_table', 'parent_id');
};
```

### Phase 2: Backfill Data

**Migration: `YYYYMMDDHHMMSS_add_fk_backfill.js`**

```javascript
exports.up = (pgm) => {
  pgm.sql(`
    UPDATE child_table
    SET parent_id = <logic to determine parent_id>
    WHERE parent_id IS NULL;
  `);
};

exports.down = (pgm) => {
  pgm.sql('UPDATE child_table SET parent_id = NULL;');
};
```

### Phase 3: Add Constraint

**Migration: `YYYYMMDDHHMMSS_add_fk_contract.js`**

```javascript
exports.up = (pgm) => {
  // Validate data first (optional)
  pgm.sql(`
    DO $$
    BEGIN
      IF EXISTS (
        SELECT 1 FROM child_table c
        LEFT JOIN parent_table p ON c.parent_id = p.id
        WHERE c.parent_id IS NOT NULL AND p.id IS NULL
      ) THEN
        RAISE EXCEPTION 'Orphaned records found in child_table';
      END IF;
    END $$;
  `);

  // Add NOT NULL constraint
  pgm.alterColumn('child_table', 'parent_id', {
    notNull: true
  });

  // Add foreign key constraint with NOT VALID first (doesn't block)
  pgm.sql(`
    ALTER TABLE child_table
    ADD CONSTRAINT fk_child_parent
    FOREIGN KEY (parent_id) 
    REFERENCES parent_table(id)
    ON DELETE CASCADE
    NOT VALID;
  `);

  // Validate constraint (can run during off-peak)
  pgm.sql(`
    ALTER TABLE child_table
    VALIDATE CONSTRAINT fk_child_parent;
  `);
};

exports.down = (pgm) => {
  pgm.dropConstraint('child_table', 'fk_child_parent');
  pgm.alterColumn('child_table', 'parent_id', {
    notNull: false
  });
};
```

---

## Adding an Index

**Migration: `YYYYMMDDHHMMSS_add_index.js`**

```javascript
exports.up = (pgm) => {
  // Use CONCURRENTLY to avoid blocking writes
  pgm.sql(`
    CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_table_column
    ON table_name (column_name);
  `);

  // For composite index
  pgm.sql(`
    CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_table_multi
    ON table_name (column1, column2);
  `);

  // For partial index
  pgm.sql(`
    CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_table_partial
    ON table_name (column_name)
    WHERE is_active = true;
  `);

  // For GIN index on JSONB
  pgm.sql(`
    CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_table_jsonb
    ON table_name USING gin (jsonb_column);
  `);
};

exports.down = (pgm) => {
  // Also drop CONCURRENTLY
  pgm.sql('DROP INDEX CONCURRENTLY IF EXISTS idx_table_column;');
  pgm.sql('DROP INDEX CONCURRENTLY IF EXISTS idx_table_multi;');
  pgm.sql('DROP INDEX CONCURRENTLY IF EXISTS idx_table_partial;');
  pgm.sql('DROP INDEX CONCURRENTLY IF EXISTS idx_table_jsonb;');
};
```

**Note**: `CREATE INDEX CONCURRENTLY` cannot run inside a transaction. node-pg-migrate handles this automatically.

---

## Splitting a Table

### Phase 1: Create New Tables

**Migration: `YYYYMMDDHHMMSS_split_table_expand.js`**

```javascript
exports.up = (pgm) => {
  // Create new tables
  pgm.createTable('new_table_a', {
    id: { type: 'uuid', primaryKey: true },
    // columns that belong in table A
  });

  pgm.createTable('new_table_b', {
    id: { type: 'uuid', primaryKey: true },
    // columns that belong in table B
  });

  // Copy data
  pgm.sql(`
    INSERT INTO new_table_a (id, col1, col2)
    SELECT id, col1, col2 FROM old_table;
  `);

  pgm.sql(`
    INSERT INTO new_table_b (id, col3, col4)
    SELECT id, col3, col4 FROM old_table;
  `);

  // Create triggers to keep in sync
  pgm.sql(`
    CREATE OR REPLACE FUNCTION sync_table_split()
    RETURNS TRIGGER AS $$
    BEGIN
      IF TG_OP = 'INSERT' THEN
        INSERT INTO new_table_a (id, col1, col2)
        VALUES (NEW.id, NEW.col1, NEW.col2);
        
        INSERT INTO new_table_b (id, col3, col4)
        VALUES (NEW.id, NEW.col3, NEW.col4);
      ELSIF TG_OP = 'UPDATE' THEN
        UPDATE new_table_a 
        SET col1 = NEW.col1, col2 = NEW.col2
        WHERE id = NEW.id;
        
        UPDATE new_table_b
        SET col3 = NEW.col3, col4 = NEW.col4
        WHERE id = NEW.id;
      ELSIF TG_OP = 'DELETE' THEN
        DELETE FROM new_table_a WHERE id = OLD.id;
        DELETE FROM new_table_b WHERE id = OLD.id;
      END IF;
      RETURN NEW;
    END;
    $$ LANGUAGE plpgsql;

    CREATE TRIGGER sync_split_trigger
    AFTER INSERT OR UPDATE OR DELETE ON old_table
    FOR EACH ROW
    EXECUTE FUNCTION sync_table_split();
  `);
};

exports.down = (pgm) => {
  pgm.sql('DROP TRIGGER IF EXISTS sync_split_trigger ON old_table;');
  pgm.sql('DROP FUNCTION IF EXISTS sync_table_split();');
  pgm.dropTable('new_table_b');
  pgm.dropTable('new_table_a');
};
```

### Phase 2: Update Application

Deploy code to read/write from new tables.

### Phase 3: Drop Old Table

**Migration: `YYYYMMDDHHMMSS_split_table_contract.js`**

```javascript
exports.up = (pgm) => {
  pgm.sql('DROP TRIGGER IF EXISTS sync_split_trigger ON old_table;');
  pgm.sql('DROP FUNCTION IF EXISTS sync_table_split();');
  pgm.dropTable('old_table', { cascade: true });
};

exports.down = (pgm) => {
  // Recreate old table if needed for rollback
  pgm.createTable('old_table', {
    // ... original schema
  });
};
```

---

## Adding a NOT NULL Constraint

### Phase 1: Add Column (Nullable)

**Migration: `YYYYMMDDHHMMSS_add_not_null_expand.js`**

```javascript
exports.up = (pgm) => {
  pgm.addColumn('table_name', {
    new_column: {
      type: 'varchar(255)',
      notNull: false,
      default: 'default_value'
    }
  });
};

exports.down = (pgm) => {
  pgm.dropColumn('table_name', 'new_column');
};
```

### Phase 2: Backfill

**Migration: `YYYYMMDDHHMMSS_add_not_null_backfill.js`**

```javascript
exports.up = (pgm) => {
  pgm.sql(`
    UPDATE table_name
    SET new_column = 'calculated_value'
    WHERE new_column IS NULL;
  `);
};

exports.down = (pgm) => {
  // No-op or set back to NULL
};
```

### Phase 3: Add Constraint

**Migration: `YYYYMMDDHHMMSS_add_not_null_contract.js`**

```javascript
exports.up = (pgm) => {
  // Verify no NULLs exist
  pgm.sql(`
    DO $$
    BEGIN
      IF EXISTS (SELECT 1 FROM table_name WHERE new_column IS NULL) THEN
        RAISE EXCEPTION 'NULL values still exist in new_column';
      END IF;
    END $$;
  `);

  // Add NOT NULL constraint
  pgm.alterColumn('table_name', 'new_column', {
    notNull: true
  });

  // Optionally remove default if it was temporary
  pgm.alterColumn('table_name', 'new_column', {
    default: null
  });
};

exports.down = (pgm) => {
  pgm.alterColumn('table_name', 'new_column', {
    notNull: false
  });
};
```

---

## Renaming a Table

### Phase 1: Create View

**Migration: `YYYYMMDDHHMMSS_rename_table_expand.js`**

```javascript
exports.up = (pgm) => {
  // Rename the table
  pgm.renameTable('old_table_name', 'new_table_name');

  // Create a view with the old name for backwards compatibility
  pgm.sql(`
    CREATE VIEW old_table_name AS
    SELECT * FROM new_table_name;
  `);

  // Make view updatable
  pgm.sql(`
    CREATE OR REPLACE RULE old_table_insert AS
    ON INSERT TO old_table_name
    DO INSTEAD
      INSERT INTO new_table_name VALUES (NEW.*);

    CREATE OR REPLACE RULE old_table_update AS
    ON UPDATE TO old_table_name
    DO INSTEAD
      UPDATE new_table_name SET * = NEW.* WHERE id = OLD.id;

    CREATE OR REPLACE RULE old_table_delete AS
    ON DELETE TO old_table_name
    DO INSTEAD
      DELETE FROM new_table_name WHERE id = OLD.id;
  `);
};

exports.down = (pgm) => {
  pgm.sql('DROP VIEW IF EXISTS old_table_name CASCADE;');
  pgm.renameTable('new_table_name', 'old_table_name');
};
```

### Phase 2: Update Application

Deploy code to use `new_table_name`.

### Phase 3: Drop View

**Migration: `YYYYMMDDHHMMSS_rename_table_contract.js`**

```javascript
exports.up = (pgm) => {
  pgm.sql('DROP VIEW IF EXISTS old_table_name CASCADE;');
};

exports.down = (pgm) => {
  // Recreate view if needed
  pgm.sql(`
    CREATE VIEW old_table_name AS
    SELECT * FROM new_table_name;
  `);
};
```

---

## Best Practices Summary

1. **Always use CONCURRENTLY for indexes** in production
2. **Batch large data updates** to avoid lock contention
3. **Test migrations in staging** with production-like data volume
4. **Coordinate with code deployments** - align migration phases with releases
5. **Document each phase** in migration comments
6. **Monitor during deployment** - watch for locks, slow queries
7. **Have rollback plans** - test the `down` migration
8. **Use CHECK constraints with NOT VALID** then VALIDATE later
9. **Avoid long-running transactions** - split into multiple migrations
10. **Consider replication lag** - give time for replicas to catch up

## Monitoring During Migrations

```sql
-- Check for blocking queries
SELECT 
  blocked_locks.pid AS blocked_pid,
  blocking_locks.pid AS blocking_pid,
  blocked_activity.query AS blocked_query,
  blocking_activity.query AS blocking_query
FROM pg_locks blocked_locks
JOIN pg_stat_activity blocked_activity ON blocked_activity.pid = blocked_locks.pid
JOIN pg_locks blocking_locks ON blocking_locks.locktype = blocked_locks.locktype
JOIN pg_stat_activity blocking_activity ON blocking_activity.pid = blocking_locks.pid
WHERE NOT blocked_locks.granted;

-- Check migration progress (for CREATE INDEX CONCURRENTLY)
SELECT 
  p.phase,
  p.blocks_done,
  p.blocks_total,
  p.tuples_done,
  p.tuples_total
FROM pg_stat_progress_create_index p
JOIN pg_stat_activity a ON a.pid = p.pid;
```
