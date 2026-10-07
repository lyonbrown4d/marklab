import { describe, expect, it, vi } from 'vitest'

import { loadWorkspaceSearchDocuments } from '@electron/services/workspace/workspaceSearchDocumentLoader'

describe('loadWorkspaceSearchDocuments', () => {
  it('loads documents with titles while preserving input order', async () => {
    const readFile = vi.fn(async (path: string) => `content:${path}`)

    const documents = await loadWorkspaceSearchDocuments({
      concurrency: 2,
      logger: { warn: vi.fn() },
      paths: ['docs/alpha.md', 'beta.md'],
      readFile,
    })

    expect(documents).toEqual([
      { path: 'docs/alpha.md', title: 'alpha', content: 'content:docs/alpha.md' },
      { path: 'beta.md', title: 'beta', content: 'content:beta.md' },
    ])
  })

  it('keeps successful documents when an individual read fails', async () => {
    const error = new Error('missing')
    const logger = { warn: vi.fn() }
    const readFile = vi.fn(async (path: string) => {
      if (path === 'missing.md') throw error
      return '# Present'
    })

    const documents = await loadWorkspaceSearchDocuments({
      concurrency: 2,
      logger,
      paths: ['missing.md', 'present.md'],
      readFile,
    })

    expect(documents).toEqual([{ path: 'present.md', title: 'present', content: '# Present' }])
    expect(logger.warn).toHaveBeenCalledWith(
      'failed to read flushed file for search index update',
      {
        error,
        path: 'missing.md',
      },
    )
  })
})
