import { sql, type Kysely } from 'kysely'

const now = sql`CURRENT_TIMESTAMP`

export const createCoreTables = async (db: Kysely<unknown>): Promise<void> => {
  await db.schema
    .createTable('settings')
    .addColumn('key', 'text', (column) => column.primaryKey())
    .addColumn('value_json', 'text', (column) => column.notNull())
    .addColumn('version', 'integer')
    .addColumn('updated_at', 'text', (column) => column.notNull().defaultTo(now))
    .execute()

  await db.schema
    .createTable('recent_workspaces')
    .addColumn('workspace_path', 'text', (column) => column.primaryKey())
    .addColumn('position', 'integer', (column) => column.notNull())
    .addColumn('last_opened_at', 'text', (column) => column.notNull().defaultTo(now))
    .addCheckConstraint('recent_workspaces_position_check', sql`position >= 0`)
    .execute()
  await db.schema
    .createIndex('recent_workspaces_position_unique')
    .unique()
    .on('recent_workspaces')
    .column('position')
    .execute()

  await db.schema
    .createTable('workspaces')
    .addColumn('id', 'integer', (column) => column.primaryKey().autoIncrement())
    .addColumn('path', 'text', (column) => column.notNull())
    .addColumn('canonical_path', 'text', (column) => column.notNull().unique())
    .addColumn('root_kind', 'text', (column) => column.notNull())
    .addColumn('created_at', 'text', (column) => column.notNull().defaultTo(now))
    .addColumn('updated_at', 'text', (column) => column.notNull().defaultTo(now))
    .addCheckConstraint(
      'workspaces_root_kind_check',
      sql`root_kind in ('external', 'internal', 'single')`,
    )
    .execute()

  await db.schema
    .createTable('window_sessions')
    .addColumn('id', 'text', (column) => column.primaryKey())
    .addColumn('workspace_id', 'integer', (column) =>
      column.references('workspaces.id').onDelete('set null'),
    )
    .addColumn('active_tab_id', 'text')
    .addColumn('root_kind', 'text', (column) => column.notNull())
    .addColumn('root_path', 'text')
    .addColumn('version', 'integer', (column) => column.notNull().defaultTo(1))
    .addColumn('updated_at', 'text', (column) => column.notNull().defaultTo(now))
    .addCheckConstraint(
      'window_sessions_root_kind_check',
      sql`root_kind in ('external', 'internal', 'single')`,
    )
    .execute()

  await db.schema
    .createTable('session_tabs')
    .addColumn('session_id', 'text', (column) =>
      column.notNull().references('window_sessions.id').onDelete('cascade'),
    )
    .addColumn('tab_id', 'text', (column) => column.notNull())
    .addColumn('position', 'integer', (column) => column.notNull())
    .addColumn('tab_type', 'text', (column) => column.notNull())
    .addColumn('file_path', 'text')
    .addColumn('title', 'text')
    .addColumn('state_json', 'text', (column) => column.notNull().defaultTo('{}'))
    .addPrimaryKeyConstraint('session_tabs_primary', ['session_id', 'tab_id'])
    .addUniqueConstraint('session_tabs_position_unique', ['session_id', 'position'])
    .addCheckConstraint('session_tabs_position_check', sql`position >= 0`)
    .execute()

  await db.schema
    .createTable('window_state')
    .addColumn('window_id', 'text', (column) => column.primaryKey())
    .addColumn('x', 'integer')
    .addColumn('y', 'integer')
    .addColumn('width', 'integer', (column) => column.notNull())
    .addColumn('height', 'integer', (column) => column.notNull())
    .addColumn('is_maximized', 'integer', (column) => column.notNull().defaultTo(0))
    .addColumn('updated_at', 'text', (column) => column.notNull().defaultTo(now))
    .addCheckConstraint('window_state_width_check', sql`width > 0`)
    .addCheckConstraint('window_state_height_check', sql`height > 0`)
    .addCheckConstraint('window_state_maximized_check', sql`is_maximized in (0, 1)`)
    .execute()
}

export const dropCoreTables = async (db: Kysely<unknown>): Promise<void> => {
  await db.schema.dropTable('window_state').ifExists().execute()
  await db.schema.dropTable('session_tabs').ifExists().execute()
  await db.schema.dropTable('window_sessions').ifExists().execute()
  await db.schema.dropTable('workspaces').ifExists().execute()
  await db.schema.dropTable('recent_workspaces').ifExists().execute()
  await db.schema.dropTable('settings').ifExists().execute()
}
