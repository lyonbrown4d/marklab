import fs from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'

import { afterEach, describe, expect, it } from 'vitest'

import { LocalDatabaseService } from '@electron/database/service'

const roots: string[] = []
const services: LocalDatabaseService[] = []

afterEach(async () => {
  await Promise.all(services.splice(0).map((service) => service.close()))
  await Promise.all(roots.splice(0).map((root) => fs.rm(root, { force: true, recursive: true })))
})

describe('local database sync schema', () => {
  it('enforces relational constraints and cascades workspace sync state', async () => {
    const service = await createService()
    const inserted = await service.database
      .insertInto('workspaces')
      .values({ canonical_path: 'C:/notes', path: 'C:/Notes', root_kind: 'external' })
      .returning('id')
      .executeTakeFirstOrThrow()

    await service.database
      .insertInto('webdav_sync_state')
      .values({ workspace_id: inserted.id, updated_at: '2026-10-06T00:00:00.000Z' })
      .execute()
    await service.database
      .insertInto('webdav_sync_entries')
      .values({
        device_id: 'device-a',
        hash: 'a'.repeat(64),
        modified_at: '2026-10-06T00:00:00.000Z',
        path: 'docs/readme.md',
        position: 0,
        size: 12,
        workspace_id: inserted.id,
      })
      .execute()

    await service.database.deleteFrom('workspaces').where('id', '=', inserted.id).execute()
    const remaining = await service.database
      .selectFrom('webdav_sync_entries')
      .select(({ fn }) => fn.countAll<number>().as('count'))
      .executeTakeFirstOrThrow()
    expect(remaining.count).toBe(0)

    await expect(
      service.database
        .insertInto('session_tabs')
        .values({ position: 0, session_id: 'missing', tab_id: 'tab-1', tab_type: 'file' })
        .execute(),
    ).rejects.toThrow()
  })

  it('preserves WebDAV entry and conflict array order with explicit presence state', async () => {
    const service = await createService()
    const workspace = await service.database
      .insertInto('workspaces')
      .values({ canonical_path: 'C:/sync-order', path: 'C:/Sync Order', root_kind: 'external' })
      .returning('id')
      .executeTakeFirstOrThrow()
    await service.database
      .insertInto('webdav_sync_state')
      .values({ workspace_id: workspace.id, updated_at: '2026-10-06T00:00:00.000Z' })
      .execute()
    const initialState = await service.database
      .selectFrom('webdav_sync_state')
      .select('has_unresolved_conflicts')
      .where('workspace_id', '=', workspace.id)
      .executeTakeFirstOrThrow()
    expect(initialState.has_unresolved_conflicts).toBe(0)
    await service.database
      .updateTable('webdav_sync_state')
      .set({ has_unresolved_conflicts: 1 })
      .where('workspace_id', '=', workspace.id)
      .execute()
    expect(() =>
      service.sqlite
        .prepare<[number, number]>(
          'update webdav_sync_state set has_unresolved_conflicts = ? where workspace_id = ?',
        )
        .run(2, workspace.id),
    ).toThrow()

    await service.database
      .insertInto('webdav_sync_entries')
      .values([
        syncEntry(workspace.id, 'second.md', 1, 'a', 2),
        syncEntry(workspace.id, 'first.md', 0, 'b', 1),
      ])
      .execute()
    await service.database
      .insertInto('sync_conflicts')
      .values([
        syncConflict(workspace.id, 'second.md', 1, 'both_changed'),
        syncConflict(workspace.id, 'first.md', 0, 'delete_vs_change'),
      ])
      .execute()

    const entries = await service.database
      .selectFrom('webdav_sync_entries')
      .select('path')
      .orderBy('position')
      .execute()
    const conflicts = await service.database
      .selectFrom('sync_conflicts')
      .select('path')
      .orderBy('position')
      .execute()
    expect(entries.map(({ path }) => path)).toEqual(['first.md', 'second.md'])
    expect(conflicts.map(({ path }) => path)).toEqual(['first.md', 'second.md'])
    await expect(
      service.database
        .insertInto('sync_conflicts')
        .values(syncConflict(workspace.id, 'invalid.md', -1, 'both_changed'))
        .execute(),
    ).rejects.toThrow()
  })

  it('allows a WebDAV channel to reference a profile that will be created later', async () => {
    const service = await createService()
    const workspace = await service.database
      .insertInto('workspaces')
      .values({
        canonical_path: 'C:/future-profile',
        path: 'C:/Future Profile',
        root_kind: 'external',
      })
      .returning('id')
      .executeTakeFirstOrThrow()

    await expect(
      service.database
        .insertInto('workspace_sync_channels')
        .values({
          auto_fetch: null,
          auto_sync: 1,
          branch: null,
          profile_id: 'profile-created-later',
          provider: 'webdav',
          remote: null,
          remote_root: '/notes',
          workspace_id: workspace.id,
        })
        .execute(),
    ).resolves.toBeDefined()

    const index = service.sqlite
      .prepare<[string], { name: string }>(
        `select name from sqlite_master where type = 'index' and name = ?`,
      )
      .get('workspace_sync_channels_profile_index')
    expect(index?.name).toBe('workspace_sync_channels_profile_index')
  })
})

const createService = async (): Promise<LocalDatabaseService> => {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), 'marklab-sync-schema-'))
  roots.push(root)
  const service = new LocalDatabaseService({ userDataPath: root })
  await service.initialize()
  services.push(service)
  return service
}

const syncEntry = (
  workspaceId: number,
  file: string,
  position: number,
  hash: string,
  size: number,
) => ({
  device_id: 'device-a',
  hash: hash.repeat(64),
  modified_at: '2026-10-06T00:00:00.000Z',
  path: file,
  position,
  size,
  workspace_id: workspaceId,
})

const syncConflict = (
  workspaceId: number,
  file: string,
  position: number,
  reason: 'both_changed' | 'delete_vs_change',
) => ({ path: file, position, reason, status: 'unresolved' as const, workspace_id: workspaceId })
