import { WorkspaceBase } from '@electron/services/workspace/workspaceBase'
import { stringArg } from '@electron/services/workspace/workspaceUtils'
import { runWorkspacePathMutation } from '@electron/services/workspace/workspaceWriteCoordinator'

export class WorkspaceMutationService extends WorkspaceBase {
  writeCoordinatorOwnerId(): string {
    return this.buffers.getWriteOwnerId()
  }

  async runExternalPathMutation<T>(relativePaths: string[], work: () => Promise<T>): Promise<T> {
    this.ensureWorkspaceMode()
    const paths = uniqueRelativePaths(relativePaths)
    if (paths.length === 0) throw new Error('External workspace mutation requires a path')
    const absolutePaths = paths.map((relativePath) => this.resolve(relativePath))
    for (const absolutePath of absolutePaths) this.watcher.markOwnWrite(absolutePath)
    return await runWorkspacePathMutation({
      ownerId: this.writeCoordinatorOwnerId(),
      paths: absolutePaths.map((absolutePath) => ({ absolutePath })),
      work,
    })
  }

  async runExternalWorkspaceMutation<T>(work: () => Promise<T>): Promise<T> {
    this.ensureWorkspaceMode()
    return await runWorkspacePathMutation({
      ownerId: this.writeCoordinatorOwnerId(),
      paths: [{ absolutePath: this.state.rootPath, includeDescendants: true }],
      work,
    })
  }

  invalidateExternalPaths(relativePaths: string[]): void {
    this.ensureWorkspaceMode()
    const paths = uniqueRelativePaths(relativePaths)
    if (paths.length === 0) return
    for (const relativePath of paths) this.resolve(relativePath)
    this.buffers.invalidateCleanForRelativePaths(paths)
    this.onWorkspacePathChanged(null)
    this.scheduleSnapshotChanged()
  }

  invalidateAllExternalPaths(): void {
    this.ensureWorkspaceMode()
    this.buffers.invalidateAllClean()
    this.onWorkspacePathChanged(null)
    this.scheduleSnapshotChanged()
  }

  resolveCoordinatorPath(relativePath: string): string {
    return this.resolve(relativePath)
  }

  bufferMutationEpoch(): number {
    return this.buffers.getMutationEpoch()
  }

  setAutoFlushMutationRunner(runner: (work: () => Promise<void>) => Promise<void>): void {
    this.buffers.setAutoFlushMutationRunner(runner)
  }
}

const uniqueRelativePaths = (values: string[]): string[] => [
  ...new Set(values.map((value) => stringArg({ path: value }, 'path'))),
]
