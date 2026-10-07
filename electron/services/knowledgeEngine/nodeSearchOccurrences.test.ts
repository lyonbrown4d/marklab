import { describe, expect, it, vi } from 'vitest'

import { NodeSearchIndex } from '@electron/services/knowledgeEngine/nodeSearchIndex'
import { searchWorkspaceOccurrences } from '@electron/services/knowledgeEngine/workspaceOccurrenceSearch'

const options = { caseSensitive: false, wholeWord: false, useRegex: false }

describe('NodeSearchIndex occurrence search', () => {
  it('searches complete persisted documents and returns multiple hits per file', async () => {
    const runner = {
      run: vi.fn(async (documents, input) => searchWorkspaceOccurrences(documents, input)),
    }
    const index = new NodeSearchIndex(undefined, 'workspace', {}, runner)
    await index.rebuild([
      {
        path: 'notes/one.md',
        title: 'One',
        content: 'an unrelated summary line\nneedle here\nand another needle',
      },
    ])

    const result = await index.searchOccurrences({
      requestId: 'request-1',
      query: 'needle',
      limit: 20,
      options,
    })

    expect(result).toMatchObject({
      requestId: 'request-1',
      totalHits: 2,
      scannedDocuments: 1,
      truncated: false,
      results: [
        { path: 'notes/one.md', line: 2, column: 1 },
        { path: 'notes/one.md', line: 3, column: 13 },
      ],
    })
    await index.close()
  })

  it('passes exact advanced options and cancellation to the isolated runner', async () => {
    const runner = { run: vi.fn(async () => ({ results: [], totalHits: 0 })) }
    const index = new NodeSearchIndex(undefined, 'workspace', {}, runner)
    await index.rebuild([{ path: 'one.md', title: 'One', content: 'Alpha alpha' }])
    const controller = new AbortController()

    await index.searchOccurrences(
      {
        requestId: 'request-2',
        query: 'Alpha',
        options: { caseSensitive: true, wholeWord: true, useRegex: true },
      },
      controller.signal,
    )

    expect(runner.run).toHaveBeenCalledWith(
      [expect.objectContaining({ content: 'Alpha alpha' })],
      expect.objectContaining({
        caseSensitive: true,
        query: 'Alpha',
        useRegex: true,
        wholeWord: true,
      }),
      controller.signal,
    )
    await index.close()
  })
})
