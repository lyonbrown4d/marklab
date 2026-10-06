import { sql, type Kysely } from 'kysely'

import { LOCAL_AI_STATE_SINGLETON_ID } from '@electron/database/schema'

const now = sql`CURRENT_TIMESTAMP`

export const createIntegrationTables = async (db: Kysely<unknown>): Promise<void> => {
  await db.schema
    .createTable('ai_providers')
    .addColumn('id', 'text', (column) => column.primaryKey())
    .addColumn('label', 'text', (column) => column.notNull())
    .addColumn('kind', 'text', (column) => column.notNull())
    .addColumn('model', 'text', (column) => column.notNull())
    .addColumn('base_url', 'text')
    .addColumn('encrypted_api_key', 'blob')
    .addColumn('created_at', 'text', (column) => column.notNull().defaultTo(now))
    .addColumn('updated_at', 'text', (column) => column.notNull().defaultTo(now))
    .addCheckConstraint(
      'ai_providers_kind_check',
      sql`kind in ('openai', 'anthropic', 'google', 'openai-compatible')`,
    )
    .execute()

  await db.schema
    .createTable('webdav_profiles')
    .addColumn('id', 'text', (column) => column.primaryKey())
    .addColumn('label', 'text', (column) => column.notNull())
    .addColumn('endpoint', 'text', (column) => column.notNull())
    .addColumn('base_path', 'text', (column) => column.notNull().defaultTo('/'))
    .addColumn('username', 'text', (column) => column.notNull())
    .addColumn('encrypted_password', 'blob')
    .addColumn('allow_insecure_local', 'integer', (column) => column.notNull().defaultTo(0))
    .addColumn('session_only', 'integer', (column) => column.notNull().defaultTo(0))
    .addColumn('created_at', 'text', (column) => column.notNull().defaultTo(now))
    .addColumn('updated_at', 'text', (column) => column.notNull().defaultTo(now))
    .addCheckConstraint('webdav_profiles_insecure_check', sql`allow_insecure_local in (0, 1)`)
    .addCheckConstraint('webdav_profiles_session_check', sql`session_only in (0, 1)`)
    .addCheckConstraint(
      'webdav_profiles_session_secret_check',
      sql`session_only = 0 or encrypted_password is null`,
    )
    .execute()

  await db.schema
    .createTable('workspace_sync_channels')
    .addColumn('workspace_id', 'integer', (column) =>
      column.notNull().references('workspaces.id').onDelete('cascade'),
    )
    .addColumn('provider', 'text', (column) => column.notNull())
    .addColumn('remote', 'text')
    .addColumn('branch', 'text')
    .addColumn('auto_fetch', 'integer')
    .addColumn('profile_id', 'text')
    .addColumn('remote_root', 'text')
    .addColumn('auto_sync', 'integer')
    .addColumn('updated_at', 'text', (column) => column.notNull().defaultTo(now))
    .addPrimaryKeyConstraint('workspace_sync_channels_primary', ['workspace_id', 'provider'])
    .addCheckConstraint(
      'workspace_sync_channels_provider_check',
      sql`provider in ('git', 'webdav')`,
    )
    .addCheckConstraint(
      'workspace_sync_channels_shape_check',
      sql`(provider = 'git' and remote is not null and auto_fetch in (0, 1) and profile_id is null and remote_root is null and auto_sync is null)
        or (provider = 'webdav' and remote is null and branch is null and auto_fetch is null and profile_id is not null and remote_root is not null and auto_sync in (0, 1))`,
    )
    .execute()
  await db.schema
    .createIndex('workspace_sync_channels_profile_index')
    .on('workspace_sync_channels')
    .column('profile_id')
    .execute()

  await db.schema
    .createTable('webdav_sync_state')
    .addColumn('workspace_id', 'integer', (column) =>
      column.primaryKey().references('workspaces.id').onDelete('cascade'),
    )
    .addColumn('remote_manifest_etag', 'text')
    .addColumn('has_unresolved_conflicts', 'integer', (column) => column.notNull().defaultTo(0))
    .addColumn('updated_at', 'text', (column) => column.notNull())
    .addCheckConstraint(
      'webdav_sync_state_conflicts_check',
      sql`has_unresolved_conflicts in (0, 1)`,
    )
    .execute()

  await db.schema
    .createTable('webdav_sync_entries')
    .addColumn('workspace_id', 'integer', (column) =>
      column.notNull().references('webdav_sync_state.workspace_id').onDelete('cascade'),
    )
    .addColumn('path', 'text', (column) => column.notNull())
    .addColumn('position', 'integer', (column) => column.notNull())
    .addColumn('hash', 'text', (column) => column.notNull())
    .addColumn('size', 'integer', (column) => column.notNull())
    .addColumn('modified_at', 'text', (column) => column.notNull())
    .addColumn('device_id', 'text', (column) => column.notNull())
    .addColumn('storage', 'text')
    .addColumn('etag', 'text')
    .addColumn('deleted_at', 'text')
    .addPrimaryKeyConstraint('webdav_sync_entries_primary', ['workspace_id', 'path'])
    .addCheckConstraint('webdav_sync_entries_position_check', sql`position >= 0`)
    .addCheckConstraint('webdav_sync_entries_size_check', sql`size >= 0`)
    .addCheckConstraint(
      'webdav_sync_entries_storage_check',
      sql`storage is null or storage = 'object'`,
    )
    .execute()

  await db.schema
    .createTable('sync_conflicts')
    .addColumn('workspace_id', 'integer', (column) =>
      column.notNull().references('webdav_sync_state.workspace_id').onDelete('cascade'),
    )
    .addColumn('path', 'text', (column) => column.notNull())
    .addColumn('position', 'integer', (column) => column.notNull())
    .addColumn('status', 'text', (column) => column.notNull().defaultTo('unresolved'))
    .addColumn('reason', 'text', (column) => column.notNull())
    .addColumn('conflict_path', 'text')
    .addColumn('local_hash', 'text')
    .addColumn('remote_hash', 'text')
    .addColumn('created_at', 'text', (column) => column.notNull().defaultTo(now))
    .addPrimaryKeyConstraint('sync_conflicts_primary', ['workspace_id', 'path'])
    .addCheckConstraint('sync_conflicts_position_check', sql`position >= 0`)
    .addCheckConstraint('sync_conflicts_status_check', sql`status = 'unresolved'`)
    .addCheckConstraint(
      'sync_conflicts_reason_check',
      sql`reason in ('both_changed', 'delete_vs_change')`,
    )
    .execute()

  await db.schema
    .createTable('graph_layouts')
    .addColumn('workspace_key', 'text', (column) => column.notNull())
    .addColumn('layout_key', 'text', (column) => column.notNull())
    .addColumn('graph_revision', 'text', (column) => column.notNull())
    .addColumn('mode', 'text', (column) => column.notNull())
    .addColumn('engine_version', 'text', (column) => column.notNull())
    .addColumn('viewport_x', 'real')
    .addColumn('viewport_y', 'real')
    .addColumn('viewport_zoom', 'real')
    .addColumn('updated_at', 'text', (column) => column.notNull().defaultTo(now))
    .addPrimaryKeyConstraint('graph_layouts_primary', ['workspace_key', 'layout_key'])
    .addCheckConstraint(
      'graph_layouts_viewport_zoom_check',
      sql`viewport_zoom is null or viewport_zoom > 0`,
    )
    .execute()

  await db.schema
    .createTable('graph_node_layouts')
    .addColumn('workspace_key', 'text', (column) => column.notNull())
    .addColumn('layout_key', 'text', (column) => column.notNull())
    .addColumn('node_id', 'text', (column) => column.notNull())
    .addColumn('x', 'real', (column) => column.notNull())
    .addColumn('y', 'real', (column) => column.notNull())
    .addColumn('width', 'real', (column) => column.notNull())
    .addColumn('height', 'real', (column) => column.notNull())
    .addColumn('collapsed', 'integer', (column) => column.notNull().defaultTo(0))
    .addColumn('pinned', 'integer', (column) => column.notNull().defaultTo(0))
    .addColumn('user_modified', 'integer', (column) => column.notNull().defaultTo(0))
    .addColumn('updated_at', 'text', (column) => column.notNull().defaultTo(now))
    .addPrimaryKeyConstraint('graph_node_layouts_primary', [
      'workspace_key',
      'layout_key',
      'node_id',
    ])
    .addForeignKeyConstraint(
      'graph_node_layouts_layout_foreign',
      ['workspace_key', 'layout_key'],
      'graph_layouts',
      ['workspace_key', 'layout_key'],
      (constraint) => constraint.onDelete('cascade'),
    )
    .addCheckConstraint('graph_node_layouts_size_check', sql`width > 0 and height > 0`)
    .addCheckConstraint(
      'graph_node_layouts_flags_check',
      sql`collapsed in (0, 1) and pinned in (0, 1) and user_modified in (0, 1)`,
    )
    .execute()

  await db.schema
    .createTable('local_ai_state')
    .addColumn('id', 'integer', (column) =>
      column.primaryKey().defaultTo(LOCAL_AI_STATE_SINGLETON_ID),
    )
    .addColumn('active_model_id', 'text')
    .addColumn('model_directory_enabled', 'integer', (column) => column.notNull().defaultTo(0))
    .addColumn('model_directory_path', 'text')
    .addColumn('model_directory_device_id', 'text')
    .addColumn('migration_json', 'text')
    .addColumn('updated_at', 'text', (column) => column.notNull().defaultTo(now))
    .addCheckConstraint(
      'local_ai_state_singleton_check',
      sql`id = ${sql.lit(LOCAL_AI_STATE_SINGLETON_ID)}`,
    )
    .addCheckConstraint('local_ai_state_enabled_check', sql`model_directory_enabled in (0, 1)`)
    .execute()
}

export const dropIntegrationTables = async (db: Kysely<unknown>): Promise<void> => {
  await db.schema.dropTable('local_ai_state').ifExists().execute()
  await db.schema.dropTable('sync_conflicts').ifExists().execute()
  await db.schema.dropTable('webdav_sync_entries').ifExists().execute()
  await db.schema.dropTable('webdav_sync_state').ifExists().execute()
  await db.schema.dropTable('workspace_sync_channels').ifExists().execute()
  await db.schema.dropTable('graph_node_layouts').ifExists().execute()
  await db.schema.dropTable('graph_layouts').ifExists().execute()
  await db.schema.dropTable('webdav_profiles').ifExists().execute()
  await db.schema.dropTable('ai_providers').ifExists().execute()
}
