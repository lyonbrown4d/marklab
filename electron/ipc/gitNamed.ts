import type { IpcMain } from 'electron'
import { z } from 'zod'
import { createGitWorkspaceContext } from '@electron/ipc/gitWorkspaceContext'
import { gitScopeSchema, withGitScope } from '@electron/ipc/gitIpcScope'
import { registerGitOperationsIpc } from '@electron/ipc/gitOperations'

import { nativeIpcChannels } from '@electron/channels'
import type { GitService } from '@electron/services/git/service'
import type { WorkspaceSyncCoordinator } from '@electron/services/sync/core/coordinator'
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

export const registerGitNamedIpc = (
  ipcMain: IpcMain,
  dependencies: GitNamedIpcDependencies,
): void => {
  const { rootFor, mutateWorkspace } = createGitWorkspaceContext(dependencies)
  const git = dependencies.gitService
  registerGitOperationsIpc(ipcMain, { git, rootFor, mutateWorkspace })
  ipcMain.handle(nativeIpcChannels.gitDiscover, (event, payload: unknown) =>
    git.discover(rootFor(event, gitScopeSchema.parse(payload ?? {}).expectedRoot)),
  )
  ipcMain.handle(nativeIpcChannels.gitInit, (event, payload: unknown) =>
    mutateWorkspace(event, (root) => git.init(root), {
      expectedRoot: gitScopeSchema.parse(payload ?? {}).expectedRoot,
    }),
  )
  ipcMain.handle(nativeIpcChannels.gitStatus, (event, payload: unknown) =>
    git.status(rootFor(event, gitScopeSchema.parse(payload ?? {}).expectedRoot)),
  )
  ipcMain.handle(nativeIpcChannels.gitRemoteStatus, (event, payload: unknown) =>
    git.remoteStatus(rootFor(event, gitScopeSchema.parse(payload ?? {}).expectedRoot)),
  )
  ipcMain.handle(nativeIpcChannels.gitFileDiff, async (event, payload: unknown) => {
    const input = withGitScope(diffSchema).parse(payload)
    return git.fileDiff(rootFor(event, input.expectedRoot), input.path, input.section)
  })
  ipcMain.handle(nativeIpcChannels.gitCommitAll, async (event, payload: unknown) => {
    const input = withGitScope(commitSchema).parse(payload)
    return mutateWorkspace(event, (root) => git.commitAll(root, input.message), {
      expectedRoot: input.expectedRoot,
      flush: true,
      lockWorkspace: true,
    })
  })
  ipcMain.handle(nativeIpcChannels.gitRemoteSet, async (event, payload: unknown) => {
    const input = withGitScope(remoteSchema).parse(payload)
    return mutateWorkspace(event, (root) => git.setRemote(root, input.name, input.url), {
      expectedRoot: input.expectedRoot,
    })
  })
  ipcMain.handle(nativeIpcChannels.gitRemoteRemove, async (event, payload: unknown) => {
    const input = withGitScope(remoteNameSchema).parse(payload)
    return mutateWorkspace(event, (root) => git.removeRemote(root, input.name), {
      expectedRoot: input.expectedRoot,
    })
  })
  ipcMain.handle(nativeIpcChannels.gitFetch, async (event, payload: unknown) => {
    const input = withGitScope(optionalRemoteSchema).parse(payload ?? {})
    return mutateWorkspace(event, (root) => git.fetch(root, input.remote), {
      expectedRoot: input.expectedRoot,
    })
  })
  ipcMain.handle(nativeIpcChannels.gitPull, async (event, payload: unknown) => {
    const input = gitScopeSchema.parse(payload ?? {})
    return mutateWorkspace(event, (root) => git.pull(root), {
      expectedRoot: input.expectedRoot,
      flush: true,
      invalidate: true,
      lockWorkspace: true,
    })
  })
  ipcMain.handle(nativeIpcChannels.gitPush, async (event, payload: unknown) => {
    const input = withGitScope(pushSchema).parse(payload ?? {})
    return mutateWorkspace(
      event,
      (root) =>
        git.push(root, {
          ...(input.remote === undefined ? {} : { remote: input.remote }),
          ...(input.setUpstream === undefined ? {} : { setUpstream: input.setUpstream }),
        }),
      { expectedRoot: input.expectedRoot },
    )
  })
}
