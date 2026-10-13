import type * as Electron from 'electron'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { registerDialogIpc } from '@electron/ipc/dialogs'
import { nativeIpcChannels } from '@electron/channels'
import { createWorkspaceDirectory } from '@electron/ipc/createWorkspaceDirectory'
vi.mock('@electron/ipc/createWorkspaceDirectory', async (original) => ({
  ...(await original<typeof import('@electron/ipc/createWorkspaceDirectory')>()),
  createWorkspaceDirectory: vi.fn(),
}))
const showOpenDialog = vi.fn()
const frame = {}
const parent = { isDestroyed: vi.fn(() => false) }
const owner = vi.fn(() => parent)
const sender = { id: 1, mainFrame: frame, isDestroyed: vi.fn(() => false) }
const event = { sender, senderFrame: frame } as unknown as Electron.IpcMainInvokeEvent
let create: (
  event: Electron.IpcMainInvokeEvent,
  options: { name: string; title?: string },
) => Promise<string | null>
beforeEach(() => {
  vi.clearAllMocks()
  owner.mockReturnValue(parent)
  parent.isDestroyed.mockReturnValue(false)
  sender.isDestroyed.mockReturnValue(false)
  const handle = vi.fn((channel, handler) => {
    if (channel === nativeIpcChannels.dialogCreateWorkspace) create = handler
  })
  registerDialogIpc(
    { handle } as unknown as Electron.IpcMain,
    { showOpenDialog } as unknown as Electron.Dialog,
    { fromWebContents: owner } as unknown as typeof Electron.BrowserWindow,
  )
})
describe('create workspace native dialog', () => {
  it('does not create when the user cancels parent selection', async () => {
    showOpenDialog.mockResolvedValue({ canceled: true, filePaths: [] })
    await expect(create(event, { name: 'Notes' })).resolves.toBeNull()
    expect(createWorkspaceDirectory).not.toHaveBeenCalled()
  })
  it('passes only selected parent and validated name to exclusive creation', async () => {
    showOpenDialog.mockResolvedValue({ canceled: false, filePaths: ['/chosen'] })
    vi.mocked(createWorkspaceDirectory).mockResolvedValue('/chosen/Notes')
    await expect(create(event, { name: 'Notes', title: 'Choose parent' })).resolves.toBe(
      '/chosen/Notes',
    )
    expect(showOpenDialog).toHaveBeenCalledWith(parent, {
      title: 'Choose parent',
      properties: ['openDirectory'],
    })
    expect(createWorkspaceDirectory).toHaveBeenCalledWith('/chosen', 'Notes')
  })
  it('rejects unsafe names before showing the picker', async () => {
    await expect(create(event, { name: '../escape' })).rejects.toThrow()
    expect(showOpenDialog).not.toHaveBeenCalled()
  })
  it('rejects unowned and subframe requests before showing a picker', async () => {
    owner.mockReturnValue(null as never)
    await expect(create(event, { name: 'Notes' })).rejects.toThrow('active window')
    owner.mockReturnValue(parent)
    await expect(
      create({ ...event, senderFrame: {} } as Electron.IpcMainInvokeEvent, { name: 'Notes' }),
    ).rejects.toThrow('main workspace frame')
    expect(showOpenDialog).not.toHaveBeenCalled()
    expect(createWorkspaceDirectory).not.toHaveBeenCalled()
  })
  it('rejects a window closed during parent selection', async () => {
    showOpenDialog.mockImplementationOnce(async () => {
      parent.isDestroyed.mockReturnValue(true)
      return { canceled: false, filePaths: ['/chosen'] }
    })
    await expect(create(event, { name: 'Notes' })).rejects.toThrow('closed before creation')
    expect(createWorkspaceDirectory).not.toHaveBeenCalled()
  })
})
