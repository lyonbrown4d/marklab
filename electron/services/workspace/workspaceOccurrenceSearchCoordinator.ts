import type {
  WorkspaceOccurrenceSearchCancelResult,
  WorkspaceOccurrenceSearchRequest,
  WorkspaceOccurrenceSearchResultSet,
} from '@electron/services/workspace/workspaceSearchTypes'
import {
  parseOccurrenceSearchCancel,
  parseOccurrenceSearchRequest,
} from '@electron/services/workspace/workspaceOccurrenceSearchRequest'

type WorkspaceOccurrenceSearchCoordinatorOptions = {
  prepare: () => Promise<void>
  search: (
    request: WorkspaceOccurrenceSearchRequest,
    signal: AbortSignal,
  ) => Promise<WorkspaceOccurrenceSearchResultSet>
}

export class WorkspaceOccurrenceSearchCoordinator {
  private readonly active = new Map<string, AbortController>()

  constructor(private readonly options: WorkspaceOccurrenceSearchCoordinatorOptions) {}

  async search(value: unknown): Promise<WorkspaceOccurrenceSearchResultSet> {
    const request = parseOccurrenceSearchRequest(value)
    this.active.get(request.requestId)?.abort()
    const controller = new AbortController()
    this.active.set(request.requestId, controller)
    try {
      await this.options.prepare()
      return await this.options.search(request, controller.signal)
    } finally {
      if (this.active.get(request.requestId) === controller) {
        this.active.delete(request.requestId)
      }
    }
  }

  async cancel(value: unknown): Promise<WorkspaceOccurrenceSearchCancelResult> {
    const { requestId } = parseOccurrenceSearchCancel(value)
    const controller = this.active.get(requestId)
    controller?.abort()
    return { cancelled: Boolean(controller), requestId }
  }

  dispose(): void {
    for (const controller of this.active.values()) controller.abort()
    this.active.clear()
  }
}
