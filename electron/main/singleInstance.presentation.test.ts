import { beforeEach, describe, expect, it, vi } from 'vitest'

const electronState = vi.hoisted(() => {
  const listeners = new Map<string, Array<(...args: unknown[]) => void>>()
  let ready = false
  const app = {
    isReady: vi.fn(() => ready),
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
    reset: () => {
      listeners.clear()
      ready = false
    },
    setReady: (value: boolean) => {
      ready = value
    },
  }
})

const launchState = vi.hoisted(() => ({ args: [] as string[], cwd: 'C:\\notes' }))

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
import {
  createInitialNativeOpenPresentationGate,
  installSingleInstanceAndDeepLinks,
} from '@electron/main/singleInstance'

const settle = async (): Promise<void> => {
  await Promise.resolve()
  await Promise.resolve()
}

beforeEach(() => {
  vi.clearAllMocks()
  vi.mocked(resolveExistingOpenTargets).mockReset()
  electronState.reset()
  launchState.args = []
})

describe('initial native-open presentation gate', () => {
  it.each(['renderer-ready', 'fallback timer'])(
    'defers %s presentation until the initial native-open gate settles',
    async () => {
      const present = vi.fn()
      const gate = createInitialNativeOpenPresentationGate(present)
      let release: (() => void) | undefined
      const pending = new Promise<void>((resolve) => {
        release = resolve
      })
      gate.holdUntil(pending)

      gate.requestPresentation()
      expect(present).not.toHaveBeenCalled()

      release?.()
      await pending
      await settle()
      expect(present).toHaveBeenCalledOnce()
    },
  )

  it('presents immediately when startup has no native-open gate', () => {
    const present = vi.fn()
    const gate = createInitialNativeOpenPresentationGate(present)

    gate.requestPresentation()

    expect(present).toHaveBeenCalledOnce()
  })

  it('releases a requested presentation when the gate rejects', async () => {
    const present = vi.fn()
    const gate = createInitialNativeOpenPresentationGate(present)
    const failure = Promise.reject(new Error('startup target failed'))
    gate.holdUntil(failure)

    gate.requestPresentation()
    await failure.catch(() => undefined)
    await settle()

    expect(present).toHaveBeenCalledOnce()
  })

  it.each([
    { resolved: ['C:\\notes\\same.md'], second: undefined },
    {
      resolved: ['C:\\notes\\same.md', 'C:\\notes\\same.md', 'C:\\notes\\other.md'],
      second: 'C:\\notes\\other.md',
    },
  ])('inherits the startup gate onto an already queued duplicate: $resolved', async (scenario) => {
    const duplicate = 'C:\\notes\\same.md'
    launchState.args = [duplicate]
    let finishResolution: ((targets: string[]) => void) | undefined
    vi.mocked(resolveExistingOpenTargets).mockReturnValueOnce(
      new Promise<string[]>((resolve) => {
        finishResolution = resolve
      }),
    )
    let finishBootstrap: (() => void) | undefined
    let mainWindow: ReturnType<typeof createWindow> | null = null
    const bootstrap = vi.fn(async () => {
      await new Promise<void>((resolve) => {
        finishBootstrap = resolve
      })
      mainWindow = createWindow()
    })
    let finishOpen: ((result: { ok: boolean }) => void) | undefined
    const openSystemPath = vi
      .fn()
      .mockReturnValueOnce(
        new Promise((resolve) => {
          finishOpen = resolve
        }),
      )
      .mockResolvedValue({ ok: true })
    const holdInitialPresentationUntil = vi.fn<(gate: Promise<void>) => void>()

    installSingleInstanceAndDeepLinks({
      bootstrap,
      getLogger: () => logger,
      getMainWindow: () => mainWindow,
      holdInitialPresentationUntil,
      openSystemPath,
      queueDeepLinkPayload: vi.fn(),
      queueOrSendRuntimeEvent: vi.fn(),
      showMainWindow: vi.fn(),
    })
    electronState.setReady(true)
    electronState.emit('open-file', { preventDefault: vi.fn() }, duplicate)
    finishResolution?.(scenario.resolved)
    await settle()

    const gate = holdInitialPresentationUntil.mock.calls[0]?.[0]
    let gateSettled = false
    void gate?.then(() => {
      gateSettled = true
    })
    finishBootstrap?.()
    await vi.waitFor(() => expect(openSystemPath).toHaveBeenCalled())

    expect(openSystemPath).toHaveBeenNthCalledWith(
      1,
      duplicate,
      'current',
      expect.objectContaining({ signal: expect.any(AbortSignal), startup: true }),
    )
    expect(gateSettled).toBe(false)
    finishOpen?.({ ok: true })
    await expect(gate).resolves.toBeUndefined()

    if (scenario.second) {
      await vi.waitFor(() => expect(openSystemPath).toHaveBeenCalledTimes(2))
      expect(openSystemPath).toHaveBeenNthCalledWith(2, scenario.second, 'new')
    } else {
      expect(openSystemPath).toHaveBeenCalledOnce()
    }
  })

  it.each(['open-file', 'second-instance'] as const)(
    'promotes the same ready-state %s target before opening the startup target',
    async (source) => {
      const duplicate = 'C:\\notes\\same.md'
      launchState.args = [duplicate]
      let finishResolution: ((targets: string[]) => void) | undefined
      const resolveTargets = vi.mocked(resolveExistingOpenTargets).mockReturnValueOnce(
        new Promise<string[]>((resolve) => {
          finishResolution = resolve
        }),
      )
      if (source === 'second-instance') resolveTargets.mockResolvedValueOnce([duplicate])
      let mainWindow: ReturnType<typeof createWindow> | null = null
      const bootstrap = vi.fn(async () => {
        mainWindow = createWindow()
      })
      let finishOpen: ((result: { ok: boolean }) => void) | undefined
      const openSystemPath = vi.fn().mockReturnValueOnce(
        new Promise((resolve) => {
          finishOpen = resolve
        }),
      )
      const holdInitialPresentationUntil = vi.fn<(gate: Promise<void>) => void>()

      installSingleInstanceAndDeepLinks({
        bootstrap,
        getLogger: () => logger,
        getMainWindow: () => mainWindow,
        holdInitialPresentationUntil,
        openSystemPath,
        queueDeepLinkPayload: vi.fn(),
        queueOrSendRuntimeEvent: vi.fn(),
        showMainWindow: vi.fn(),
      })
      electronState.setReady(true)
      await vi.waitFor(() => expect(bootstrap).toHaveBeenCalledOnce())
      if (source === 'open-file') {
        electronState.emit('open-file', { preventDefault: vi.fn() }, duplicate)
      } else {
        electronState.emit('second-instance', {}, [duplicate], 'C:\\notes')
        await vi.waitFor(() => expect(resolveExistingOpenTargets).toHaveBeenCalledTimes(2))
      }

      await settle()
      expect(openSystemPath).not.toHaveBeenCalled()

      const gate = holdInitialPresentationUntil.mock.calls[0]?.[0]
      let gateSettled = false
      void gate?.then(() => {
        gateSettled = true
      })
      finishResolution?.([duplicate])
      await vi.waitFor(() => expect(openSystemPath).toHaveBeenCalledOnce())

      expect(openSystemPath).toHaveBeenCalledOnce()
      expect(openSystemPath).toHaveBeenCalledWith(
        duplicate,
        'current',
        expect.objectContaining({ signal: expect.any(AbortSignal), startup: true }),
      )
      expect(gateSettled).toBe(false)

      finishOpen?.({ ok: true })
      await expect(gate).resolves.toBeUndefined()
    },
  )

  it('keeps the startup gate held when resolution fails after a primary target was reserved', async () => {
    const duplicate = 'C:\\notes\\same.md'
    launchState.args = [duplicate]
    let rejectResolution: ((error: Error) => void) | undefined
    vi.mocked(resolveExistingOpenTargets).mockReturnValueOnce(
      new Promise<string[]>((_resolve, reject) => {
        rejectResolution = reject
      }),
    )
    let mainWindow: ReturnType<typeof createWindow> | null = null
    const bootstrap = vi.fn(async () => {
      mainWindow = createWindow()
    })
    let finishOpen: ((result: { ok: boolean }) => void) | undefined
    const openSystemPath = vi.fn().mockReturnValueOnce(
      new Promise((resolve) => {
        finishOpen = resolve
      }),
    )
    const holdInitialPresentationUntil = vi.fn<(gate: Promise<void>) => void>()

    installSingleInstanceAndDeepLinks({
      bootstrap,
      getLogger: () => logger,
      getMainWindow: () => mainWindow,
      holdInitialPresentationUntil,
      openSystemPath,
      queueDeepLinkPayload: vi.fn(),
      queueOrSendRuntimeEvent: vi.fn(),
      showMainWindow: vi.fn(),
    })
    electronState.emit('open-file', { preventDefault: vi.fn() }, duplicate)
    electronState.setReady(true)
    await vi.waitFor(() => expect(bootstrap).toHaveBeenCalledOnce())
    expect(openSystemPath).not.toHaveBeenCalled()

    const gate = holdInitialPresentationUntil.mock.calls[0]?.[0]
    let gateSettled = false
    void gate?.then(() => {
      gateSettled = true
    })
    rejectResolution?.(new Error('resolution failed'))
    await vi.waitFor(() => expect(openSystemPath).toHaveBeenCalledOnce())

    expect(gateSettled).toBe(false)
    expect(logger.warn).toHaveBeenCalledWith('native open target resolution failed', {
      error: expect.any(Error),
    })

    finishOpen?.({ ok: true })
    await expect(gate).resolves.toBeUndefined()
  })
})

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
