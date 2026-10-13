import type { IpcMain, IpcMainInvokeEvent } from 'electron'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { nativeIpcChannels } from '@electron/channels'
import { registerSettingsIpc } from '@electron/ipc/settings'
import {
  getRendererPersistValue,
  listRecentWorkspaces,
  removeRecentWorkspace,
  removeRendererPersistValue,
  setRendererPersistValue,
} from '@electron/services/settingsStore'
import type { WindowWorkspaceRegistry } from '@electron/services/workspace/windowWorkspaceRegistry'

vi.mock('@electron/services/settingsStore', () => ({
  getRendererPersistValue: vi.fn(),
  setRendererPersistValue: vi.fn(),
  removeRendererPersistValue: vi.fn(),
  listRecentWorkspaces: vi.fn(),
  removeRecentWorkspace: vi.fn(),
}))

const harness = () => {
  const handlers = new Map<string, (event: IpcMainInvokeEvent, ...args: unknown[]) => unknown>()
  const ipc = {
    handle: vi.fn((channel, handler) => handlers.set(channel, handler)),
    on: vi.fn(),
  } as unknown as IpcMain
  const sessionKeyForWebContents = vi.fn(() => 'window-session')
  registerSettingsIpc(ipc, { sessionKeyForWebContents } as unknown as WindowWorkspaceRegistry)
  const event = { sender: { id: 1 } } as IpcMainInvokeEvent
  return {
    invoke: (channel: string, ...args: unknown[]) => handlers.get(channel)!(event, ...args),
    sessionKeyForWebContents,
    event,
  }
}

describe('settings and recent workspace IPC', () => {
  beforeEach(() => vi.resetAllMocks())
  it('lists only persisted history and verifies the calling workspace window', async () => {
    const { event, invoke, sessionKeyForWebContents } = harness()
    const entries = [{ path: '/notes', status: 'available' }]
    vi.mocked(listRecentWorkspaces).mockResolvedValue(
      entries as Awaited<ReturnType<typeof listRecentWorkspaces>>,
    )
    expect(await invoke(nativeIpcChannels.recentWorkspacesList)).toEqual(entries)
    expect(sessionKeyForWebContents).toHaveBeenCalledWith(event.sender)
    expect(listRecentWorkspaces).toHaveBeenCalledWith()
  })
  it.each([null, 42, {}, '', '  ', '/notes\0'])('rejects malformed removal path %j', (path) => {
    const { invoke } = harness()
    expect(invoke(nativeIpcChannels.recentWorkspacesRemove, path)).toEqual({
      ok: false,
      error: 'Invalid recent workspace path',
    })
    expect(removeRecentWorkspace).not.toHaveBeenCalled()
  })
  it('removes a known path and returns failures without altering any renderer session', () => {
    const { invoke } = harness()
    expect(invoke(nativeIpcChannels.recentWorkspacesRemove, '/notes')).toEqual({ ok: true })
    expect(removeRecentWorkspace).toHaveBeenCalledWith('/notes')
    vi.mocked(removeRecentWorkspace).mockImplementationOnce(() => {
      throw new Error('database busy')
    })
    expect(invoke(nativeIpcChannels.recentWorkspacesRemove, '/notes')).toEqual({
      ok: false,
      error: 'database busy',
    })
    expect(removeRendererPersistValue).not.toHaveBeenCalled()
    expect(setRendererPersistValue).not.toHaveBeenCalled()
  })
  it('does not expose history operations to an unregistered sender', () => {
    const { invoke, sessionKeyForWebContents } = harness()
    sessionKeyForWebContents.mockImplementation(() => {
      throw new Error('unknown window')
    })
    expect(() => invoke(nativeIpcChannels.recentWorkspacesList)).toThrow('unknown window')
    expect(invoke(nativeIpcChannels.recentWorkspacesRemove, '/notes')).toMatchObject({ ok: false })
    expect(listRecentWorkspaces).not.toHaveBeenCalled()
    expect(removeRecentWorkspace).not.toHaveBeenCalled()
  })
  it('keeps existing renderer persistence scoped to the window session', () => {
    const { invoke } = harness()
    const value = { state: { rootPath: '/notes' } }
    invoke(nativeIpcChannels.settingsPersistGet, 'marklab.workspace')
    expect(getRendererPersistValue).toHaveBeenCalledWith('marklab.workspace', 'window-session')
    expect(invoke(nativeIpcChannels.settingsPersistSet, 'marklab.workspace', value)).toEqual({
      ok: true,
    })
    expect(setRendererPersistValue).toHaveBeenCalledWith(
      'marklab.workspace',
      value,
      'window-session',
    )
    expect(invoke(nativeIpcChannels.settingsPersistRemove, 'marklab.workspace')).toEqual({
      ok: true,
    })
    expect(removeRendererPersistValue).toHaveBeenCalledWith('marklab.workspace', 'window-session')
  })
})
