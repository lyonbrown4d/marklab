import fs from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'
import type * as Electron from 'electron'

import { afterEach, describe, expect, it, vi } from 'vitest'

import { createElectronRuntime } from '@electron/container'
import { TOKENS } from '@electron/di/tokens'
import type { LifecycleCoordinator } from '@electron/main/lifecycle/lifecycleCoordinator'
import type { Logger } from '@electron/services/logger'
import type { TerminalService } from '@electron/services/terminal/service'
import type { WebTabManager } from '@electron/services/webTabs/webTabManager'

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

describe('Electron dependency runtime', () => {
  it('binds every unique typed service token', async () => {
    const runtime = await createRuntime('tokens')

    expect(new Set(Object.values(TOKENS)).size).toBe(Object.keys(TOKENS).length)
    expect(runtime.services.logger).toBeDefined()

    await runtime.shutdown()
  })

  it('owns one application-scoped instance for resolved services', async () => {
    const runtime = await createRuntime('singletons')

    expect(runtime.services.languageIntelligenceService).toBe(
      runtime.services.languageIntelligenceService,
    )
    expect(runtime.services.webTabManager).toBe(runtime.services.webTabManager)

    await runtime.shutdown()
  })

  it('allows a typed dependency override before services are resolved', async () => {
    const root = await createRoot('override')
    const injectedLogger = { ...logger, info: vi.fn() }
    const runtime = createElectronRuntime(createRuntimeDependencies(root, createSafeStorage()), {
      configure: (overrides) => {
        overrides.set(TOKENS.lifecycleCoordinator, createNoopLifecycleCoordinator())
        overrides.set(TOKENS.logger, injectedLogger)
      },
    })

    expect(runtime.services.logger).toBe(injectedLogger)
    await runtime.shutdown()
  })

  it('shuts down lifecycle resources before container-owned resources', async () => {
    const root = await createRoot('release-order')
    const order: string[] = []
    const lifecycleCoordinator = {
      shutdown: vi.fn(async () => {
        order.push('lifecycle')
      }),
      startup: vi.fn(async () => undefined),
    } as unknown as LifecycleCoordinator
    const terminalService = {
      dispose: vi.fn(async () => {
        order.push('terminal')
      }),
    } as unknown as TerminalService
    const webTabManager = {
      dispose: vi.fn(() => {
        order.push('web-tabs')
      }),
    } as unknown as WebTabManager
    const runtime = createElectronRuntime(createRuntimeDependencies(root, createSafeStorage()), {
      configure: (overrides) => {
        overrides.set(TOKENS.lifecycleCoordinator, lifecycleCoordinator)
        overrides.set(TOKENS.terminalService, terminalService)
        overrides.set(TOKENS.webTabManager, webTabManager)
      },
    })
    void runtime.services.terminalService
    void runtime.services.webTabManager

    await runtime.shutdown()

    expect(order[0]).toBe('lifecycle')
    expect(order.slice(1).sort()).toEqual(['terminal', 'web-tabs'])
    expect(lifecycleCoordinator.shutdown).toHaveBeenCalledOnce()
  })

  it('clears a failed shutdown so a later window lifecycle attempt can retry', async () => {
    const root = await createRoot('shutdown-retry')
    const failure = new Error('lifecycle busy')
    const shutdown = vi
      .fn<() => Promise<void>>()
      .mockRejectedValueOnce(failure)
      .mockResolvedValueOnce(undefined)
    const runtime = createElectronRuntime(createRuntimeDependencies(root, createSafeStorage()), {
      configure: (overrides) => {
        overrides.set(TOKENS.lifecycleCoordinator, {
          shutdown,
          startup: vi.fn(async () => undefined),
        } as unknown as LifecycleCoordinator)
      },
    })

    await expect(runtime.shutdown()).rejects.toBe(failure)
    await expect(runtime.shutdown()).resolves.toBeUndefined()

    expect(shutdown).toHaveBeenCalledTimes(2)
  })

  it('attempts every owned disposer and aggregates their failures', async () => {
    const root = await createRoot('owned-failure-aggregation')
    const terminalFailure = new Error('terminal failed')
    const webTabFailure = new Error('web tabs failed')
    const terminalDispose = vi
      .fn<() => Promise<void>>()
      .mockRejectedValueOnce(terminalFailure)
      .mockResolvedValueOnce(undefined)
    const webTabDispose = vi
      .fn<() => Promise<void>>()
      .mockRejectedValueOnce(webTabFailure)
      .mockResolvedValueOnce(undefined)
    const runtime = createElectronRuntime(createRuntimeDependencies(root, createSafeStorage()), {
      configure: (overrides) => {
        overrides.set(TOKENS.lifecycleCoordinator, createNoopLifecycleCoordinator())
        overrides.set(TOKENS.terminalService, {
          dispose: terminalDispose,
        } as unknown as TerminalService)
        overrides.set(TOKENS.webTabManager, {
          dispose: webTabDispose,
        } as unknown as WebTabManager)
      },
    })
    void runtime.services.terminalService
    void runtime.services.webTabManager

    const failure = await runtime.shutdown().catch((error: unknown) => error)

    expect(failure).toBeInstanceOf(AggregateError)
    expect(new Set((failure as AggregateError).errors)).toEqual(
      new Set([terminalFailure, webTabFailure]),
    )
    expect(terminalDispose).toHaveBeenCalledOnce()
    expect(webTabDispose).toHaveBeenCalledOnce()
    await expect(runtime.shutdown()).resolves.toBeUndefined()
    expect(terminalDispose).toHaveBeenCalledTimes(2)
    expect(webTabDispose).toHaveBeenCalledTimes(2)
  })

  it('aggregates lifecycle and owned-resource failures', async () => {
    const root = await createRoot('failure-aggregation')
    const lifecycleFailure = new Error('lifecycle failed')
    const deactivationFailure = new Error('terminal failed')
    const runtime = createElectronRuntime(createRuntimeDependencies(root, createSafeStorage()), {
      configure: (overrides) => {
        overrides.set(TOKENS.lifecycleCoordinator, {
          shutdown: vi.fn(async () => Promise.reject(lifecycleFailure)),
          startup: vi.fn(async () => undefined),
        } as unknown as LifecycleCoordinator)
        overrides.set(TOKENS.terminalService, {
          dispose: vi.fn(async () => Promise.reject(deactivationFailure)),
        } as unknown as TerminalService)
      },
    })
    void runtime.services.terminalService

    const failure = await runtime.shutdown().catch((error: unknown) => error)

    expect(failure).toBeInstanceOf(AggregateError)
    expect((failure as AggregateError).errors).toEqual([lifecycleFailure, deactivationFailure])
  })

  it('retries only owned resources whose previous disposal failed', async () => {
    const root = await createRoot('owned-selective-retry')
    const terminalDispose = vi
      .fn<() => Promise<void>>()
      .mockRejectedValueOnce(new Error('terminal busy'))
      .mockResolvedValueOnce(undefined)
    const webTabDispose = vi.fn(async () => undefined)
    const runtime = createElectronRuntime(createRuntimeDependencies(root, createSafeStorage()), {
      configure: (overrides) => {
        overrides.set(TOKENS.lifecycleCoordinator, createNoopLifecycleCoordinator())
        overrides.set(TOKENS.terminalService, {
          dispose: terminalDispose,
        } as unknown as TerminalService)
        overrides.set(TOKENS.webTabManager, {
          dispose: webTabDispose,
        } as unknown as WebTabManager)
      },
    })
    void runtime.services.terminalService
    void runtime.services.webTabManager

    await expect(runtime.shutdown()).rejects.toThrow('terminal busy')
    await expect(runtime.shutdown()).resolves.toBeUndefined()

    expect(terminalDispose).toHaveBeenCalledTimes(2)
    expect(webTabDispose).toHaveBeenCalledOnce()
  })
})

const createRoot = async (name: string): Promise<string> => {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), `marklab-container-${name}-`))
  roots.push(root)
  return root
}

const createRuntime = async (name: string) => {
  const root = await createRoot(name)
  return createElectronRuntime(createRuntimeDependencies(root, createSafeStorage()), {
    configure: (overrides) =>
      overrides.set(TOKENS.lifecycleCoordinator, createNoopLifecycleCoordinator()),
  })
}

const createNoopLifecycleCoordinator = () =>
  ({
    shutdown: vi.fn(async () => undefined),
    startup: vi.fn(async () => undefined),
  }) as unknown as LifecycleCoordinator

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
