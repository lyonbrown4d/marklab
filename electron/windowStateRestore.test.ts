import { EventEmitter } from 'node:events'
import os from 'node:os'
import path from 'node:path'
import type { BrowserWindow } from 'electron'
import { describe, expect, it, vi } from 'vitest'
import {
  activatePersistedWorkspaceWindowState,
  activateWorkspaceWindowState,
  restoreMaximizedOnFirstShow,
} from '@electron/windowStateRestore'
import { installWindowStatePersistence } from '@electron/windowStatePersistence'
import { createWorkspaceStorageKey } from '@electron/services/workspace/workspaceIdentity'

const settings = vi.hoisted(() => ({
  getRendererPersistValue: vi.fn(),
  getWindowState: vi.fn(),
}))

vi.mock('electron', () => ({
  screen: {
    getAllDisplays: () => [{ workArea: { height: 1080, width: 1920, x: 0, y: 0 } }],
  },
}))
vi.mock('@electron/services/settingsStore', () => ({
  getRendererPersistValue: settings.getRendererPersistValue,
  getWindowState: settings.getWindowState,
}))

const notesRoot = {
  kind: 'external' as const,
  path: path.join(os.tmpdir(), 'marklab-window-state-restore', 'notes'),
}
const wikiRoot = {
  kind: 'external' as const,
  path: path.join(os.tmpdir(), 'marklab-window-state-restore', 'wiki'),
}

describe('restoreMaximizedOnFirstShow', () => {
  it('keeps prewarmed windows hidden until their first explicit show', () => {
    const window = Object.assign(new EventEmitter(), {
      isDestroyed: () => false,
      maximize: vi.fn(),
    })

    restoreMaximizedOnFirstShow(window as unknown as BrowserWindow, true)

    expect(window.maximize).not.toHaveBeenCalled()
    window.emit('show')
    window.emit('show')
    expect(window.maximize).toHaveBeenCalledOnce()
  })

  it('does not register restoration when the previous window was not maximized', () => {
    const window = Object.assign(new EventEmitter(), {
      isDestroyed: () => false,
      maximize: vi.fn(),
    })

    restoreMaximizedOnFirstShow(window as unknown as BrowserWindow, false)
    window.emit('show')

    expect(window.maximize).not.toHaveBeenCalled()
  })

  it('cancels a pending maximize when a later workspace is not maximized', () => {
    const window = Object.assign(new EventEmitter(), {
      isDestroyed: () => false,
      maximize: vi.fn(),
    })

    restoreMaximizedOnFirstShow(window as unknown as BrowserWindow, true)
    restoreMaximizedOnFirstShow(window as unknown as BrowserWindow, false)
    window.emit('show')

    expect(window.maximize).not.toHaveBeenCalled()
  })

  it('restores geometry from the workspace-specific state before first show', () => {
    const window = Object.assign(new EventEmitter(), {
      isDestroyed: () => false,
      isMaximized: () => false,
      isVisible: () => false,
      maximize: vi.fn(),
      setBounds: vi.fn(),
      unmaximize: vi.fn(),
    }) as unknown as BrowserWindow
    const writeState = vi.fn()
    settings.getWindowState.mockReturnValue({
      height: 900,
      isMaximized: true,
      width: 1440,
      x: 120,
      y: 80,
    })
    installWindowStatePersistence(window, writeState, 100, createWorkspaceStorageKey(notesRoot))

    activateWorkspaceWindowState(window, wikiRoot, { warn: vi.fn() })

    expect(writeState).toHaveBeenCalledWith(createWorkspaceStorageKey(notesRoot))
    expect(settings.getWindowState).toHaveBeenCalledWith(createWorkspaceStorageKey(wikiRoot))
    expect(window.setBounds).toHaveBeenCalledWith({
      height: 900,
      width: 1440,
      x: 120,
      y: 80,
    })
    expect(window.maximize).not.toHaveBeenCalled()
    window.emit('show')
    expect(window.maximize).toHaveBeenCalledOnce()
  })

  it('resolves the primary workspace before restoring its native window state', () => {
    const window = Object.assign(new EventEmitter(), {
      isDestroyed: () => false,
      isMaximized: () => false,
      isVisible: () => false,
      maximize: vi.fn(),
      setBounds: vi.fn(),
      unmaximize: vi.fn(),
    }) as unknown as BrowserWindow
    settings.getRendererPersistValue.mockReturnValue({
      state: { rootKind: wikiRoot.kind, rootPath: wikiRoot.path },
      version: 1,
    })
    settings.getWindowState.mockReturnValue({
      height: 800,
      isMaximized: false,
      width: 1200,
      x: 40,
      y: 60,
    })
    installWindowStatePersistence(window, vi.fn(), 100)

    activatePersistedWorkspaceWindowState(window, 'main', { warn: vi.fn() })

    expect(settings.getRendererPersistValue).toHaveBeenCalledWith('marklab.workspace', 'main')
    expect(settings.getWindowState).toHaveBeenCalledWith(createWorkspaceStorageKey(wikiRoot))
    expect(window.setBounds).toHaveBeenCalledWith({ height: 800, width: 1200, x: 40, y: 60 })
  })
})
