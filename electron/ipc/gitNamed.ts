import type { IpcMain, IpcMainInvokeEvent } from 'electron'
import { z } from 'zod'

import { nativeIpcChannels } from '@electron/channels.js'
import type { GitService } from '@electron/services/git/service.js'
import type { WindowWorkspaceRegistry } from '@electron/services/workspace/windowWorkspaceRegistry.js'

type GitNamedIpcDependencies = {
  gitService: GitService
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
  const rootFor = (event: IpcMainInvokeEvent): string => {
    const root = dependencies.workspaceRegistry.serviceForWebContents(event.sender).rootInfo()
    if (root.kind === 'single') throw new Error('Git is unavailable in single-file mode')
    return root.path
  }
  const git = dependencies.gitService

  ipcMain.handle(nativeIpcChannels.gitDiscover, (event) => git.discover(rootFor(event)))
  ipcMain.handle(nativeIpcChannels.gitInit, (event) => git.init(rootFor(event)))
  ipcMain.handle(nativeIpcChannels.gitStatus, (event) => git.status(rootFor(event)))
  ipcMain.handle(nativeIpcChannels.gitRemoteStatus, (event) => git.remoteStatus(rootFor(event)))
  ipcMain.handle(nativeIpcChannels.gitFileDiff, async (event, payload: unknown) => {
    const input = diffSchema.parse(payload)
    return git.fileDiff(rootFor(event), input.path, input.section)
  })
  ipcMain.handle(nativeIpcChannels.gitCommitAll, async (event, payload: unknown) => {
    const input = commitSchema.parse(payload)
    const workspace = dependencies.workspaceRegistry.serviceForWebContents(event.sender)
    const root = workspace.rootInfo()
    if (root.kind === 'single') throw new Error('Git is unavailable in single-file mode')
    await workspace.flushBuffers()
    return workspace.runExternalWorkspaceMutation(() => git.commitAll(root.path, input.message))
  })
  ipcMain.handle(nativeIpcChannels.gitRemoteSet, async (event, payload: unknown) => {
    const input = remoteSchema.parse(payload)
    return git.setRemote(rootFor(event), input.name, input.url)
  })
  ipcMain.handle(nativeIpcChannels.gitRemoteRemove, async (event, payload: unknown) => {
    const input = remoteNameSchema.parse(payload)
    return git.removeRemote(rootFor(event), input.name)
  })
  ipcMain.handle(nativeIpcChannels.gitFetch, async (event, payload: unknown) => {
    const input = optionalRemoteSchema.parse(payload ?? {})
    return git.fetch(rootFor(event), input.remote)
  })
  ipcMain.handle(nativeIpcChannels.gitPull, async (event) => {
    const workspace = dependencies.workspaceRegistry.serviceForWebContents(event.sender)
    const root = workspace.rootInfo()
    if (root.kind === 'single') throw new Error('Git is unavailable in single-file mode')
    await workspace.flushBuffers()
    try {
      return await workspace.runExternalWorkspaceMutation(() => git.pull(root.path))
    } finally {
      workspace.invalidateAllExternalPaths()
    }
  })
  ipcMain.handle(nativeIpcChannels.gitPush, async (event, payload: unknown) => {
    const input = pushSchema.parse(payload ?? {})
    return git.push(rootFor(event), input)
  })
}
