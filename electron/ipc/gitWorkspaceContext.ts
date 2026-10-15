import type { IpcMainInvokeEvent } from 'electron'
import path from 'node:path'
import type { WorkspaceSyncCoordinator } from '@electron/services/sync/core/coordinator'
import type { FsRootInfo } from '@electron/services/workspace/types'
import type { WindowWorkspaceRegistry } from '@electron/services/workspace/windowWorkspaceRegistry'

export type GitWorkspaceDependencies = {
  workspaceMutationCoordinator: Pick<WorkspaceSyncCoordinator, 'runMutation'>
  workspaceRegistry: WindowWorkspaceRegistry
}

export type GitMutationOptions = {
  flush?: boolean
  invalidate?: boolean
  lockWorkspace?: boolean
  expectedRoot?: string
}

export const createGitWorkspaceContext = (dependencies: GitWorkspaceDependencies) => {
  const rootFor = (event: IpcMainInvokeEvent, expectedRoot?: string): string => {
    const root = dependencies.workspaceRegistry.serviceForWebContents(event.sender).rootInfo()
    if (root.kind === 'single') throw new Error('Git is unavailable in single-file mode')
    if (expectedRoot !== undefined && !hasWorkspaceRoot(root, expectedRoot)) {
      throw new Error('Workspace changed before the Git operation started')
    }
    return root.path
  }
  const mutateWorkspace = async <T>(
    event: IpcMainInvokeEvent,
    work: (root: string) => Promise<T>,
    options: GitMutationOptions = {},
  ): Promise<T> => {
    const workspace = dependencies.workspaceRegistry.serviceForWebContents(event.sender)
    const initialRoot = workspace.rootInfo()
    if (initialRoot.kind === 'single') throw new Error('Git is unavailable in single-file mode')
    if (
      options.expectedRoot !== undefined &&
      !hasWorkspaceRoot(initialRoot, options.expectedRoot)
    ) {
      throw new Error('Workspace changed before the Git operation started')
    }
    return dependencies.workspaceMutationCoordinator.runMutation(initialRoot.path, async () => {
      const activeRoot = workspace.rootInfo()
      if (!hasWorkspaceRoot(activeRoot, initialRoot.path)) {
        throw new Error('Workspace changed before the Git operation started')
      }
      if (options.flush) await workspace.flushBuffers()
      if (!hasWorkspaceRoot(workspace.rootInfo(), initialRoot.path)) {
        throw new Error('Workspace changed before the Git operation started')
      }
      try {
        const result = options.lockWorkspace
          ? await workspace.runExternalWorkspaceMutation(() => work(initialRoot.path))
          : await work(initialRoot.path)
        if (!hasWorkspaceRoot(workspace.rootInfo(), initialRoot.path)) {
          throw new Error('Workspace changed during the Git operation')
        }
        return result
      } finally {
        if (options.invalidate && hasWorkspaceRoot(workspace.rootInfo(), initialRoot.path)) {
          workspace.invalidateAllExternalPaths()
        }
      }
    })
  }

  return { rootFor, mutateWorkspace }
}

const canonicalRoot = (value: string): string => {
  const resolved = path.resolve(value).normalize('NFC')
  return process.platform === 'win32' ? resolved.toLowerCase() : resolved
}

const hasWorkspaceRoot = (root: FsRootInfo, expected: string): boolean =>
  root.kind !== 'single' && canonicalRoot(root.path) === canonicalRoot(expected)
