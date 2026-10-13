import type { IpcMain, WebContents } from 'electron'
import { nativeIpcChannels } from '@electron/channels'
import { onRecentWorkspacesChanged } from '@electron/services/settingsStore'
import type { WindowWorkspaceRegistry } from '@electron/services/workspace/windowWorkspaceRegistry'

export const registerRecentWorkspaceWatchIpc = (
  ipcMain: Pick<IpcMain, 'handle' | 'on'>,
  registry: Pick<WindowWorkspaceRegistry, 'sessionKeyForWebContents'>,
): void => {
  const subscriptions = new Map<WebContents, Map<number, () => void>>()
  const remove = (sender: WebContents, id: number) => {
    const owned = subscriptions.get(sender)
    owned?.get(id)?.()
    owned?.delete(id)
  }
  ipcMain.handle(nativeIpcChannels.recentWorkspacesWatchStart, (event, id: unknown) => {
    registry.sessionKeyForWebContents(event.sender)
    if (event.senderFrame !== event.sender.mainFrame)
      throw new Error('Only the workspace main frame can watch history')
    if (typeof id !== 'number' || !Number.isSafeInteger(id) || id < 1)
      throw new Error('Invalid history watch subscription')
    const sender = event.sender
    if (sender.isDestroyed()) throw new Error('Workspace window is closed')
    let owned = subscriptions.get(sender)
    if (!owned) {
      owned = new Map()
      subscriptions.set(sender, owned)
      const release = () => {
        for (const stop of subscriptions.get(sender)?.values() ?? []) stop()
        subscriptions.delete(sender)
        sender.removeListener('did-start-navigation', navigation)
        sender.removeListener('destroyed', release)
      }
      const navigation = (
        _event: unknown,
        _url: string,
        _inPlace: boolean,
        isMainFrame: boolean,
      ) => {
        if (isMainFrame) release()
      }
      sender.once('destroyed', release)
      sender.on('did-start-navigation', navigation)
    }
    remove(sender, id)
    owned.set(
      id,
      onRecentWorkspacesChanged(() => {
        if (!sender.isDestroyed()) sender.send(nativeIpcChannels.recentWorkspacesChanged)
      }),
    )
    return { ok: true }
  })
  ipcMain.on(nativeIpcChannels.recentWorkspacesWatchStop, (event, id: unknown) => {
    if (typeof id === 'number' && Number.isSafeInteger(id)) remove(event.sender, id)
  })
}
