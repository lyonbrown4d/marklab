import { beforeEach, describe, expect, it, vi } from 'vitest'
import { createSingleInstanceTestWindow as createWindow } from '@electron/main/singleInstanceTestWindow'

const electronState = vi.hoisted(() => {
  const listeners = new Map<string, Array<(...args: unknown[]) => void>>()
  let ready = false

  const app = {
    isReady: vi.fn(() => ready),
    on: vi.fn((event: string, listener: (...args: unknown[]) => void) => {
      const current = listeners.get(event) ?? []
      current.push(listener)
      listeners.set(event, current)
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
  return {
    ...actual,
    resolveExistingOpenTargets: vi.fn(async (args: readonly unknown[]) =>
      args.filter((value): value is string => typeof value === 'string'),
    ),
  }
})

import { resolveExistingOpenTargets } from '@electron/main/openTargets'
import {
  createInitialNativeOpenPresentationGate,
  installSingleInstanceAndDeepLinks,
} from '@electron/main/singleInstance'

const createHarness = () => {
  let mainWindow: ReturnType<typeof createWindow> | null = null
  const openSystemPath = vi.fn<
    Parameters<typeof installSingleInstanceAndDeepLinks>[0]['openSystemPath']
  >(async () => ({ ok: true }))
  const bootstrap = vi.fn(async () => {
    electronState.setReady(true)
    mainWindow = createWindow()
  })
  const logger = { child: vi.fn(), debug: vi.fn(), error: vi.fn(), info: vi.fn(), warn: vi.fn() }
  logger.child.mockReturnValue(logger)
  const holdInitialPresentationUntil = vi.fn<(gate: Promise<void>) => void>()
  const options: Parameters<typeof installSingleInstanceAndDeepLinks>[0] = {
    bootstrap,
    getLogger: () => logger,
    getMainWindow: () => mainWindow,
    holdInitialPresentationUntil,
    openSystemPath,
    queueDeepLinkPayload: vi.fn(),
    queueOrSendRuntimeEvent: vi.fn(),
    showMainWindow: vi.fn(),
  }
  return {
    bootstrap,
    getMainWindow: () => mainWindow,
    holdInitialPresentationUntil,
    logger,
    openSystemPath,
    options,
  }
}

const startupOptions = () =>
  expect.objectContaining({ signal: expect.any(AbortSignal), startup: true })

const settle = (): Promise<void> => new Promise((resolve) => setTimeout(resolve, 0))

describe('single instance native file opening', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    electronState.reset()
    launchState.args = []
    launchState.cwd = 'C:\\notes'
  })

  it('reuses the primary window for the first cold-start file and opens the rest separately', async () => {
    launchState.args = ['C:\\notes\\one.md', 'C:\\notes\\two.markdown']
    const harness = createHarness()

    installSingleInstanceAndDeepLinks(harness.options)
    await vi.waitFor(() => expect(harness.openSystemPath).toHaveBeenCalledTimes(2))

    expect(harness.openSystemPath.mock.calls[0]).toEqual([
      'C:\\notes\\one.md',
      'current',
      startupOptions(),
    ])
    expect(harness.openSystemPath.mock.calls[1]).toEqual(['C:\\notes\\two.markdown', 'new'])
  })

  it('does not install a presentation gate when startup has no path candidate', async () => {
    const harness = createHarness()

    installSingleInstanceAndDeepLinks(harness.options)
    await vi.waitFor(() => expect(harness.bootstrap).toHaveBeenCalledOnce())

    expect(harness.holdInitialPresentationUntil).not.toHaveBeenCalled()
  })

  it('holds initial presentation until the first startup target application settles', async () => {
    const explicitWorkspace = 'C:\\notes\\explicit-workspace'
    launchState.args = [explicitWorkspace]
    let finishResolution: ((targets: string[]) => void) | undefined
    let finishOpen: ((result: { ok: boolean }) => void) | undefined
    vi.mocked(resolveExistingOpenTargets).mockReturnValueOnce(
      new Promise<string[]>((resolve) => {
        finishResolution = resolve
      }),
    )
    const harness = createHarness()
    harness.openSystemPath.mockReturnValueOnce(
      new Promise((resolve) => {
        finishOpen = resolve
      }),
    )

    installSingleInstanceAndDeepLinks(harness.options)

    expect(harness.holdInitialPresentationUntil).toHaveBeenCalledOnce()
    const gate = harness.holdInitialPresentationUntil.mock.calls[0]?.[0]
    expect(gate).toBeInstanceOf(Promise)
    let settled = false
    void gate?.then(() => {
      settled = true
    })

    await vi.waitFor(() => expect(harness.bootstrap).toHaveBeenCalledOnce())
    finishResolution?.([explicitWorkspace])
    await vi.waitFor(() => expect(harness.openSystemPath).toHaveBeenCalledOnce())
    await settle()
    expect(settled).toBe(false)

    finishOpen?.({ ok: true })
    await expect(gate).resolves.toBeUndefined()
    expect(settled).toBe(true)
  })

  it('releases the initial presentation gate when startup target application fails', async () => {
    const explicitWorkspace = 'C:\\notes\\explicit-workspace'
    launchState.args = [explicitWorkspace]
    const harness = createHarness()
    harness.openSystemPath.mockRejectedValueOnce(new Error('open failed'))

    installSingleInstanceAndDeepLinks(harness.options)

    const gate = harness.holdInitialPresentationUntil.mock.calls[0]?.[0]
    await expect(gate).resolves.toBeUndefined()
    expect(harness.logger.warn).toHaveBeenCalledWith('native open target failed', {
      error: expect.any(Error),
      target: explicitWorkspace,
    })
  })

  it('gates a before-ready macOS open-file until its primary target application settles', async () => {
    const filePath = 'C:\\notes\\finder-open.md'
    const present = vi.fn()
    const presentationGate = createInitialNativeOpenPresentationGate(present)
    let finishOpen: ((result: { ok: boolean }) => void) | undefined
    const harness = createHarness()
    harness.options.holdInitialPresentationUntil = presentationGate.holdUntil
    harness.options.showMainWindow = presentationGate.requestPresentation
    harness.openSystemPath.mockReturnValueOnce(
      new Promise((resolve) => {
        finishOpen = resolve
      }),
    )

    installSingleInstanceAndDeepLinks(harness.options)
    electronState.emit('open-file', { preventDefault: vi.fn() }, filePath)
    harness.options.showMainWindow()

    expect(present).not.toHaveBeenCalled()
    await vi.waitFor(() => expect(harness.openSystemPath).toHaveBeenCalledOnce())
    expect(harness.openSystemPath).toHaveBeenCalledWith(filePath, 'current', startupOptions())
    expect(present).not.toHaveBeenCalled()

    finishOpen?.({ ok: true })
    await vi.waitFor(() => expect(present).toHaveBeenCalledOnce())
  })

  it('releases a before-ready macOS open-file gate after application failure', async () => {
    const filePath = 'C:\\notes\\finder-failure.md'
    const present = vi.fn()
    const presentationGate = createInitialNativeOpenPresentationGate(present)
    const harness = createHarness()
    harness.options.holdInitialPresentationUntil = presentationGate.holdUntil
    harness.options.showMainWindow = presentationGate.requestPresentation
    harness.openSystemPath.mockRejectedValueOnce(new Error('finder open failed'))

    installSingleInstanceAndDeepLinks(harness.options)
    electronState.emit('open-file', { preventDefault: vi.fn() }, filePath)
    harness.options.showMainWindow()

    await vi.waitFor(() => expect(present).toHaveBeenCalledOnce())
    expect(harness.logger.warn).toHaveBeenCalledWith('native open target failed', {
      error: expect.any(Error),
      target: filePath,
    })
  })

  it('keeps ready-state macOS open-file outside the initial presentation gate', async () => {
    const filePath = 'C:\\notes\\ready-open.md'
    const harness = createHarness()
    installSingleInstanceAndDeepLinks(harness.options)
    await vi.waitFor(() => expect(harness.bootstrap).toHaveBeenCalledOnce())
    harness.holdInitialPresentationUntil.mockClear()

    electronState.emit('open-file', { preventDefault: vi.fn() }, filePath)
    await vi.waitFor(() => expect(harness.openSystemPath).toHaveBeenCalledOnce())

    expect(harness.holdInitialPresentationUntil).not.toHaveBeenCalled()
    expect(harness.openSystemPath).toHaveBeenCalledWith(filePath, 'new')
  })

  it('opens a second-instance file in a new isolated window', async () => {
    const harness = createHarness()
    installSingleInstanceAndDeepLinks(harness.options)
    await vi.waitFor(() => expect(harness.bootstrap).toHaveBeenCalledOnce())

    electronState.emit('second-instance', {}, ['C:\\notes\\second.md'], 'C:\\notes')
    await vi.waitFor(() => expect(harness.openSystemPath).toHaveBeenCalledOnce())

    expect(harness.openSystemPath).toHaveBeenCalledWith('C:\\notes\\second.md', 'new')
  })

  it('deduplicates bootstrap while native target resolution races app readiness', async () => {
    launchState.args = ['C:\\notes\\one.md']
    electronState.setReady(true)
    let finishBootstrap: (() => void) | undefined
    const bootstrapPromise = new Promise<void>((resolve) => {
      finishBootstrap = resolve
    })
    const harness = createHarness()
    harness.options.bootstrap = vi.fn(() => bootstrapPromise)

    installSingleInstanceAndDeepLinks(harness.options)
    await settle()

    expect(harness.options.bootstrap).toHaveBeenCalledOnce()
    finishBootstrap?.()
    await settle()
  })

  it('lets an explicit cold-start target replace the restored workspace before presentation', async () => {
    const restoredWorkspace = 'C:\\restored-internal-workspace'
    const explicitWorkspace = 'C:\\notes\\explicit-workspace'
    let activeWorkspace = restoredWorkspace
    launchState.args = [explicitWorkspace]
    const harness = createHarness()
    harness.openSystemPath.mockImplementation(async (target) => {
      activeWorkspace = target
      return { ok: true }
    })

    installSingleInstanceAndDeepLinks(harness.options)
    await vi.waitFor(() => expect(harness.openSystemPath).toHaveBeenCalledOnce())
    expect(activeWorkspace).toBe(explicitWorkspace)
    expect(harness.openSystemPath).toHaveBeenCalledWith(
      explicitWorkspace,
      'current',
      startupOptions(),
    )
  })

  it('does not present a created primary before a late startup target is applied', async () => {
    const explicitWorkspace = 'C:\\notes\\explicit-workspace'
    launchState.args = [explicitWorkspace]
    let finishResolution: ((targets: string[]) => void) | undefined
    vi.mocked(resolveExistingOpenTargets).mockReturnValueOnce(
      new Promise<string[]>((resolve) => {
        finishResolution = resolve
      }),
    )
    const harness = createHarness()
    const order: string[] = []
    harness.options.showMainWindow = vi.fn(() => order.push('present'))
    harness.openSystemPath.mockImplementation(async () => {
      order.push('apply-target')
      harness.options.showMainWindow()
      return { ok: true }
    })

    installSingleInstanceAndDeepLinks(harness.options)
    await vi.waitFor(() => expect(harness.bootstrap).toHaveBeenCalledOnce())
    expect(harness.getMainWindow()).not.toBeNull()
    expect(harness.options.showMainWindow).not.toHaveBeenCalled()

    finishResolution?.([explicitWorkspace])
    await vi.waitFor(() => expect(harness.openSystemPath).toHaveBeenCalledOnce())

    expect(harness.openSystemPath).toHaveBeenCalledWith(
      explicitWorkspace,
      'current',
      startupOptions(),
    )
    expect(order).toEqual(['apply-target', 'present'])
  })

  it('reports a resolved native-open failure instead of treating it as success', async () => {
    const explicitWorkspace = 'C:\\notes\\explicit-workspace'
    launchState.args = [explicitWorkspace]
    const harness = createHarness()
    harness.openSystemPath.mockResolvedValue({
      error: 'Renderer did not finish saving before close.',
      ok: false,
    })

    installSingleInstanceAndDeepLinks(harness.options)

    await vi.waitFor(() =>
      expect(harness.logger.warn).toHaveBeenCalledWith('native open target failed', {
        error: 'Renderer did not finish saving before close.',
        target: explicitWorkspace,
      }),
    )
  })
})
