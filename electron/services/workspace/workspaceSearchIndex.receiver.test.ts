import { mkdtemp, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import path from 'node:path'

import { afterEach, describe, expect, it } from 'vitest'

import type { FsSearchResult } from '@electron/services/workspace/types'
import {
  WorkspaceSearchIndex,
  type WorkspaceSearchIndexBackend,
} from '@electron/services/workspace/workspaceSearchIndex'
import type {
  WorkspaceOccurrenceSearchRequest,
  WorkspaceOccurrenceSearchResultSet,
} from '@electron/services/workspace/workspaceSearchTypes'

const tempDirs: string[] = []

afterEach(async () => {
  await Promise.all(tempDirs.splice(0).map((dir) => rm(dir, { recursive: true, force: true })))
})

describe('WorkspaceSearchIndex occurrence backend receiver', () => {
  it('preserves this for a prototype searchOccurrences method', async () => {
    const dir = await mkdtemp(path.join(tmpdir(), 'marklab-search-index-receiver-'))
    tempDirs.push(dir)
    const index = new WorkspaceSearchIndex(new ReceiverSearchBackend())
    await index.open(path.join(dir, 'search'), 'workspace-a')

    const result = await index.searchOccurrences(createRequest())

    expect(result).toMatchObject({ requestId: 'request-a', scannedDocuments: 42 })
    await index.close()
  })
})

class ReceiverSearchBackend implements WorkspaceSearchIndexBackend {
  private readonly scannedDocuments = 42

  async open(): Promise<void> {}
  async close(): Promise<void> {}
  async hasDocuments(): Promise<boolean> {
    return false
  }
  async rebuild(): Promise<void> {}
  async applySearchChanges(): Promise<void> {}
  async upsertDocument(): Promise<void> {}
  async removeDocument(): Promise<void> {}
  async removePathPrefix(): Promise<void> {}
  async search(): Promise<FsSearchResult[]> {
    return []
  }
  async searchOccurrences(
    _workspaceId: string,
    request: WorkspaceOccurrenceSearchRequest,
  ): Promise<WorkspaceOccurrenceSearchResultSet> {
    return {
      requestId: request.requestId,
      results: [],
      totalHits: 0,
      scannedDocuments: this.scannedDocuments,
      truncated: false,
    }
  }
}

const createRequest = (): WorkspaceOccurrenceSearchRequest => ({
  requestId: 'request-a',
  query: 'needle',
  options: { caseSensitive: false, wholeWord: false, useRegex: false },
})
