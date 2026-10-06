import type { IpcMain, IpcMainInvokeEvent } from 'electron'
import path from 'node:path'
import { z } from 'zod'

import { nativeIpcChannels } from '@electron/channels'
import type { GitService } from '@electron/services/git/service'
import type { WorkspaceSyncCoordinator } from '@electron/services/sync/core/coordinator'
import type { FsRootInfo } from '@electron/services/workspace/types'
import type { WindowWorkspaceRegistry } from '@electron/services/workspace/windowWorkspaceRegistry'

type GitNamedIpcDependencies = {
  gitService: GitService
  workspaceMutationCoordinator: Pick<WorkspaceSyncCoordinator, 'runMutation'>
  workspaceRegistry: WindowWorkspaceRegistry
}

const optionalRemoteSchema = z.object({ remote: z.string().trim().min(1).optional() }).strict()
const diffSchema = z
  .object({
    path: z.string().trim().min(1),
    section: z.enum(['staged', 'unstaged', 'untracked', 'conflicts']),
  })
  .strict()
const commitSchema = z.object({ message: z.string().trim().min(1).max(10_000) }).strict()
const remoteSchema = z
  .object({ name: z.string().trim().min(1), url: z.string().trim().min(1) })
  .strict()
const remoteNameSchema = z.object({ name: z.string().trim().min(1) }).strict()
const pushSchema = z
  .object({
    remote: z.string().trim().min(1).optional(),
    setUpstream: z.boolean().optional(),
  })
  .strict()

type GitMutationOptions = {
  flush?: boolean
  invalidate?: boolean
  lockWorkspace?: boolean
}

export const registerGitNamedIpc = (
  ipcMain: IpcMain,
  dependencies: GitNamedIpcDependencies,
): void => {
  const rootFor = (event: IpcMainInvokeEvent): string => {
    const root = dependencies.workspaceRegistry.serviceForWebContents(event.sender).rootInfo()
    if (root.kind === 'single') throw new Error('Git is unavailable in single-file mode')
    return root.path
  }
  const git = dependencies.gitService
  const mutateWorkspace = async <T>(
    event: IpcMainInvokeEvent,
    work: (root: string) => Promise<T>,
    options: GitMutationOptions = {},
  ): Promise<T> => {
    const workspace = dependencies.workspaceRegistry.serviceForWebContents(event.sender)
    const initialRoot = workspace.rootInfo()
    if (initialRoot.kind === 'single') throw new Error('Git is unavailable in single-file mode')
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

  ipcMain.handle(nativeIpcChannels.gitDiscover, (event) => git.discover(rootFor(event)))
  ipcMain.handle(nativeIpcChannels.gitInit, (event) =>
    mutateWorkspace(event, (root) => git.init(root)),
  )
  ipcMain.handle(nativeIpcChannels.gitStatus, (event) => git.status(rootFor(event)))
  ipcMain.handle(nativeIpcChannels.gitRemoteStatus, (event) => git.remoteStatus(rootFor(event)))
  ipcMain.handle(nativeIpcChannels.gitFileDiff, async (event, payload: unknown) => {
    const input = diffSchema.parse(payload)
    return git.fileDiff(rootFor(event), input.path, input.section)
  })
  ipcMain.handle(nativeIpcChannels.gitCommitAll, async (event, payload: unknown) => {
    const input = commitSchema.parse(payload)
    return mutateWorkspace(event, (root) => git.commitAll(root, input.message), {
      flush: true,
      lockWorkspace: true,
    })
  })
  ipcMain.handle(nativeIpcChannels.gitRemoteSet, async (event, payload: unknown) => {
    const input = remoteSchema.parse(payload)
    return mutateWorkspace(event, (root) => git.setRemote(root, input.name, input.url))
  })
  ipcMain.handle(nativeIpcChannels.gitRemoteRemove, async (event, payload: unknown) => {
    const input = remoteNameSchema.parse(payload)
    return mutateWorkspace(event, (root) => git.removeRemote(root, input.name))
  })
  ipcMain.handle(nativeIpcChannels.gitFetch, async (event, payload: unknown) => {
    const input = optionalRemoteSchema.parse(payload ?? {})
    return mutateWorkspace(event, (root) => git.fetch(root, input.remote))
  })
  ipcMain.handle(nativeIpcChannels.gitPull, async (event) => {
    return mutateWorkspace(event, (root) => git.pull(root), {
      flush: true,
      invalidate: true,
      lockWorkspace: true,
    })
  })
  ipcMain.handle(nativeIpcChannels.gitPush, async (event, payload: unknown) => {
    const input = pushSchema.parse(payload ?? {})
    return mutateWorkspace(event, (root) => git.push(root, input))
  })
}

const canonicalRoot = (value: string): string => {
  const resolved = path.resolve(value).normalize('NFC')
  return process.platform === 'win32' || process.platform === 'darwin'
    ? resolved.toLowerCase()
    : resolved
}

const hasWorkspaceRoot = (root: FsRootInfo, expected: string): boolean =>
  root.kind !== 'single' && canonicalRoot(root.path) === canonicalRoot(expected)
