import { EventEmitter } from 'node:events'
import fs from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'
import { BrowserWindow } from 'electron'
import { afterEach, describe, expect, it, vi } from 'vitest'
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

const deferred = <T>() => {
  let resolve!: (value: T) => void
  const promise = new Promise<T>((complete) => {
    resolve = complete
  })
  return { promise, resolve }
}

const createWindow = () =>
  Object.assign(new EventEmitter(), {
    id: 1,
    isDestroyed: () => false,
    isMinimized: () => false,
    webContents: { isDestroyed: () => false, send: vi.fn() },
  }) as unknown as BrowserWindow

const createDependencies = (window: BrowserWindow, setRoot: ReturnType<typeof vi.fn>) =>
  ({
    activateWorkspaceWindowState: vi.fn(),
    getNativeIpc: () => ({ windowClose: { requestRendererFlush: vi.fn() } }),
    getPrimaryWindow: () => window,
    getSessionKeyForWindow: () => 'main',
    getWorkspaceServiceForWindow: () => ({ setRoot }),
    isPrimaryWindowBootstrapping: () => true,
    presentPrimaryWindow: vi.fn(),
    writeWorkspaceSession: vi.fn(() => ({ state: { tabs: [] }, version: 1 })),
  }) as unknown as AppWindowCommandDependencies

afterEach(async () => {
  vi.restoreAllMocks()
  await Promise.all(
    temporaryRoots.splice(0).map((root) => fs.rm(root, { force: true, recursive: true })),
  )
})

describe('startup workspace target cancellation', () => {
  it('does not mutate workspace state when path resolution completes after abort', async () => {
    const root = await fs.mkdtemp(path.join(os.tmpdir(), 'marklab-startup-abort-stat-'))
    temporaryRoots.push(root)
    const actualStat = await fs.stat(root)
    const stat = deferred<Awaited<ReturnType<typeof fs.stat>>>()
    vi.spyOn(fs, 'stat').mockReturnValueOnce(stat.promise)
    const setRoot = vi.fn()
    const window = createWindow()
    const dependencies = createDependencies(window, setRoot)
    const controller = new AbortController()

    const opening = openStartupPathInCurrentWindow(
      dependencies,
      { path: root },
      {
        signal: controller.signal,
      },
    )
    await vi.waitFor(() => expect(fs.stat).toHaveBeenCalledOnce())
    controller.abort()
    stat.resolve(actualStat)

    await expect(opening).resolves.toMatchObject({ ok: false })
    expect(setRoot).not.toHaveBeenCalled()
    expect(dependencies.activateWorkspaceWindowState).not.toHaveBeenCalled()
    expect(dependencies.writeWorkspaceSession).not.toHaveBeenCalled()
    expect(dependencies.presentPrimaryWindow).not.toHaveBeenCalled()
    expect(showWindowWithMotion).not.toHaveBeenCalled()
  })

  it('does not activate, seed, or present when a workspace switch resolves after abort', async () => {
    const root = await fs.mkdtemp(path.join(os.tmpdir(), 'marklab-startup-abort-root-'))
    temporaryRoots.push(root)
    const switched = deferred<{ kind: 'external'; path: string }>()
    const setRoot = vi.fn(() => switched.promise)
    const window = createWindow()
    const dependencies = createDependencies(window, setRoot)
    const controller = new AbortController()

    const opening = openStartupPathInCurrentWindow(
      dependencies,
      { path: root },
      {
        signal: controller.signal,
      },
    )
    await vi.waitFor(() => expect(setRoot).toHaveBeenCalledOnce())
    controller.abort()
    switched.resolve({ kind: 'external', path: root })

    await expect(opening).resolves.toMatchObject({ ok: false })
    expect(dependencies.activateWorkspaceWindowState).not.toHaveBeenCalled()
    expect(dependencies.writeWorkspaceSession).not.toHaveBeenCalled()
    expect(window.webContents.send).not.toHaveBeenCalled()
    expect(dependencies.presentPrimaryWindow).not.toHaveBeenCalled()
  })
})
