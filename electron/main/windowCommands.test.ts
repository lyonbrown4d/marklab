import { EventEmitter } from 'node:events'
import fs from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'

import { BrowserWindow } from 'electron'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import { nativeIpcChannels } from '@electron/channels.js'
import { createAppWindowCommandHandlers } from '@electron/main/windowCommands.js'

vi.mock('electron', () => ({
  BrowserWindow: { fromWebContents: vi.fn(), getFocusedWindow: vi.fn() },
}))
vi.mock('@electron/windowMotion.js', () => ({ showWindowWithMotion: vi.fn() }))

const temporaryRoots: string[] = []

const createWindow = (id: number) => {
  const webContents = Object.assign(new EventEmitter(), {
    id: id * 10,
    isDestroyed: () => false,
    send: vi.fn(),
  })
  return Object.assign(new EventEmitter(), {
    id,
    webContents,
    isDestroyed: () => false,
    isMinimized: () => false,
  }) as unknown as BrowserWindow
}

const createHarness = () => {
  const source = createWindow(1)
  const target = createWindow(2)
  const order: string[] = []
  const workspace = {
    setRoot: vi.fn(async ({ path: rootPath }) => {
      order.push('workspace')
      return { kind: 'external' as const, path: rootPath }
    }),
    setSingleFile: vi.fn(),
  }
  const sourceWorkspace = {
    setRoot: vi.fn(),
    setSingleFile: vi.fn(),
  }
  const pool = {
    acquireMainWindow: vi.fn(async () => ({
      metrics: {
        constructorCallsAvoided: 1 as const,
        openingShellLoadsAvoided: 1 as const,
        preparationDurationMs: 4,
      },
      source: 'pool' as const,
      window: target,
    })),
    activateMainWindow: vi.fn(async () => {
      order.push('activate')
    }),
    prewarmMainWindow: vi.fn(async () => undefined),
    restoreOpeningWindow: vi.fn(async () => undefined),
    stats: vi.fn(() => ({ poolHits: 1 })),
  }
  const dependencies = {
    copyWorkspaceSession: vi.fn(() => ({ state: { tabs: [] }, version: 1 })),
    getCurrentWorkspaceRoot: vi.fn(() => ({ kind: 'external' as const, path: '/notes' })),
    getLogger: () => ({ debug: vi.fn(), error: vi.fn(), info: vi.fn(), warn: vi.fn() }),
    getNativeIpc: () => null,
    getPrimaryWindow: () => source,
    getSessionKeyForWindow: (window: BrowserWindow) => `session-${window.id}`,
    getWorkspaceServiceForWindow: (window: BrowserWindow) =>
      window === source ? sourceWorkspace : workspace,
    getWindowPool: () => pool,
    installManagedMainWindowLifecycle: vi.fn(),
    writeWorkspaceSession: vi.fn(() => ({ state: { tabs: [] }, version: 1 })),
  }
  vi.mocked(BrowserWindow.fromWebContents).mockReturnValue(source)
  vi.mocked(BrowserWindow.getFocusedWindow).mockReturnValue(source)
  const handlers = createAppWindowCommandHandlers(dependencies as never)
  const event = { sender: source.webContents } as never
  return {
    dependencies,
    event,
    handlers,
    order,
    pool,
    source,
    sourceWorkspace,
    target,
    workspace,
  }
}

beforeEach(() => vi.clearAllMocks())

afterEach(async () => {
  await Promise.all(
    temporaryRoots.splice(0).map((root) => fs.rm(root, { force: true, recursive: true })),
  )
})

describe('app window commands', () => {
  it('opens the current workspace in an isolated target session with staged progress', async () => {
    const { dependencies, event, handlers, order, pool, source, target } = createHarness()

    const result = await handlers.open_current_workspace_in_new_window(undefined, event)

    expect(result).toMatchObject({
      ok: true,
      sharedWorkspaceSession: false,
      startup: { source: 'pool', constructorCallsAvoided: 1 },
      windowId: 2,
    })
    expect(dependencies.copyWorkspaceSession).toHaveBeenCalledWith(
      'session-1',
      'session-2',
      expect.objectContaining({ rootPath: '/notes' }),
    )
    expect(source.webContents.send).not.toHaveBeenCalledWith(
      nativeIpcChannels.windowOpeningProgress,
      expect.anything(),
    )
    expect(target.webContents.send).toHaveBeenCalledWith(
      nativeIpcChannels.windowOpeningProgress,
      expect.objectContaining({ stage: 'loading', workspacePath: '/notes' }),
    )
    expect(target.webContents.send).toHaveBeenCalledWith(
      nativeIpcChannels.windowOpeningProgress,
      expect.objectContaining({ stage: 'indexing' }),
    )
    expect(order).toEqual(['workspace', 'activate'])
    expect(pool.prewarmMainWindow).toHaveBeenCalledOnce()
  })

  it('rejects an invalid path before acquiring a target window', async () => {
    const { event, handlers, pool } = createHarness()

    const result = await handlers.open_path_in_new_window({ path: '\0invalid' }, event)

    expect(result).toMatchObject({ ok: false, sharedWorkspaceSession: false })
    expect(pool.acquireMainWindow).not.toHaveBeenCalled()
  })

  it('opens a selected directory with an empty independent tab seed', async () => {
    const root = await fs.mkdtemp(path.join(os.tmpdir(), 'marklab-window-open-'))
    temporaryRoots.push(root)
    const { dependencies, event, handlers, sourceWorkspace, workspace } = createHarness()

    const result = await handlers.open_path_in_new_window({ path: root }, event)

    expect(result).toMatchObject({ ok: true, workspacePath: root })
    expect(dependencies.writeWorkspaceSession).toHaveBeenCalledWith('session-2', {
      activeTabId: null,
      rootKind: 'external',
      rootPath: root,
      tabs: [],
    })
    expect(workspace.setRoot).toHaveBeenCalledWith({ path: root })
    expect(sourceWorkspace.setRoot).not.toHaveBeenCalled()
    expect(sourceWorkspace.setSingleFile).not.toHaveBeenCalled()
  })

  it('keeps a failed target retryable and succeeds through its own renderer command', async () => {
    const { event, handlers, pool, target, workspace } = createHarness()
    workspace.setRoot.mockRejectedValueOnce(new Error('index unavailable'))

    const failed = await handlers.open_current_workspace_in_new_window(undefined, event)
    expect(failed).toMatchObject({ ok: false, error: 'index unavailable' })
    expect(target.webContents.send).toHaveBeenLastCalledWith(
      nativeIpcChannels.windowOpeningProgress,
      expect.objectContaining({ error: 'index unavailable', stage: 'failed' }),
    )

    vi.mocked(BrowserWindow.fromWebContents).mockReturnValue(target)
    const retried = await handlers.retry_window_open(undefined, {
      sender: target.webContents,
    } as never)

    expect(pool.restoreOpeningWindow).toHaveBeenCalledOnce()
    expect(retried).toMatchObject({ ok: true, windowId: 2 })
  })
})
