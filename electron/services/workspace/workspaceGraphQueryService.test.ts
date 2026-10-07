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
      getState: () => ({
        internalRoot: 'C:/app/workspace',
        rootKind: 'external',
        rootPath: 'C:/notes',
        singleFile: null,
      }),
      graphResolver: graphResolver as never,
      knowledgeEngineService: {} as never,
      logger: {} as never,
    })

    const request = service.load('interactive')
    await vi.waitFor(() => expect(getInput).toHaveBeenCalledOnce())
    cache.invalidate()
    releaseFirst(input('# Old'))

    await expect(request).resolves.toMatchObject({ nodes: [{ label: '# Current' }] })
    expect(getInput).toHaveBeenCalledTimes(2)
  })
})

const input = (content: string) => ({
  documents: [{ content, path: 'note.md' }],
  knownPaths: { assetPaths: [], paths: ['note.md'] },
})

const graph = (label: string): FsGraph => ({
  edges: [],
  mode: 'mindmap',
  nodes: [{ id: 'file:note.md', kind: 'file', label, path: 'note.md' }],
})
