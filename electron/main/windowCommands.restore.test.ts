import { EventEmitter } from 'node:events'
import fs from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'
import type { BrowserWindow } from 'electron'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { createAppWindowCommands } from '@electron/main/windowCommands'
import { noopLogger } from '@electron/services/logger'
import type { WorkspaceService } from '@electron/services/workspace/workspaceService'
import type { MarklabWindowPool } from '@electron/windowPool'

vi.mock('electron', () => ({
  BrowserWindow: { fromWebContents: vi.fn(), getFocusedWindow: vi.fn() },
}))
vi.mock('@electron/windowMotion', () => ({ showWindowWithMotion: vi.fn() }))

describe('restoring saved workspace windows', () => {
  let directory: string

  beforeEach(async () => {
    directory = await fs.mkdtemp(path.join(os.tmpdir(), 'marklab-window-restore-'))
    await fs.writeFile(path.join(directory, 'Note.md'), '# Note')
  })
  afterEach(async () => fs.rm(directory, { recursive: true, force: true }))

  const harness = () => {
    const window = Object.assign(new EventEmitter(), {
      id: 2,
      isDestroyed: () => false,
      isMinimized: () => false,
      webContents: { isDestroyed: () => false, send: vi.fn() },
    }) as unknown as BrowserWindow
    const workspace = {
      beginRendererHydration: vi.fn(),
      markRendererInteractive: vi.fn(),
      setRoot: vi.fn(async (value: { path: string } | null) =>
        value ? { kind: 'external', path: value.path } : { kind: 'internal', path: directory },
      ),
      setSingleFile: vi.fn(async (value: { path: string }) => ({
        kind: 'single',
        path: value.path,
      })),
    }
    const pool = {
      acquireMainWindow: vi.fn(async () => ({
        window,
        source: 'pool',
        metrics: { preparationDurationMs: 0 },
      })),
      activateMainWindow: vi.fn(async () => undefined),
      waitForRendererInteractive: vi.fn(async () => undefined),
      prewarmMainWindow: vi.fn(async () => undefined),
      stats: vi.fn(),
    }
    const writeWorkspaceSession = vi.fn((_key: string, state: Record<string, unknown>) => ({
      state,
      version: 1,
    }))
    const activateWorkspaceWindowState = vi.fn()
    const commands = createAppWindowCommands({
      activateWorkspaceWindowState,
      copyWorkspaceSession: vi.fn(),
      getCurrentWorkspaceRoot: () => ({ kind: 'internal', path: directory }),
      getLogger: () => noopLogger,
      getNativeIpc: () => null,
      getPrimaryWindow: () => null,
      getSessionKeyForWindow: () => 'restored-window',
      getWorkspaceServiceForWindow: () => workspace as unknown as WorkspaceService,
      getWindowPool: () => pool as unknown as MarklabWindowPool,
      installManagedMainWindowLifecycle: vi.fn(),
      isPrimaryWindowBootstrapping: () => false,
      presentPrimaryWindow: vi.fn(),
      writeWorkspaceSession,
    })
    return {
      ...commands,
      activateWorkspaceWindowState,
      pool,
      window,
      workspace,
      writeWorkspaceSession,
    }
  }

  it.each(['internal', 'external', 'single'] as const)(
    'restores %s roots and saved file tabs through the existing opening flow',
    async (kind) => {
      const {
        activateWorkspaceWindowState,
        restoreWorkspaceWindow,
        window,
        workspace,
        writeWorkspaceSession,
      } = harness()
      const rootPath = kind === 'single' ? path.join(directory, 'Note.md') : directory
      const state = {
        rootKind: kind,
        rootPath,
        activeTabId: 'file:edit:Note.md',
        tabs: [{ kind: 'file', path: 'Note.md', view: 'edit' }],
      }

      await expect(restoreWorkspaceWindow({ state, version: 1 })).resolves.toMatchObject({
        ok: true,
        rootKind: kind,
      })
      expect(writeWorkspaceSession).toHaveBeenCalledWith('restored-window', state, false)
      expect(activateWorkspaceWindowState).toHaveBeenCalledWith(window, { kind, path: rootPath })
      expect(workspace.markRendererInteractive).toHaveBeenCalledOnce()
      if (kind === 'internal') expect(workspace.setRoot).toHaveBeenCalledWith(null)
    },
  )

  it('does not acquire a window or overwrite sessions when the saved path is missing', async () => {
    const { pool, restoreWorkspaceWindow, writeWorkspaceSession } = harness()

    await expect(
      restoreWorkspaceWindow({
        state: { rootKind: 'external', rootPath: path.join(directory, 'missing') },
      }),
    ).resolves.toMatchObject({ ok: false })
    expect(pool.acquireMainWindow).not.toHaveBeenCalled()
    expect(writeWorkspaceSession).not.toHaveBeenCalled()
  })
})
