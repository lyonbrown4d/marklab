import fs from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'

import { afterEach, beforeEach, describe, expect, it } from 'vitest'

import { LocalDatabaseService } from '@electron/database/service'
import { WorkspaceGraphStore } from '@electron/services/workspace/workspaceGraphStore'
import type { FsGraph } from '@electron/services/workspace/types'

describe('WorkspaceGraphStore', () => {
  let database: LocalDatabaseService
  let root: string

  beforeEach(async () => {
    root = await fs.mkdtemp(path.join(os.tmpdir(), 'marklab-workspace-graph-'))
    database = new LocalDatabaseService({ userDataPath: root })
  })

  afterEach(async () => {
    await database.close()
    await fs.rm(root, { force: true, recursive: true })
  })

  it('persists and restores an exact graph revision across database sessions', async () => {
    const store = new WorkspaceGraphStore(database)
    await store.save('external:C:/notes', 'revision-a', graph('alpha'))
    await database.close()
    database = new LocalDatabaseService({ userDataPath: root })

    await expect(
      new WorkspaceGraphStore(database).get('external:C:/notes', 'revision-a'),
    ).resolves.toEqual(graph('alpha'))
  })

  it('does not return a graph for a stale revision', async () => {
    const store = new WorkspaceGraphStore(database)
    await store.save('external:C:/notes', 'revision-a', graph('alpha'))

    await expect(store.get('external:C:/notes', 'revision-b')).resolves.toBeUndefined()
  })

  it('atomically replaces the previous revision for a workspace', async () => {
    const store = new WorkspaceGraphStore(database)
    await store.save('external:C:/notes', 'revision-a', graph('alpha'))
    await store.save('external:C:/notes', 'revision-b', graph('beta'))

    await expect(store.get('external:C:/notes', 'revision-a')).resolves.toBeUndefined()
    await expect(store.get('external:C:/notes', 'revision-b')).resolves.toEqual(graph('beta'))
  })

  it('treats malformed cached JSON as a cache miss', async () => {
    await database.initialize()
    await database.database
      .insertInto('workspace_graphs')
      .values({
        graph_json: '{not-json',
        graph_revision: 'revision-a',
        workspace_key: 'external:C:/notes',
      })
      .execute()

    await expect(
      new WorkspaceGraphStore(database).get('external:C:/notes', 'revision-a'),
    ).resolves.toBeUndefined()
  })
})

const graph = (label: string): FsGraph => ({
  edges: [],
  mode: 'mindmap',
  nodes: [{ id: `file:${label}.md`, kind: 'file', label, path: `${label}.md` }],
})
