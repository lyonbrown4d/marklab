import type { NodeSearchDatabase } from '@electron/services/knowledgeEngine/nodeSearchDatabase'
import type {
  OccurrenceSearchInput,
  OccurrenceSearchOutput,
} from '@electron/services/knowledgeEngine/workspaceOccurrenceSearch'
import { WorkspaceOccurrenceSearchWorkerClient } from '@electron/services/knowledgeEngine/workspaceOccurrenceSearchWorkerClient'
import type {
  WorkspaceOccurrenceSearchRequest,
  WorkspaceOccurrenceSearchResultSet,
  WorkspaceSearchDocument,
} from '@electron/services/workspace/workspaceSearchTypes'

const MAX_DOCUMENTS = 2_000
const MAX_CHARACTERS = 8 * 1024 * 1024
const MAX_DOCUMENT_CHARACTERS = 2 * 1024 * 1024
const MAX_RESULTS = 500

export type OccurrenceSearchRunner = {
  run: (
    dataset: { documents: WorkspaceSearchDocument[]; revision: string },
    input: OccurrenceSearchInput,
    signal?: AbortSignal,
  ) => Promise<OccurrenceSearchOutput>
  dispose?: () => Promise<void>
}

type OccurrenceSnapshot = {
  dataset: { documents: WorkspaceSearchDocument[]; revision: string }
  truncated: boolean
}

export class NodeSearchOccurrences {
  private generation = 0
  private snapshot: OccurrenceSnapshot | null = null
  private snapshotPromise: Promise<OccurrenceSnapshot> | null = null

  constructor(
    private readonly database: () => NodeSearchDatabase,
    private readonly workspaceIdentity: string,
    private readonly stats: () => { documentCount: number; updatedAt: string | null },
    private readonly runner: OccurrenceSearchRunner = new WorkspaceOccurrenceSearchWorkerClient(),
  ) {}

  async search(
    request: WorkspaceOccurrenceSearchRequest,
    signal?: AbortSignal,
  ): Promise<WorkspaceOccurrenceSearchResultSet> {
    const generation = this.generation
    const snapshot = await this.getSnapshot()
    const result = await this.runner.run(
      snapshot.dataset,
      {
        ...request.options,
        limit: Math.min(Math.max(Math.trunc(request.limit ?? 100), 1), MAX_RESULTS),
        query: request.query,
      },
      signal,
    )
    if (generation !== this.generation) {
      throw new Error('Workspace occurrence search result is stale.')
    }
    return {
      ...result,
      requestId: request.requestId,
      scannedDocuments: snapshot.dataset.documents.length,
      truncated: snapshot.truncated,
    }
  }

  invalidate(): void {
    this.generation += 1
    this.snapshot = null
    this.snapshotPromise = null
  }

  dispose(): Promise<void> | undefined {
    return this.runner.dispose?.()
  }

  private async getSnapshot(): Promise<OccurrenceSnapshot> {
    if (this.snapshot) return this.snapshot
    if (this.snapshotPromise) return this.snapshotPromise
    const generation = this.generation
    const promise = this.loadSnapshot(generation)
    this.snapshotPromise = promise
    try {
      return await promise
    } finally {
      if (this.snapshotPromise === promise) this.snapshotPromise = null
    }
  }

  private async loadSnapshot(generation: number): Promise<OccurrenceSnapshot> {
    const batch = await this.database().occurrenceDocuments(
      MAX_DOCUMENTS,
      MAX_CHARACTERS,
      MAX_DOCUMENT_CHARACTERS,
    )
    const stats = this.stats()
    const snapshot = {
      dataset: {
        documents: batch.documents,
        revision: [
          this.workspaceIdentity,
          stats.updatedAt ?? '',
          stats.documentCount,
          generation,
        ].join(':'),
      },
      truncated: batch.truncated,
    }
    if (generation === this.generation) this.snapshot = snapshot
    return snapshot
  }
}
