import { describe, expect, it, vi } from 'vitest'

import { NodeSearchIndex } from '@electron/services/knowledgeEngine/nodeSearchIndex'
import {
  NodeSearchOccurrences,
  type OccurrenceSearchRunner,
} from '@electron/services/knowledgeEngine/nodeSearchOccurrences'
import {
  searchWorkspaceOccurrences,
  type OccurrenceSearchInput,
} from '@electron/services/knowledgeEngine/workspaceOccurrenceSearch'
import type { WorkspaceSearchDocument } from '@electron/services/workspace/workspaceSearchTypes'

const options = { caseSensitive: false, wholeWord: false, useRegex: false }

describe('NodeSearchIndex occurrence search', () => {
  it('searches complete persisted documents and returns multiple hits per file', async () => {
    const runner = {
      run: vi.fn(
        async (
          dataset: { documents: WorkspaceSearchDocument[]; revision: string },
          input: OccurrenceSearchInput,
        ) => searchWorkspaceOccurrences(dataset.documents, input),
      ),
      dispose: vi.fn(async () => undefined),
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
    expect(runner.run.mock.calls[0]?.[0]).toMatchObject({
      documents: [expect.objectContaining({ path: 'notes/one.md' })],
      revision: expect.any(String),
    })
    await index.close()
    expect(runner.dispose).toHaveBeenCalledOnce()
  })

  it('passes exact advanced options and cancellation to the isolated runner', async () => {
    const run: OccurrenceSearchRunner['run'] = async () => ({ results: [], totalHits: 0 })
    const runner = {
      run: vi.fn(run),
      dispose: vi.fn(async () => undefined),
    }
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
      expect.objectContaining({
        documents: [expect.objectContaining({ content: 'Alpha alpha' })],
        revision: expect.any(String),
      }),
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

  it('reuses one bounded occurrence document snapshot until the index revision changes', async () => {
    const run: OccurrenceSearchRunner['run'] = async () => ({ results: [], totalHits: 0 })
    const runner = {
      run: vi.fn(run),
    }
    const index = new NodeSearchIndex(undefined, 'workspace', {}, runner)
    await index.rebuild([{ path: 'one.md', title: 'One', content: 'needle' }])

    await index.searchOccurrences({ requestId: 'first', query: 'needle', options })
    await index.searchOccurrences({ requestId: 'second', query: 'needle', options })

    expect(runner.run.mock.calls[0]?.[0]).toBe(runner.run.mock.calls[1]?.[0])
    await index.upsert({ path: 'two.md', title: 'Two', content: 'needle' })
    await index.searchOccurrences({ requestId: 'third', query: 'needle', options })
    expect(runner.run.mock.calls[2]?.[0]).not.toBe(runner.run.mock.calls[1]?.[0])
    expect(runner.run.mock.calls[2]?.[0]).toMatchObject({
      documents: [expect.any(Object), expect.any(Object)],
    })
    await index.close()
  })

  it('shares an in-flight database snapshot and rejects a result invalidated while searching', async () => {
    let releaseDocuments!: (value: {
      documents: WorkspaceSearchDocument[]
      truncated: boolean
    }) => void
    const occurrenceDocuments = vi.fn(
      () =>
        new Promise<{ documents: WorkspaceSearchDocument[]; truncated: boolean }>((resolve) => {
          releaseDocuments = resolve
        }),
    )
    const releaseSearches: Array<(value: { results: []; totalHits: number }) => void> = []
    const runner = {
      run: vi.fn(
        () =>
          new Promise<{ results: []; totalHits: number }>((resolve) => {
            releaseSearches.push(resolve)
          }),
      ),
    }
    const occurrences = new NodeSearchOccurrences(
      () => ({ occurrenceDocuments }) as never,
      'workspace',
      () => ({ documentCount: 1, updatedAt: 'now' }),
      runner,
    )
    const request = { requestId: 'first', query: 'needle', options }
    const first = occurrences.search(request)
    const second = occurrences.search({ ...request, requestId: 'second' })

    expect(occurrenceDocuments).toHaveBeenCalledOnce()
    releaseDocuments({
      documents: [{ path: 'one.md', title: 'One', content: 'needle' }],
      truncated: false,
    })
    await vi.waitFor(() => expect(runner.run).toHaveBeenCalledTimes(2))
    occurrences.invalidate()
    releaseSearches.forEach((release) => release({ results: [], totalHits: 0 }))

    await expect(first).rejects.toThrow(/stale/i)
    await expect(second).rejects.toThrow(/stale/i)
  })
})
