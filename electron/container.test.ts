import fs from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'
import type * as Electron from 'electron'
import { asValue } from 'awilix'

import { afterEach, describe, expect, it, vi } from 'vitest'

import { createElectronContainer, shutdownElectronContainer } from '@electron/container'
import type { Logger } from '@electron/services/logger'

const logger = vi.hoisted(() => {
  const instance = {
    child: vi.fn(),
    debug: vi.fn(),
    error: vi.fn(),
    info: vi.fn(),
    warn: vi.fn(),
  }
  instance.child.mockReturnValue(instance)
  return instance
})

vi.mock('@electron/services/logger', () => ({
  createElectronLogger: () => logger,
  noopLogger: logger,
}))

const roots: string[] = []

afterEach(async () => {
  await Promise.all(roots.splice(0).map((root) => fs.rm(root, { force: true, recursive: true })))
})

describe('Electron dependency container', () => {
  it('owns one application-scoped instance for AI and local history services', async () => {
    const root = await fs.mkdtemp(path.join(os.tmpdir(), 'marklab-container-'))
    roots.push(root)
    const safeStorage = createSafeStorage()
    const container = createElectronContainer(createRuntimeDependencies(root, safeStorage))
    await container.cradle.lifecycleCoordinator.startup()

    expect(container.cradle.localHistoryService).toBe(container.cradle.localHistoryService)
    expect(container.cradle.aiProviderStore).toBe(container.cradle.aiProviderStore)
    expect(container.cradle.aiModelResolver).toBe(container.cradle.aiModelResolver)
    expect(container.cradle.aiService).toBe(container.cradle.aiService)
    expect(container.cradle.aiInlineCompletionService).toBe(
      container.cradle.aiInlineCompletionService,
    )
    expect(container.cradle.aiInlineCompletionPolicy).toBe(
      container.cradle.aiInlineCompletionPolicy,
    )
    expect(container.cradle.lifecycleCoordinator).toBe(container.cradle.lifecycleCoordinator)
    expect(container.cradle.languageIntelligenceService).toBe(
      container.cradle.languageIntelligenceService,
    )
    expect(container.cradle.linkPreviewService).toBe(container.cradle.linkPreviewService)
    expect(container.cradle.webTabManager).toBe(container.cradle.webTabManager)
    expect(safeStorage.isAsyncEncryptionAvailable).not.toHaveBeenCalled()

    await container.cradle.aiProviderStore.update({
      id: 'openai-main',
      label: 'OpenAI',
      kind: 'openai',
      model: 'gpt-5-mini',
      apiKey: 'secret',
    })

    expect(safeStorage.isAsyncEncryptionAvailable).toHaveBeenCalledOnce()
    expect(safeStorage.encryptStringAsync).toHaveBeenCalledWith('secret')
    await container.cradle.lifecycleCoordinator.shutdown()
  })

  it('disposes container-owned runtime resources', async () => {
    const root = await fs.mkdtemp(path.join(os.tmpdir(), 'marklab-container-dispose-'))
    roots.push(root)
    const container = createElectronContainer(createRuntimeDependencies(root, createSafeStorage()))
    await container.cradle.lifecycleCoordinator.startup()
    const terminalDispose = vi.spyOn(container.cradle.terminalService, 'dispose')
    const webTabDispose = vi.spyOn(container.cradle.webTabManager, 'dispose')

    await container.cradle.lifecycleCoordinator.shutdown()
    await container.dispose()

    expect(terminalDispose).toHaveBeenCalledOnce()
    expect(webTabDispose).toHaveBeenCalledOnce()
  })

  it('allows tests to inject a dependency before it is resolved', async () => {
    const root = await fs.mkdtemp(path.join(os.tmpdir(), 'marklab-container-injection-'))
    roots.push(root)
    const container = createElectronContainer(createRuntimeDependencies(root, createSafeStorage()))
    const injectedLogger = { ...logger, info: vi.fn() }

    container.register({ logger: asValue(injectedLogger) })

    expect(container.cradle.logger).toBe(injectedLogger)
    await container.dispose()
  })

  it('uses the lifecycle disposer when a test disposes the container directly', async () => {
    const root = await fs.mkdtemp(path.join(os.tmpdir(), 'marklab-container-lifecycle-'))
    roots.push(root)
    const container = createElectronContainer(createRuntimeDependencies(root, createSafeStorage()))
    const coordinator = container.cradle.lifecycleCoordinator
    await coordinator.startup()
    const shutdown = vi.spyOn(coordinator, 'shutdown')

    try {
      await container.dispose()
      expect(shutdown).toHaveBeenCalledOnce()
    } finally {
      await coordinator.shutdown()
    }
  })

  it('shuts down lifecycle resources before container-owned resources', async () => {
    const order: string[] = []
    const container = {
      cradle: {
        lifecycleCoordinator: {
          shutdown: vi.fn(async () => {
            order.push('lifecycle')
          }),
        },
      },
      dispose: vi.fn(async () => {
        order.push('container')
      }),
    }

    await shutdownElectronContainer(container)

    expect(order).toEqual(['lifecycle', 'container'])
  })

  it('still disposes container-owned resources when lifecycle shutdown fails', async () => {
    const failure = new Error('lifecycle failed')
    const container = {
      cradle: { lifecycleCoordinator: { shutdown: vi.fn(async () => Promise.reject(failure)) } },
      dispose: vi.fn(async () => undefined),
    }

    await expect(shutdownElectronContainer(container)).rejects.toThrow('lifecycle failed')
    expect(container.dispose).toHaveBeenCalledOnce()
  })
})

const createRuntimeDependencies = (
  userDataPath: string,
  safeStorage: ReturnType<typeof createSafeStorage>,
) => ({
  app: {
    getPath: vi.fn(() => userDataPath),
    isPackaged: false,
  } as unknown as Electron.App,
  BrowserWindow: { fromWebContents: vi.fn() } as unknown as typeof Electron.BrowserWindow,
  WebContentsView: vi.fn() as unknown as typeof Electron.WebContentsView,
  clipboard: {} as Electron.Clipboard,
  dialog: {} as Electron.Dialog,
  getLaunchInfo: vi.fn(() => ({ args: [], cwd: userDataPath, deepLinks: [] })),
  ipcMain: {} as Electron.IpcMain,
  safeStorage,
  shell: {} as Electron.Shell,
})

const createSafeStorage = () => ({
  getSelectedStorageBackend: vi.fn(() => 'unknown' as const),
  isAsyncEncryptionAvailable: vi.fn(async () => true),
  encryptStringAsync: vi.fn(async (value: string) => Buffer.from(`async:${value}`)),
  decryptStringAsync: vi.fn(async (value: Buffer) => ({
    result: value.toString('utf8').replace(/^async:/, ''),
    shouldReEncrypt: false,
  })),
  isEncryptionAvailable: vi.fn(() => true),
  encryptString: vi.fn((value: string) => Buffer.from(value)),
  decryptString: vi.fn((value: Buffer) => value.toString('utf8')),
  setUsePlainTextEncryption: vi.fn(),
})

void (logger satisfies Logger)
