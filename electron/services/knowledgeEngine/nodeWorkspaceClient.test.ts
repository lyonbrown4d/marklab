import fs from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'

import { afterEach, describe, expect, it } from 'vitest'

import { createNodeWorkspaceClient } from '@electron/services/knowledgeEngine/nodeWorkspaceClient.js'

const tempRoots: string[] = []

afterEach(async () => {
  await Promise.all(
    tempRoots.splice(0).map((root) => fs.rm(root, { force: true, recursive: true })),
  )
})

const createWorkspace = async () => {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), 'marklab-node-sidecar-'))
  tempRoots.push(root)
  const engineDataDir = path.join(root, '.engine-data')
  await fs.writeFile(path.join(root, 'alpha.md'), '# Alpha\nLocal knowledge engine')
  return { client: createNodeWorkspaceClient(root, engineDataDir), engineDataDir, root }
}

describe('Node workspace client', () => {
  it('provides workspace VFS operations without an external binary', async () => {
    const { client, root } = await createWorkspace()

    await expect(client.readWorkspaceFile('alpha.md')).resolves.toContain('# Alpha')
    await expect(client.writeWorkspaceFile('alpha.md', '# Updated')).resolves.toEqual({
      changed: true,
      kind: 'file',
    })
    await expect(client.createWorkspaceDirectory('notes')).resolves.toEqual({
      changed: true,
      kind: 'folder',
    })
    await client.createWorkspaceFile('notes/new.md')
    await client.renameWorkspacePath('notes/new.md', 'notes/renamed.md')

    const snapshot = await client.getWorkspaceFileSnapshot({ kind: 'external', path: root })
    expect(snapshot.entries.map((entry) => entry.path)).toEqual([
      'alpha.md',
      'notes',
      'notes/renamed.md',
    ])
    await expect(client.getWorkspacePathMetadata('notes/renamed.md')).resolves.toMatchObject({
      kind: 'file',
      path: 'notes/renamed.md',
    })
    await expect(client.readWorkspaceFile('../outside.md')).rejects.toThrow(
      /inside|parent|relative/i,
    )
  })

  it('indexes and searches Markdown documents in Node', async () => {
    const { client } = await createWorkspace()
    await client.rebuildIndex([
      { path: 'alpha.md', title: 'Alpha', content: '# Alpha\nneedle in local notes' },
      { path: 'beta.md', title: 'Beta', content: '# Beta\nunrelated' },
    ])

    await expect(client.hasDocuments()).resolves.toBe(true)
    await expect(client.getWorkspaceStatus()).resolves.toMatchObject({
      health: { metadataDocuments: '2', searchableDocuments: '2' },
      index: {
        metadataDocuments: '2',
        ready: true,
        searchableDocuments: '2',
        updatedAt: expect.any(String),
        lastBuildDurationMs: expect.any(Number),
      },
      storage: {
        metadataDocuments: '2',
        searchIndexBytes: expect.stringMatching(/^[1-9]\d*$/),
      },
    })
    await expect(client.search('needle', 10)).resolves.toMatchObject([
      { path: 'alpha.md', title: 'Alpha', line: 2 },
    ])
    const result = await client.searchWithOptions('alpha', {
      includeTotalHits: true,
      limit: 10,
      order: 'path',
    })
    expect(result.totalHits).toBe(1)
    expect(result.results[0]?.path).toBe('alpha.md')
  })

  it('restores the persisted search index in a restarted client', async () => {
    const { client, engineDataDir, root } = await createWorkspace()
    await client.rebuildIndex([
      { path: 'alpha.md', title: 'Alpha', content: 'restart-safe content' },
    ])

    const restarted = createNodeWorkspaceClient(root, engineDataDir)

    await expect(restarted.search('restart-safe', 10)).resolves.toMatchObject([
      { path: 'alpha.md' },
    ])
  })

  it('reports snapshot recovery failures through workspace status without becoming unusable', async () => {
    const { client, engineDataDir, root } = await createWorkspace()
    await client.rebuildIndex([{ path: 'alpha.md', title: 'Alpha', content: 'first' }])
    await client.upsertDocument({ path: 'beta.md', title: 'Beta', content: 'second' })
    await fs.writeFile(path.join(engineDataDir, 'search-index-v2.json'), '{broken-primary')
    await fs.writeFile(path.join(engineDataDir, 'search-index-v2.backup.json'), '{broken-backup')

    const restarted = createNodeWorkspaceClient(root, engineDataDir)

    await expect(restarted.getWorkspaceStatus()).resolves.toMatchObject({
      health: {
        ok: false,
        state: 'degraded',
        warnings: [expect.stringMatching(/snapshot/i)],
      },
      index: {
        lastError: expect.stringMatching(/snapshot/i),
        ready: false,
        searchableDocuments: '0',
      },
      storage: { searchIndexBytes: expect.stringMatching(/^\d+$/) },
    })
    await expect(
      restarted.rebuildIndex([{ path: 'recovered.md', title: 'Recovered', content: 'healthy' }]),
    ).resolves.toBeUndefined()
    await expect(restarted.search('healthy', 10)).resolves.toMatchObject([{ path: 'recovered.md' }])
  })

  it('applies a mixed search mutation batch through the sidecar boundary', async () => {
    const { client } = await createWorkspace()
    await client.rebuildIndex([
      { path: 'remove.md', title: 'Remove', content: 'stale' },
      { path: 'folder/remove.md', title: 'Nested', content: 'stale' },
    ])

    await client.applySearchChanges({
      removeDocuments: ['remove.md'],
      removePrefixes: ['folder'],
      upserts: [{ path: 'fresh.md', title: 'Fresh', content: 'batch update' }],
    })

    await expect(client.search('stale', 10)).resolves.toEqual([])
    await expect(client.search('batch', 10)).resolves.toMatchObject([{ path: 'fresh.md' }])
  })

  it('advertises the utility-process protocol boundary', async () => {
    const { client } = await createWorkspace()

    await expect(client.getCapabilities('workspace-a')).resolves.toMatchObject({
      capabilities: expect.arrayContaining(['markdown-reference-diagnostics']),
      engineVersion: 'node',
      protocolVersion: 'utility-process-v1',
    })
  })

  it('keeps unsaved Markdown overlays and exposes symbols plus links', async () => {
    const { client } = await createWorkspace()
    await client.openMarkdownDocument('workspace-a', {
      content: '# Alpha\nSee [[Beta]]',
      documentId: 'alpha.md',
      uri: 'file:///alpha.md',
      version: 1,
    })

    await expect(client.getMarkdownDocumentSymbols('alpha.md', 1)).resolves.toMatchObject([
      { level: 1, name: 'Alpha', slug: 'alpha' },
    ])
    await expect(client.getMarkdownLinks('alpha.md', 1)).resolves.toMatchObject([
      { sourceDocumentId: 'alpha.md', target: 'Beta', text: 'Beta' },
    ])

    await client.changeMarkdownDocument('workspace-a', {
      baseVersion: 1,
      changes: [
        {
          range: {
            start: { character: 2, line: 0 },
            end: { character: 7, line: 0 },
          },
          text: 'Gamma',
        },
      ],
      documentId: 'alpha.md',
      version: 2,
    })
    await expect(client.getMarkdownDocumentSymbols('alpha.md', 2)).resolves.toMatchObject([
      { name: 'Gamma' },
    ])
  })

  it('computes reference diagnostics inside the Node workspace process', async () => {
    const { client } = await createWorkspace()

    await expect(
      client.getMarkdownDiagnostics('alpha.md', '[Missing][missing-ref]'),
    ).resolves.toEqual([
      expect.objectContaining({
        line: 1,
        message: "No link definition found: 'missing-ref'",
        severity: 'warning',
      }),
    ])
  })

  it('keeps simultaneous workspace diagnostics isolated', async () => {
    const workspaceA = await createWorkspace()
    const workspaceB = await createWorkspace()

    const [diagnosticsA, diagnosticsB] = await Promise.all([
      workspaceA.client.getMarkdownDiagnostics('shared.md', '[A][missing-a]'),
      workspaceB.client.getMarkdownDiagnostics('shared.md', '[B][missing-b]'),
    ])

    expect(diagnosticsA.map((diagnostic) => diagnostic.message)).toEqual([
      "No link definition found: 'missing-a'",
    ])
    expect(diagnosticsB.map((diagnostic) => diagnostic.message)).toEqual([
      "No link definition found: 'missing-b'",
    ])
  })

  it('builds outline and workspace graphs in Node', async () => {
    const { client } = await createWorkspace()
    const outline = await client.buildOutlineGraph('alpha.md', '# Alpha\nIntro\n## Details\nBody')
    expect(outline.mode).toBe('outline')
    expect(outline.nodes.map((node) => node.id)).toEqual([
      'file:alpha.md',
      'heading:alpha.md:alpha',
      'heading:alpha.md:details',
    ])

    const graph = await client.buildWorkspaceGraph(
      [
        { path: 'alpha.md', content: '# Alpha\n[Beta](beta.md)' },
        { path: 'beta.md', content: '# Beta' },
      ],
      { assetPaths: [], paths: ['alpha.md', 'beta.md'] },
    )
    expect(graph).toMatchObject({
      mode: 'mindmap',
      edges: [
        expect.objectContaining({
          kind: 'links_to',
          source: 'file:alpha.md',
          target: 'file:beta.md',
        }),
      ],
    })
  })
})
