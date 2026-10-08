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

  it('cleans legacy heading and body data while restoring preview topology', async () => {
    await database.initialize()
    await database.database
      .insertInto('workspace_graphs')
      .values({
        graph_json: JSON.stringify(legacyGraph()),
        graph_revision: 'revision-a',
        workspace_key: 'external:C:/notes',
      })
      .execute()

    await expect(
      new WorkspaceGraphStore(database).get('external:C:/notes', 'revision-a'),
    ).resolves.toEqual(lightweightGraph())
  })

  it('rewrites a successfully cleaned legacy blob under the same revision', async () => {
    await database.initialize()
    await database.database
      .insertInto('workspace_graphs')
      .values({
        graph_json: JSON.stringify(legacyGraph()),
        graph_revision: 'revision-a',
        workspace_key: 'external:C:/notes',
      })
      .execute()

    await new WorkspaceGraphStore(database).get('external:C:/notes', 'revision-a')
    const row = await database.database
      .selectFrom('workspace_graphs')
      .select(['graph_json', 'graph_revision'])
      .where('workspace_key', '=', 'external:C:/notes')
      .executeTakeFirstOrThrow()

    expect(JSON.parse(row.graph_json)).toEqual(lightweightGraph())
    expect(row.graph_revision).toBe('revision-a')
  })

  it('persists only the strict lightweight topology', async () => {
    const store = new WorkspaceGraphStore(database)
    await store.save('external:C:/notes', 'revision-a', legacyGraph())

    const row = await database.database
      .selectFrom('workspace_graphs')
      .select('graph_json')
      .where('workspace_key', '=', 'external:C:/notes')
      .executeTakeFirstOrThrow()

    expect(JSON.parse(row.graph_json)).toEqual(lightweightGraph())
  })

  it('drops invalid cached field values and rewrites the normalized graph at the same revision', async () => {
    await database.initialize()
    await database.database
      .insertInto('workspace_graphs')
      .values({
        graph_json: JSON.stringify(invalidValueGraph()),
        graph_revision: 'revision-a',
        workspace_key: 'external:C:/notes',
      })
      .execute()

    const result = await new WorkspaceGraphStore(database).get('external:C:/notes', 'revision-a')
    const row = await database.database
      .selectFrom('workspace_graphs')
      .select(['graph_json', 'graph_revision'])
      .where('workspace_key', '=', 'external:C:/notes')
      .executeTakeFirstOrThrow()

    expect(result).toEqual(invalidValueGraphNormalized())
    expect(JSON.parse(row.graph_json)).toEqual(invalidValueGraphNormalized())
    expect(row.graph_revision).toBe('revision-a')
  })
})

const graph = (label: string): FsGraph => ({
  edges: [],
  mode: 'mindmap',
  nodes: [{ id: `file:${label}.md`, kind: 'file', label, path: `${label}.md` }],
})

const legacyGraph = (): FsGraph => ({
  mode: 'mindmap',
  revision: 'revision-a',
  ...({ workspace_path: 'C:/private' } as const),
  nodes: [
    {
      id: 'file:alpha.md',
      kind: 'file',
      label: 'alpha',
      path: 'alpha.md',
      content: 'private body',
      content_blocks: [{ id: 'body', kind: 'paragraph', text: 'private body' }],
      group: {
        key: 'group:alpha',
        label: 'Alpha',
        source: 'semantic',
        ...({ content: 'private group field' } as const),
      },
    },
    {
      id: 'heading:alpha.md:intro',
      kind: 'heading',
      label: 'Intro',
      path: 'alpha.md',
      slug: 'intro',
    },
    {
      id: 'preview:assets/map.png',
      kind: 'preview',
      label: 'map.png',
      path: 'assets/map.png',
      preview_kind: 'image',
      source_path: 'alpha.md',
      target: 'assets/map.png',
    },
  ],
  edges: [
    {
      id: 'contains',
      kind: 'contains',
      source: 'file:alpha.md',
      target: 'heading:alpha.md:intro',
    },
    {
      id: 'preview-edge',
      kind: 'previews',
      source: 'heading:alpha.md:intro',
      target: 'preview:assets/map.png',
      ...({ content: 'private edge field' } as const),
    },
  ],
})

const lightweightGraph = (): FsGraph => ({
  mode: 'mindmap',
  revision: 'revision-a',
  nodes: [
    {
      id: 'file:alpha.md',
      kind: 'file',
      label: 'alpha',
      path: 'alpha.md',
      group: { key: 'group:alpha', label: 'Alpha', source: 'semantic' },
    },
    {
      id: 'preview:assets/map.png',
      kind: 'preview',
      label: 'map.png',
      path: 'assets/map.png',
      preview_kind: 'image',
      source_path: 'alpha.md',
      target: 'assets/map.png',
    },
  ],
  edges: [
    {
      id: 'preview-edge',
      kind: 'previews',
      source: 'file:alpha.md',
      target: 'preview:assets/map.png',
    },
  ],
})

const invalidValueGraph = () => ({
  mode: 'mindmap',
  revision: { forged: true },
  nodes: [
    {
      id: 'file:alpha.md',
      kind: 'file',
      label: 'Alpha',
      path: ['alpha.md'],
      group: { key: 'group:alpha', label: 'Alpha', source: 'unknown' },
    },
    {
      id: 'preview:asset',
      kind: 'preview',
      label: 'Asset',
      path: 'asset.bin',
      preview_kind: 'archive',
      source_path: { forged: true },
      target: 42,
    },
    { id: 42, kind: 'file', label: 'Bad id' },
    { id: 'file:bad-label.md', kind: 'file', label: null },
  ],
  edges: [
    {
      id: 'valid-link',
      kind: 'links_to',
      source: 'file:alpha.md',
      target: 'preview:asset',
    },
    {
      id: 'bad-kind',
      kind: 'unknown',
      source: 'file:alpha.md',
      target: 'preview:asset',
    },
    {
      id: null,
      kind: 'links_to',
      source: 'file:alpha.md',
      target: 'preview:asset',
    },
  ],
})

const invalidValueGraphNormalized = (): FsGraph => ({
  mode: 'mindmap',
  nodes: [
    { id: 'file:alpha.md', kind: 'file', label: 'Alpha' },
    { id: 'preview:asset', kind: 'preview', label: 'Asset', path: 'asset.bin' },
  ],
  edges: [
    {
      id: 'valid-link',
      kind: 'links_to',
      source: 'file:alpha.md',
      target: 'preview:asset',
    },
  ],
})
