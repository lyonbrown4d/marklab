import type { Insertable, Selectable, Updateable } from 'kysely'

import type { DatabaseConnection, WebDavProfilesTable } from '@electron/database/types'

export type WebDavProfileRow = Selectable<WebDavProfilesTable>
export type WebDavProfileWrite = Insertable<WebDavProfilesTable>

export class WebDavProfileRepository {
  list(database: DatabaseConnection): Promise<WebDavProfileRow[]> {
    return database
      .selectFrom('webdav_profiles')
      .selectAll()
      .orderBy('label')
      .orderBy('id')
      .execute()
  }

  get(database: DatabaseConnection, id: string): Promise<WebDavProfileRow | undefined> {
    return database
      .selectFrom('webdav_profiles')
      .selectAll()
      .where('id', '=', id)
      .executeTakeFirst()
  }

  upsert(database: DatabaseConnection, value: WebDavProfileWrite): Promise<unknown> {
    return database
      .insertInto('webdav_profiles')
      .values(value)
      .onConflict((conflict) =>
        conflict.column('id').doUpdateSet({
          allow_insecure_local: value.allow_insecure_local,
          base_path: value.base_path,
          encrypted_password: value.encrypted_password,
          endpoint: value.endpoint,
          label: value.label,
          session_only: value.session_only,
          updated_at: value.updated_at,
          username: value.username,
        }),
      )
      .execute()
  }

  update(
    database: DatabaseConnection,
    id: string,
    value: Updateable<WebDavProfilesTable>,
  ): Promise<unknown> {
    return database.updateTable('webdav_profiles').set(value).where('id', '=', id).execute()
  }

  remove(database: DatabaseConnection, id: string): Promise<unknown> {
    return database.deleteFrom('webdav_profiles').where('id', '=', id).execute()
  }
}
