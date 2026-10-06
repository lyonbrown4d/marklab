import type { Clipboard, IpcMain, IpcMainInvokeEvent, Shell } from 'electron'

import { nativeIpcChannels } from '@electron/channels'
import type { WindowWorkspaceRegistry } from '@electron/services/workspace/windowWorkspaceRegistry'

type WorkspaceNamedIpcDependencies = {
  clipboard: Pick<Clipboard, 'writeText'>
  shell: Pick<Shell, 'showItemInFolder'>
  workspaceRegistry: WindowWorkspaceRegistry
}

const workspacePath = (value: unknown): string => {
  if (!value || typeof value !== 'object' || !('path' in value)) {
    throw new Error('path must be provided')
  }
  const path = (value as Record<string, unknown>).path
  if (typeof path !== 'string') throw new Error('path must be a string')
  return path
}

export const registerWorkspaceNamedIpc = (
  ipcMain: IpcMain,
  dependencies: WorkspaceNamedIpcDependencies,
): void => {
  const workspaceFor = (event: IpcMainInvokeEvent) =>
    dependencies.workspaceRegistry.serviceForWebContents(event.sender)

  ipcMain.handle(nativeIpcChannels.assetsIssueCapability, (event, request: unknown) =>
    workspaceFor(event).issueAssetCapability(request),
  )
  ipcMain.handle(nativeIpcChannels.assetsReadBytes, (event, request: unknown) =>
    workspaceFor(event).readAssetBytes(request),
  )
  ipcMain.handle(nativeIpcChannels.workspaceReadTextPreview, (event, request: unknown) =>
    workspaceFor(event).readTextPreview(request),
  )
  ipcMain.handle(nativeIpcChannels.workspaceOpenPathInSystem, async (event, request: unknown) => {
    await workspaceFor(event).openPathInSystem({ path: workspacePath(request) })
    return { ok: true } as const
  })
  ipcMain.handle(nativeIpcChannels.workspaceRevealPathInSystem, (event, request: unknown) => {
    const absolutePath = workspaceFor(event).resolveCoordinatorPath(workspacePath(request))
    dependencies.shell.showItemInFolder(absolutePath)
    return { ok: true } as const
  })
  ipcMain.handle(nativeIpcChannels.workspaceCopyAbsolutePath, (event, request: unknown) => {
    const absolutePath = workspaceFor(event).resolveCoordinatorPath(workspacePath(request))
    dependencies.clipboard.writeText(absolutePath)
    return { ok: true } as const
  })
}
