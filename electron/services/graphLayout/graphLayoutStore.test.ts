import fs from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import { LocalDatabaseService } from '@electron/database/service'
import { GraphLayoutStore } from '@electron/services/graphLayout/graphLayoutStore'

describe('GraphLayoutStore', () => {
  let database: LocalDatabaseService
  let root: string

  beforeEach(async () => {
    root = await fs.mkdtemp(path.join(os.tmpdir(), 'marklab-graph-layout-'))
    database = new LocalDatabaseService({ userDataPath: root })
  })

  afterEach(async () => {
    await database.close()
    await fs.rm(root, { force: true, recursive: true })
  })

  it('persists and restores an exact layout with its viewport in one batch', async () => {
    const store = new GraphLayoutStore(database)
    await store.save('external:C:/notes', layout('revision-a'))
    await database.close()
    database = new LocalDatabaseService({ userDataPath: root })

    await expect(
      new GraphLayoutStore(database).get('external:C:/notes', request('revision-a')),
    ).resolves.toEqual({
      match: 'exact',
      nodes: [node('file:a.md')],
      viewport: { x: 10, y: 20, zoom: 1.25 },
    })
  })

  it('returns stable node overrides but not the viewport when the graph revision is stale', async () => {
    const store = new GraphLayoutStore(database)
    await store.save('external:C:/notes', layout('revision-a'))

    await expect(store.get('external:C:/notes', request('revision-b'))).resolves.toEqual({
      match: 'stale',
      nodes: [node('file:a.md')],
      viewport: null,
    })
  })

  it('reads layout metadata and nodes from one database snapshot', async () => {
    const store = new GraphLayoutStore(database)
    await store.save('external:C:/notes', layout('revision-a'))
    const transaction = vi.spyOn(database.sqlite, 'transaction')

    await store.get('external:C:/notes', request('revision-a'))

    expect(transaction).toHaveBeenCalledOnce()
  })

  it('isolates workspaces and replaces removed nodes transactionally', async () => {
    const store = new GraphLayoutStore(database)
    await store.save('external:C:/notes', {
      ...layout('revision-a'),
      nodes: [node('file:a.md'), node('file:b.md')],
    })
    await store.save('external:C:/notes', layout('revision-a'))

    await expect(store.get('external:D:/notes', request('revision-a'))).resolves.toEqual({
      match: 'miss',
      nodes: [],
      viewport: null,
    })
    const restored = await store.get('external:C:/notes', request('revision-a'))
    expect(restored.nodes.map(({ id }) => id)).toEqual(['file:a.md'])
  })

  it('rolls back the replacement when a batched node write fails', async () => {
    const store = new GraphLayoutStore(database)
    await store.save('external:C:/notes', layout('revision-a'))

    await expect(
      store.save('external:C:/notes', {
        ...layout('revision-b'),
        nodes: [node('duplicate'), node('duplicate')],
      }),
    ).rejects.toThrow()

    await expect(store.get('external:C:/notes', request('revision-a'))).resolves.toMatchObject({
      match: 'exact',
      nodes: [expect.objectContaining({ id: 'file:a.md' })],
    })
  })
})

const request = (graphRevision: string) => ({
  engineVersion: 'elk-workspace-map-v1',
  graphRevision,
  layoutKey: 'workspace-map:overview',
  mode: 'overview' as const,
})

const layout = (graphRevision: string) => ({
  ...request(graphRevision),
  nodes: [node('file:a.md')],
  viewport: { x: 10, y: 20, zoom: 1.25 },
})

const node = (id: string) => ({
  collapsed: false,
  height: 240,
  id,
  pinned: true,
  userModified: true,
  width: 360,
  x: 100,
  y: 200,
})
