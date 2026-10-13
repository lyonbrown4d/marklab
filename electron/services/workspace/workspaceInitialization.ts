import type { FsStateData } from '@electron/services/workspace/types'
import { ensureDefaultFile } from '@electron/services/workspace/workspaceDefaultRoot'
import { listWorkspacePathSnapshot } from '@electron/services/workspace/workspaceUtils'
import type { Logger } from '@electron/services/logger'
import { createWorkspacePathSnapshotCache } from '@electron/services/workspace/workspacePathSnapshotCache'

export class WorkspaceInitialization {
  private pending: Promise<void> | null = null
  readonly pathSnapshots

  constructor(
    private readonly initialState: FsStateData,
    private readonly getState: () => FsStateData,
    private readonly isDisposed: () => boolean,
    private readonly onReady: () => void,
    logger: Logger,
  ) {
    this.pathSnapshots = createWorkspacePathSnapshotCache(getState, logger, this.loadSnapshot)
  }

  readonly loadSnapshot = async (state: FsStateData) => {
    if (this.isDisposed()) throw new Error('Workspace is disposed')
    if (state.rootKind === 'internal') await this.prepareInitialRoot()
    if (this.isDisposed()) throw new Error('Workspace is disposed')
    return listWorkspacePathSnapshot(state)
  }

  async ensureReady(): Promise<void> {
    if (this.isDisposed()) throw new Error('Workspace is disposed')
    // Root selections validate and prepare their own destination. An external or
    // single-file selection should never await an unrelated default-root scan.
    const state = this.getState()
    if (state !== this.initialState) return
    await this.prepareInitialRoot()
    if (this.isDisposed()) throw new Error('Workspace is disposed')
    if (this.getState() !== state) throw new Error('Workspace changed; retry the operation')
  }

  private prepareInitialRoot(): Promise<void> {
    if (!this.pending) {
      const request = ensureDefaultFile(this.initialState.internalRoot).then(() => {
        if (!this.isDisposed() && this.getState() === this.initialState) this.onReady()
      })
      this.pending = request
      void request.catch(() => {
        if (this.pending === request) this.pending = null
      })
    }
    return this.pending
  }
}
