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

describe('local database graph layout schema', () => {
  it('stores layouts by canonical workspace identity and cascades node layouts', async () => {
    const service = await createService()
    await service.database
      .insertInto('graph_layouts')
      .values({
        engine_version: 'elk-1',
        graph_revision: 'revision-1',
        layout_key: 'workspace-map',
        mode: 'workspace',
        viewport_x: 12,
        viewport_y: 24,
        viewport_zoom: 1.25,
        workspace_key: 'c:/notes',
      })
      .execute()
    await service.database
      .insertInto('graph_node_layouts')
      .values({
        collapsed: 0,
        height: 80,
        layout_key: 'workspace-map',
        node_id: 'node-a',
        pinned: 1,
        user_modified: 1,
        width: 160,
        workspace_key: 'c:/notes',
        x: 100,
        y: 200,
      })
      .execute()

    expect(() =>
      service.sqlite
        .prepare(
          `insert into graph_node_layouts
            (workspace_key, layout_key, node_id, x, y, width, height,
             collapsed, pinned, user_modified)
           values (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        )
        .run('c:/notes', 'workspace-map', 'invalid', 0, 0, -1, 0, 2, 0, 0),
    ).toThrow()

    await service.database
      .deleteFrom('graph_layouts')
      .where('workspace_key', '=', 'c:/notes')
      .where('layout_key', '=', 'workspace-map')
      .execute()
    const remaining = await service.database
      .selectFrom('graph_node_layouts')
      .select(({ fn }) => fn.countAll<number>().as('count'))
      .executeTakeFirstOrThrow()
    expect(remaining.count).toBe(0)
  })
})

const createService = async (): Promise<LocalDatabaseService> => {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), 'marklab-graph-schema-'))
  roots.push(root)
  const service = new LocalDatabaseService({ userDataPath: root })
  await service.initialize()
  services.push(service)
  return service
}
