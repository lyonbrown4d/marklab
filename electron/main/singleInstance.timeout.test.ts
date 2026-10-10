import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

const electronState = vi.hoisted(() => {
  const listeners = new Map<string, Array<(...args: unknown[]) => void>>()
  const app = {
    isReady: vi.fn(() => true),
    on: vi.fn((event: string, listener: (...args: unknown[]) => void) => {
      listeners.set(event, [...(listeners.get(event) ?? []), listener])
    }),
    quit: vi.fn(),
    requestSingleInstanceLock: vi.fn(() => true),
    whenReady: vi.fn(() => Promise.resolve()),
  }
  return {
    app,
    emit: (event: string, ...args: unknown[]) => {
      for (const listener of listeners.get(event) ?? []) listener(...args)
    },
    reset: () => listeners.clear(),
  }
})

const launchState = vi.hoisted(() => ({
  args: ['C:\\notes\\initial.md'],
  cwd: 'C:\\notes',
}))

vi.mock('electron', () => ({ app: electronState.app }))
vi.mock('@electron/main/deepLinks', () => ({
  createSingleInstancePayload: (args: string[], cwd: string) => ({ args, cwd }),
  launchInfo: launchState,
  publishDeepLinksFromArgs: vi.fn(),
  publishDeepLinkUrl: vi.fn(),
  registerDeepLinkProtocol: vi.fn(),
}))
vi.mock('@electron/main/openTargets', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@electron/main/openTargets')>()
  return { ...actual, resolveExistingOpenTargets: vi.fn() }
})

import { resolveExistingOpenTargets } from '@electron/main/openTargets'
import { runNativeOpenWithStartupTimeout } from '@electron/main/initialNativeOpen'
import { installSingleInstanceAndDeepLinks } from '@electron/main/singleInstance'

const deferred = <T>() => {
  let reject!: (reason?: unknown) => void
  let resolve!: (value: T) => void
  const promise = new Promise<T>((complete, fail) => {
    resolve = complete
    reject = fail
  })
  return { promise, reject, resolve }
}

const settle = async () => {
  for (let turn = 0; turn < 5; turn += 1) await Promise.resolve()
}

const createWindow = () => ({
  focus: vi.fn(),
  isDestroyed: vi.fn(() => false),
  isMinimized: vi.fn(() => false),
  restore: vi.fn(),
})

const logger = {
  child: vi.fn(function () {
    return logger
  }),
  debug: vi.fn(),
  error: vi.fn(),
  info: vi.fn(),
  warn: vi.fn(),
}

type OpenSystemPath = Parameters<typeof installSingleInstanceAndDeepLinks>[0]['openSystemPath']

const installHarness = (openSystemPath: OpenSystemPath) => {
  const gate = vi.fn<(settled: Promise<void>) => void>()
  const mainWindow = createWindow()
  installSingleInstanceAndDeepLinks({
    bootstrap: vi.fn(async () => undefined),
    getLogger: () => logger,
    getMainWindow: () => mainWindow,
    holdInitialPresentationUntil: gate,
    openSystemPath,
    queueDeepLinkPayload: vi.fn(),
    queueOrSendRuntimeEvent: vi.fn(),
    showMainWindow: vi.fn(),
  })
  return { gate: gate.mock.calls[0]![0], mainWindow }
}

beforeEach(() => {
  vi.useFakeTimers()
  vi.clearAllMocks()
  electronState.reset()
  electronState.app.isReady.mockReturnValue(true)
  launchState.args = ['C:\\notes\\initial.md']
  vi.mocked(resolveExistingOpenTargets).mockReset()
})

afterEach(() => {
  vi.useRealTimers()
})

