import { describe, expect, it, vi } from 'vitest'

import { WorkspaceAnalysisCache } from '@electron/services/workspace/workspaceAnalysisCache'
import { WorkspaceGraphQueryService } from '@electron/services/workspace/workspaceGraphQueryService'

describe('WorkspaceGraphQueryService topology validation', () => {
  it('normalizes invalid resolver values before exposing topology', async () => {
    const service = new WorkspaceGraphQueryService({
      analysisCache: new WorkspaceAnalysisCache(),
      getInput: vi.fn().mockResolvedValue({
        documents: [{ content: '# Alpha', path: 'note.md' }],
        knownPaths: { assetPaths: [], paths: ['note.md'] },
      }),
      getNodeDocuments: vi.fn(),
      getState: () => ({
        internalRoot: 'C:/app/workspace',
        rootKind: 'external',
        rootPath: 'C:/notes',
        singleFile: null,
      }),
      graphResolver: {
        resolve: vi.fn(async () => ({
          mode: 'mindmap',
          revision: Number.NaN,
          nodes: [
            { id: 'file:note.md', kind: 'file', label: 'Alpha', path: ['note.md'] },
            { id: 'file:bad.md', kind: 'file', label: { forged: true } },
          ],
          edges: [
            {
              id: 'bad-edge',
              kind: 'links_to',
              source: 'file:note.md',
              target: { forged: true },
            },
          ],
        })),
      } as never,
      logger: {} as never,
      runNodeDetails: vi.fn(),
    })

    await expect(service.load('interactive')).resolves.toEqual({
      mode: 'mindmap',
      nodes: [{ id: 'file:note.md', kind: 'file', label: 'Alpha' }],
      edges: [],
    })
  })
})
