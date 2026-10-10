import { EventEmitter } from 'node:events'
import fs from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'

import { BrowserWindow } from 'electron'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import {
  openStartupPathInCurrentWindow,
  type AppWindowCommandDependencies,
} from '@electron/main/windowCommands'
import { showWindowWithMotion } from '@electron/windowMotion'

vi.mock('electron', () => ({
  BrowserWindow: { fromWebContents: vi.fn(), getFocusedWindow: vi.fn(() => null) },
}))
vi.mock('@electron/windowMotion', () => ({ showWindowWithMotion: vi.fn() }))

const temporaryRoots: string[] = []

const createWindow = (id: number, isVisible: () => boolean) =>
  Object.assign(new EventEmitter(), {
    id,
    isDestroyed: () => false,
    isMinimized: () => false,
    isVisible,
    webContents: { isDestroyed: () => false, send: vi.fn() },
  }) as unknown as BrowserWindow

beforeEach(() => vi.clearAllMocks())

afterEach(async () => {
  await Promise.all(
    temporaryRoots.splice(0).map((root) => fs.rm(root, { force: true, recursive: true })),
  )
})

describe('startup workspace target', () => {
  it('replaces the restored primary workspace without flushing renderer edits', async () => {
    const root = await fs.mkdtemp(path.join(os.tmpdir(), 'marklab-native-startup-open-'))
    temporaryRoots.push(root)
    const window = createWindow(1, () => false)
    const requestRendererFlush = vi.fn()
    const setRoot = vi.fn(async ({ path: rootPath }) => ({
      kind: 'external' as const,
      path: rootPath,
    }))
    const activateWorkspaceWindowState = vi.fn()
    const presentPrimaryWindow = vi.fn()
    const dependencies = {
      activateWorkspaceWindowState,
      getNativeIpc: () => ({ windowClose: { requestRendererFlush } }),
      getPrimaryWindow: () => window,
      isPrimaryWindowBootstrapping: () => true,
      presentPrimaryWindow,
      getSessionKeyForWindow: () => 'main',
      getWorkspaceServiceForWindow: () => ({ setRoot }),
      writeWorkspaceSession: vi.fn(() => ({ state: { tabs: [] }, version: 1 })),
    } as unknown as AppWindowCommandDependencies

    const result = await openStartupPathInCurrentWindow(dependencies, { path: root })

    expect(result).toMatchObject({ ok: true, rootKind: 'external', workspacePath: root })
    expect(setRoot).toHaveBeenCalledWith({ path: root })
    expect(activateWorkspaceWindowState).toHaveBeenCalledWith(window, {
      kind: 'external',
      path: root,
    })
    expect(requestRendererFlush).not.toHaveBeenCalled()
    expect(presentPrimaryWindow).toHaveBeenCalledWith(window)
    expect(showWindowWithMotion).not.toHaveBeenCalledWith(window, expect.anything())
  })

  it('always applies the startup target to the captured primary window', async () => {
    const root = await fs.mkdtemp(path.join(os.tmpdir(), 'marklab-native-startup-primary-'))
    temporaryRoots.push(root)
    const primary = createWindow(1, () => false)
    const focused = createWindow(2, () => true)
    vi.mocked(BrowserWindow.getFocusedWindow).mockReturnValue(focused)
    const primarySetRoot = vi.fn(async ({ path: rootPath }) => ({
      kind: 'external' as const,
      path: rootPath,
    }))
    const focusedSetRoot = vi.fn()
    const dependencies = {
      activateWorkspaceWindowState: vi.fn(),
      getNativeIpc: () => ({ windowClose: { requestRendererFlush: vi.fn() } }),
      getPrimaryWindow: () => primary,
      isPrimaryWindowBootstrapping: () => true,
      presentPrimaryWindow: vi.fn(),
      getSessionKeyForWindow: () => 'main',
      getWorkspaceServiceForWindow: (window: BrowserWindow) => ({
        setRoot: window === primary ? primarySetRoot : focusedSetRoot,
      }),
      writeWorkspaceSession: vi.fn(() => ({ state: { tabs: [] }, version: 1 })),
    } as unknown as AppWindowCommandDependencies

    const result = await openStartupPathInCurrentWindow(dependencies, { path: root })

    expect(result).toMatchObject({ ok: true, windowId: primary.id })
    expect(primarySetRoot).toHaveBeenCalledWith({ path: root })
    expect(focusedSetRoot).not.toHaveBeenCalled()
  })

  it('flushes renderer edits when path resolution outlives the hidden bootstrap phase', async () => {
    const root = await fs.mkdtemp(path.join(os.tmpdir(), 'marklab-native-startup-delayed-'))
    temporaryRoots.push(root)
    let bootstrapping = true
    const window = createWindow(1, () => false)
    let finishStat: ((value: Awaited<ReturnType<typeof fs.stat>>) => void) | undefined
    const delayedStat = new Promise<Awaited<ReturnType<typeof fs.stat>>>((resolve) => {
      finishStat = resolve
    })
    const actualStat = await fs.stat(root)
    const stat = vi.spyOn(fs, 'stat').mockReturnValueOnce(delayedStat)
    const requestRendererFlush = vi.fn(async () => undefined)
    const dependencies = {
      activateWorkspaceWindowState: vi.fn(),
      getNativeIpc: () => ({ windowClose: { requestRendererFlush } }),
      getPrimaryWindow: () => window,
      isPrimaryWindowBootstrapping: () => bootstrapping,
      presentPrimaryWindow: vi.fn(),
      getSessionKeyForWindow: () => 'main',
      getWorkspaceServiceForWindow: () => ({
        setRoot: vi.fn(async ({ path: rootPath }) => ({ kind: 'external', path: rootPath })),
      }),
      writeWorkspaceSession: vi.fn(() => ({ state: { tabs: [] }, version: 1 })),
    } as unknown as AppWindowCommandDependencies

    const opening = openStartupPathInCurrentWindow(dependencies, { path: root })
    await vi.waitFor(() => expect(stat).toHaveBeenCalledOnce())
    bootstrapping = false
    finishStat?.(actualStat)
    await opening

    expect(requestRendererFlush).toHaveBeenCalledWith(window)
  })

  it('flushes a hidden primary after its explicit bootstrap lifecycle has ended', async () => {
    const root = await fs.mkdtemp(path.join(os.tmpdir(), 'marklab-native-startup-hidden-'))
    temporaryRoots.push(root)
    const window = createWindow(1, () => false)
    const requestRendererFlush = vi.fn(async () => undefined)
    const dependencies = {
      activateWorkspaceWindowState: vi.fn(),
      getNativeIpc: () => ({ windowClose: { requestRendererFlush } }),
      getPrimaryWindow: () => window,
      isPrimaryWindowBootstrapping: () => false,
      presentPrimaryWindow: vi.fn(),
      getSessionKeyForWindow: () => 'main',
      getWorkspaceServiceForWindow: () => ({
        setRoot: vi.fn(async ({ path: rootPath }) => ({ kind: 'external', path: rootPath })),
      }),
      writeWorkspaceSession: vi.fn(() => ({ state: { tabs: [] }, version: 1 })),
    } as unknown as AppWindowCommandDependencies

    await openStartupPathInCurrentWindow(dependencies, { path: root })

    expect(requestRendererFlush).toHaveBeenCalledWith(window)
  })

  it('allows the hidden bootstrap flush bypass only once per primary window', async () => {
    const firstRoot = await fs.mkdtemp(path.join(os.tmpdir(), 'marklab-native-startup-first-'))
    const secondRoot = await fs.mkdtemp(path.join(os.tmpdir(), 'marklab-native-startup-second-'))
    temporaryRoots.push(firstRoot, secondRoot)
    const window = createWindow(1, () => false)
    const requestRendererFlush = vi.fn(async () => undefined)
    const dependencies = {
      activateWorkspaceWindowState: vi.fn(),
      getNativeIpc: () => ({ windowClose: { requestRendererFlush } }),
      getPrimaryWindow: () => window,
      isPrimaryWindowBootstrapping: () => true,
      presentPrimaryWindow: vi.fn(),
      getSessionKeyForWindow: () => 'main',
      getWorkspaceServiceForWindow: () => ({
        setRoot: vi.fn(async ({ path: rootPath }) => ({ kind: 'external', path: rootPath })),
      }),
      writeWorkspaceSession: vi.fn(() => ({ state: { tabs: [] }, version: 1 })),
    } as unknown as AppWindowCommandDependencies

    await openStartupPathInCurrentWindow(dependencies, { path: firstRoot })
    await openStartupPathInCurrentWindow(dependencies, { path: secondRoot })

    expect(requestRendererFlush).toHaveBeenCalledOnce()
    expect(requestRendererFlush).toHaveBeenCalledWith(window)
  })

  it('does not consume the bypass when path validation fails', async () => {
    const root = await fs.mkdtemp(path.join(os.tmpdir(), 'marklab-native-startup-valid-'))
    temporaryRoots.push(root)
    const window = createWindow(1, () => false)
    const requestRendererFlush = vi.fn(async () => undefined)
    const dependencies = {
      activateWorkspaceWindowState: vi.fn(),
      getNativeIpc: () => ({ windowClose: { requestRendererFlush } }),
      getPrimaryWindow: () => window,
      isPrimaryWindowBootstrapping: () => true,
      presentPrimaryWindow: vi.fn(),
      getSessionKeyForWindow: () => 'main',
      getWorkspaceServiceForWindow: () => ({
        setRoot: vi.fn(async ({ path: rootPath }) => ({ kind: 'external', path: rootPath })),
      }),
      writeWorkspaceSession: vi.fn(() => ({ state: { tabs: [] }, version: 1 })),
    } as unknown as AppWindowCommandDependencies

    await expect(
      openStartupPathInCurrentWindow(dependencies, { path: path.join(root, 'missing.md') }),
    ).resolves.toMatchObject({ ok: false })
    await openStartupPathInCurrentWindow(dependencies, { path: root })

    expect(requestRendererFlush).not.toHaveBeenCalled()
  })

  it('does not consume the bypass after the bootstrap lifecycle has expired', async () => {
    const firstRoot = await fs.mkdtemp(path.join(os.tmpdir(), 'marklab-native-startup-expired-'))
    const secondRoot = await fs.mkdtemp(path.join(os.tmpdir(), 'marklab-native-startup-retry-'))
    temporaryRoots.push(firstRoot, secondRoot)
    let bootstrapping = false
    const window = createWindow(1, () => false)
    const requestRendererFlush = vi.fn(async () => undefined)
    const dependencies = {
      activateWorkspaceWindowState: vi.fn(),
      getNativeIpc: () => ({ windowClose: { requestRendererFlush } }),
      getPrimaryWindow: () => window,
      isPrimaryWindowBootstrapping: () => bootstrapping,
      presentPrimaryWindow: vi.fn(),
      getSessionKeyForWindow: () => 'main',
      getWorkspaceServiceForWindow: () => ({
        setRoot: vi.fn(async ({ path: rootPath }) => ({ kind: 'external', path: rootPath })),
      }),
      writeWorkspaceSession: vi.fn(() => ({ state: { tabs: [] }, version: 1 })),
    } as unknown as AppWindowCommandDependencies

    await openStartupPathInCurrentWindow(dependencies, { path: firstRoot })
    bootstrapping = true
    await openStartupPathInCurrentWindow(dependencies, { path: secondRoot })

    expect(requestRendererFlush).toHaveBeenCalledOnce()
    expect(requestRendererFlush).toHaveBeenCalledWith(window)
  })
})
