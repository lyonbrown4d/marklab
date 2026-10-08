import { describe, expect, it, vi } from 'vitest'
import { WorkspaceAnalysisCache } from '@electron/services/workspace/workspaceAnalysisCache'
import { WorkspaceGraphQueryService } from '@electron/services/workspace/workspaceGraphQueryService'
import type { FsGraph } from '@electron/services/workspace/types'

describe('WorkspaceGraphQueryService', () => {
  it('retries when the workspace changes while the first graph request is pending', async () => {
    const cache = new WorkspaceAnalysisCache()
    let releaseFirst!: (value: ReturnType<typeof input>) => void
    const first = new Promise<ReturnType<typeof input>>((resolve) => {
      releaseFirst = resolve
    })
    const getInput = vi.fn().mockReturnValueOnce(first).mockResolvedValueOnce(input('# Current'))
    const graphResolver = {
      resolve: vi.fn(async ({ documents }: { documents: Array<{ content: string }> }) =>
        graph(documents[0]?.content ?? ''),
      ),
    }
    const service = new WorkspaceGraphQueryService({
      analysisCache: cache,
      getInput,
      getNodeDocuments: vi.fn(),
      getState: () => ({
        internalRoot: 'C:/app/workspace',
        rootKind: 'external',
        rootPath: 'C:/notes',
        singleFile: null,
      }),
      graphResolver: graphResolver as never,
      knowledgeEngineService: {} as never,
      logger: {} as never,
      runNodeDetails: vi.fn(),
    })

    const request = service.load('interactive')
    await vi.waitFor(() => expect(getInput).toHaveBeenCalledOnce())
    cache.invalidate()
    releaseFirst(input('# Old'))

    await expect(request).resolves.toMatchObject({ nodes: [{ label: '# Current' }] })
    expect(getInput).toHaveBeenCalledTimes(2)
  })

  it('queries bounded node details from the cached workspace input without rebuilding topology', async () => {
    const cache = new WorkspaceAnalysisCache()
    const getInput = vi.fn().mockResolvedValue({
      documents: [
        { content: '# Alpha\n\nAlpha summary.', path: 'alpha.md' },
        { content: '# Beta\n\nBeta summary.', path: 'beta.md' },
      ],
      knownPaths: { assetPaths: [], paths: ['alpha.md', 'beta.md'] },
    })
    const graphResolver = {
      resolve: vi.fn(async () => ({
        ...graph('Topology', 'revision-1'),
        nodes: [{ id: 'file:beta.md', kind: 'file' as const, label: 'Beta', path: 'beta.md' }],
      })),
    }
    const runNodeDetails = vi.fn(async () => ({
      items: [{ id: 'file:beta.md', content: 'Beta summary.' }],
      revision: 'revision-1',
      truncated: false,
    }))
    const getNodeDocuments = vi.fn(async (paths: string[]) =>
      paths.map((path) => ({ content: '# Beta\n\nBeta summary.', path })),
    )
    const service = new WorkspaceGraphQueryService({
      analysisCache: cache,
      getInput,
      getNodeDocuments,
      getState: () => ({
        internalRoot: 'C:/app/workspace',
        rootKind: 'external',
        rootPath: 'C:/notes',
        singleFile: null,
      }),
      graphResolver: graphResolver as never,
      logger: {} as never,
      runNodeDetails,
    })

    await service.load('interactive')
    await expect(
      service.loadNodeDetails({
        mode: 'summary',
        node_ids: ['file:beta.md'],
        revision: 'revision-1',
      }),
    ).resolves.toMatchObject({ items: [{ id: 'file:beta.md', content: 'Beta summary.' }] })
    expect(runNodeDetails).toHaveBeenCalledWith(
      expect.objectContaining({
        documents: [{ content: '# Beta\n\nBeta summary.', path: 'beta.md' }],
        revision: 'revision-1',
        type: 'workspace-graph-node-details',
      }),
    )
    expect(graphResolver.resolve).toHaveBeenCalledOnce()
    expect(getInput).toHaveBeenCalledOnce()
    expect(getNodeDocuments).toHaveBeenCalledWith(['beta.md'])
  })

  it('rejects node details for a stale topology revision before running analysis', async () => {
    const cache = new WorkspaceAnalysisCache()
    const runNodeDetails = vi.fn()
    const service = new WorkspaceGraphQueryService({
      analysisCache: cache,
      getInput: vi.fn().mockResolvedValue(input('# Alpha')),
      getNodeDocuments: vi.fn(),
      getState: () => ({
        internalRoot: 'C:/app/workspace',
        rootKind: 'external',
        rootPath: 'C:/notes',
        singleFile: null,
      }),
      graphResolver: { resolve: vi.fn(async () => graph('Alpha', 'revision-2')) } as never,
      logger: {} as never,
      runNodeDetails,
    })

    await expect(
      service.loadNodeDetails({
        mode: 'summary',
        node_ids: ['file:note.md'],
        revision: 'revision-1',
      }),
    ).rejects.toThrow(/stale/i)
    expect(runNodeDetails).not.toHaveBeenCalled()
  })

  it('loads only a canonical file node matching the exact requested id', async () => {
    const cache = new WorkspaceAnalysisCache()
    const getNodeDocuments = vi.fn(async () => [{ content: '# Private', path: 'x.md' }])
    const runNodeDetails = vi.fn(async () => ({
      items: [],
      revision: 'revision-1',
      truncated: false,
    }))
    const service = new WorkspaceGraphQueryService({
      analysisCache: cache,
      getInput: vi.fn().mockResolvedValue(input('# Alpha')),
      getNodeDocuments,
      getState: () => ({
        internalRoot: 'C:/app/workspace',
        rootKind: 'external',
        rootPath: 'C:/notes',
        singleFile: null,
      }),
      graphResolver: {
        resolve: vi.fn(async () => ({
          ...graph('Topology', 'revision-1'),
          nodes: [
            { id: 'heading:x', kind: 'heading' as const, label: 'X', path: 'x.md' },
            { id: 'file:x.md', kind: 'file' as const, label: 'Wrong', path: 'y.md' },
          ],
        })),
      } as never,
      logger: {} as never,
      runNodeDetails,
    })

    await expect(
      service.loadNodeDetails({
        mode: 'summary',
        node_ids: ['file:x.md'],
        revision: 'revision-1',
      }),
    ).resolves.toMatchObject({ items: [] })
    expect(getNodeDocuments).not.toHaveBeenCalled()
    expect(runNodeDetails).toHaveBeenCalledWith(expect.objectContaining({ documents: [] }))
  })

  it('strips persisted legacy node content from topology responses', async () => {
    const cache = new WorkspaceAnalysisCache()
    const graphResolver = {
      resolve: vi.fn(async () => ({
        ...graph('Alpha'),
        nodes: [
          {
            id: 'file:note.md',
            kind: 'file' as const,
            label: 'Alpha',
            path: 'note.md',
            content: 'Legacy content',
            content_blocks: [{ id: 'p', kind: 'paragraph' as const, text: 'Legacy content' }],
          },
        ],
      })),
    }
    const service = new WorkspaceGraphQueryService({
      analysisCache: cache,
      getInput: vi.fn().mockResolvedValue(input('# Alpha')),
      getNodeDocuments: vi.fn(),
      getState: () => ({
        internalRoot: 'C:/app/workspace',
        rootKind: 'external',
        rootPath: 'C:/notes',
        singleFile: null,
      }),
      graphResolver: graphResolver as never,
      logger: {} as never,
      runNodeDetails: vi.fn(),
    })

    const result = await service.load('interactive')

    expect(result.nodes[0]).not.toHaveProperty('content')
    expect(result.nodes[0]).not.toHaveProperty('content_blocks')
  })

  it('returns a strict file-level topology from a legacy graph', async () => {
    const cache = new WorkspaceAnalysisCache()
    const service = new WorkspaceGraphQueryService({
      analysisCache: cache,
      getInput: vi.fn().mockResolvedValue(input('# Alpha')),
      getNodeDocuments: vi.fn(),
      getState: () => ({
        internalRoot: 'C:/app/workspace',
        rootKind: 'external',
        rootPath: 'C:/notes',
        singleFile: null,
      }),
      graphResolver: {
        resolve: vi.fn(async () => ({
          mode: 'mindmap' as const,
          nodes: [
            { id: 'file:note.md', kind: 'file' as const, label: 'Alpha', path: 'note.md' },
            {
              id: 'heading:note.md:intro',
              kind: 'heading' as const,
              label: 'Intro',
              path: 'note.md',
              slug: 'intro',
            },
            { id: 'file:other.md', kind: 'file' as const, label: 'Other', path: 'other.md' },
          ],
          edges: [
            {
              id: 'contains',
              kind: 'contains' as const,
              source: 'file:note.md',
              target: 'heading:note.md:intro',
            },
            {
              id: 'reference',
              kind: 'references_heading' as const,
              source: 'file:other.md',
              target: 'heading:note.md:intro',
            },
          ],
        })),
      } as never,
      logger: {} as never,
      runNodeDetails: vi.fn(),
    })

    await expect(service.load('interactive')).resolves.toMatchObject({
      nodes: [
        { id: 'file:note.md', kind: 'file' },
        { id: 'file:other.md', kind: 'file' },
      ],
      edges: [
        {
          id: 'reference',
          source: 'file:note.md',
          target: 'file:other.md',
        },
      ],
    })
  })
})

const input = (content: string) => ({
  documents: [{ content, path: 'note.md' }],
  knownPaths: { assetPaths: [], paths: ['note.md'] },
})

const graph = (label: string, revision?: string): FsGraph => ({
  edges: [],
  mode: 'mindmap',
  nodes: [{ id: 'file:note.md', kind: 'file', label, path: 'note.md' }],
  ...(revision ? { revision } : {}),
})