describe('initial native-open timeout failover', () => {
  it('releases presentation and continues a late resolution as a runtime open', async () => {
    const resolution = deferred<string[]>()
    vi.mocked(resolveExistingOpenTargets).mockReturnValueOnce(resolution.promise)
    const openSystemPath = vi.fn().mockResolvedValue({ ok: true })
    const { gate } = installHarness(openSystemPath)

    await vi.runOnlyPendingTimersAsync()

    await expect(gate).resolves.toBeUndefined()
    expect(logger.warn).toHaveBeenCalledWith(
      'initial native open timed out',
      expect.objectContaining({ phase: 'resolution' }),
    )

    resolution.resolve(['C:\\notes\\initial.md'])
    await settle()

    expect(openSystemPath).toHaveBeenCalledOnce()
    expect(openSystemPath).toHaveBeenCalledWith('C:\\notes\\initial.md', 'new')
  })

  it('flushes a queued duplicate after timeout without reopening it on late resolution', async () => {
    const resolution = deferred<string[]>()
    vi.mocked(resolveExistingOpenTargets).mockReturnValueOnce(resolution.promise)
    const openSystemPath = vi.fn().mockResolvedValue({ ok: true })
    installHarness(openSystemPath)

    electronState.emit('open-file', { preventDefault: vi.fn() }, 'C:\\notes\\initial.md')
    expect(openSystemPath).not.toHaveBeenCalled()

    await vi.runOnlyPendingTimersAsync()
    await settle()
    expect(openSystemPath).toHaveBeenCalledOnce()
    expect(openSystemPath).toHaveBeenCalledWith('C:\\notes\\initial.md', 'new')

    resolution.resolve(['C:\\notes\\initial.md'])
    await settle()
    expect(openSystemPath).toHaveBeenCalledOnce()
  })

  it('does not reopen a pre-ready startup target when late resolution finds the same path', async () => {
    const resolution = deferred<string[]>()
    const nativeOpen = deferred<{ ok: true }>()
    vi.mocked(resolveExistingOpenTargets).mockReturnValueOnce(resolution.promise)
    const openSystemPath = vi.fn(() => nativeOpen.promise)
    electronState.app.isReady.mockReturnValue(false)
    const { gate } = installHarness(openSystemPath)

    electronState.emit('open-file', { preventDefault: vi.fn() }, 'C:\\notes\\initial.md')
    await vi.advanceTimersByTimeAsync(10_000)
    await settle()

    expect(openSystemPath).toHaveBeenCalledOnce()
    expect(openSystemPath).toHaveBeenCalledWith(
      'C:\\notes\\initial.md',
      'current',
      expect.objectContaining({ signal: expect.any(AbortSignal), startup: true }),
    )
    nativeOpen.resolve({ ok: true })
    await expect(gate).resolves.toBeUndefined()

    resolution.resolve(['C:\\notes\\initial.md'])
    await settle()
    expect(openSystemPath).toHaveBeenCalledOnce()
  })

  it('keeps presentation held for a distinct pre-ready open-file after resolution timeout', async () => {
    const resolution = deferred<string[]>()
    const nativeOpen = deferred<{ ok: true }>()
    vi.mocked(resolveExistingOpenTargets).mockReturnValueOnce(resolution.promise)
    const openSystemPath = vi.fn(() => nativeOpen.promise)
    electronState.app.isReady.mockReturnValue(false)
    const { gate } = installHarness(openSystemPath)
    let presented = false
    void gate.then(() => {
      presented = true
    })

    electronState.emit('open-file', { preventDefault: vi.fn() }, 'C:\\notes\\other.md')
    await vi.advanceTimersByTimeAsync(10_000)
    await settle()

    expect(openSystemPath).toHaveBeenCalledWith(
      'C:\\notes\\other.md',
      'current',
      expect.objectContaining({ signal: expect.any(AbortSignal), startup: true }),
    )
    expect(presented).toBe(false)

    nativeOpen.resolve({ ok: true })
    await expect(gate).resolves.toBeUndefined()
    resolution.resolve([])
    await settle()
  })

  it('releases a hung startup open and keeps later queue processing isolated from its result', async () => {
    const initialOpen = deferred<{ ok: boolean }>()
    vi.mocked(resolveExistingOpenTargets).mockResolvedValueOnce(['C:\\notes\\initial.md'])
    const openSystemPath = vi
      .fn()
      .mockReturnValueOnce(initialOpen.promise)
      .mockResolvedValue({ ok: true })
    const { gate } = installHarness(openSystemPath)
    await settle()
    expect(openSystemPath).toHaveBeenCalledWith(
      'C:\\notes\\initial.md',
      'current',
      expect.objectContaining({ signal: expect.any(AbortSignal), startup: true }),
    )

    electronState.emit('open-file', { preventDefault: vi.fn() }, 'C:\\notes\\queued.md')
    await vi.runOnlyPendingTimersAsync()
    await settle()

    await expect(gate).resolves.toBeUndefined()
    expect(logger.warn).toHaveBeenCalledWith(
      'initial native open timed out',
      expect.objectContaining({ phase: 'application', target: 'C:\\notes\\initial.md' }),
    )
    expect(openSystemPath).toHaveBeenNthCalledWith(2, 'C:\\notes\\queued.md', 'new')

    initialOpen.resolve({ ok: true })
    await settle()
    electronState.emit('open-file', { preventDefault: vi.fn() }, 'C:\\notes\\after.md')
    await settle()

    expect(openSystemPath).toHaveBeenNthCalledWith(3, 'C:\\notes\\after.md', 'new')
    expect(openSystemPath).toHaveBeenCalledTimes(3)
  })

  it('logs a late aborted result at debug after the startup timeout', async () => {
    const opening = deferred<{ error: string; ok: false }>()
    const onFinished = vi.fn()

    runNativeOpenWithStartupTimeout({
      logger,
      onFinished,
      openSystemPath: vi.fn(() => opening.promise),
      request: {
        disposition: 'current',
        path: 'C:\\notes\\initial.md',
        startup: true,
      },
    })
    await vi.runOnlyPendingTimersAsync()
    opening.resolve({ error: 'This operation was aborted', ok: false })
    await settle()

    expect(onFinished).toHaveBeenCalledOnce()
    expect(logger.debug).toHaveBeenCalledWith('native open target canceled', {
      target: 'C:\\notes\\initial.md',
    })
    expect(logger.warn).not.toHaveBeenCalledWith('native open target failed', expect.anything())
  })

  it('logs a late AbortError rejection at debug after the startup timeout', async () => {
    const opening = deferred<never>()

    runNativeOpenWithStartupTimeout({
      logger,
      onFinished: vi.fn(),
      openSystemPath: vi.fn(() => opening.promise),
      request: {
        disposition: 'current',
        path: 'C:\\notes\\initial.md',
        startup: true,
      },
    })
    await vi.runOnlyPendingTimersAsync()
    opening.reject(new DOMException('This operation was aborted', 'AbortError'))
    await settle()

    expect(logger.debug).toHaveBeenCalledWith('native open target canceled', {
      target: 'C:\\notes\\initial.md',
    })
    expect(logger.warn).not.toHaveBeenCalledWith('native open target failed', expect.anything())
  })
})
