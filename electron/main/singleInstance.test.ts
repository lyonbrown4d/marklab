import { beforeEach, describe, expect, it, vi } from 'vitest'

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
vi.mock('@electron/main/deepLinks.js', () => ({
  createSingleInstancePayload: (args: string[], cwd: string) => ({ args, cwd }),
  launchInfo: launchState,
  publishDeepLinksFromArgs: vi.fn(),
  publishDeepLinkUrl: vi.fn(),
  registerDeepLinkProtocol: vi.fn(),
}))
vi.mock('@electron/main/openTargets.js', () => ({
  resolveExistingOpenTargets: vi.fn(async (args: readonly unknown[]) =>
    args.filter((value): value is string => typeof value === 'string'),
  ),
}))

import { installSingleInstanceAndDeepLinks } from '@electron/main/singleInstance.js'

type FakeWindow = {
  focus: ReturnType<typeof vi.fn>
  isDestroyed: ReturnType<typeof vi.fn>
  isMinimized: ReturnType<typeof vi.fn>
  restore: ReturnType<typeof vi.fn>
}

const createWindow = (): FakeWindow => ({
  focus: vi.fn(),
  isDestroyed: vi.fn(() => false),
  isMinimized: vi.fn(() => false),
  restore: vi.fn(),
})

const createHarness = () => {
  let mainWindow: FakeWindow | null = null
  const openSystemPath = vi.fn(async () => ({ ok: true }))
  const bootstrap = vi.fn(async () => {
    electronState.setReady(true)
    mainWindow = createWindow()
  })
  const logger = {
    child: vi.fn(),
    error: vi.fn(),
    info: vi.fn(),
    warn: vi.fn(),
  }
  logger.child.mockReturnValue(logger)
  const options = {
    bootstrap,
    getContainer: () => ({ cradle: { logger } }),
    getMainWindow: () => mainWindow,
    openSystemPath,
    queueDeepLinkPayload: vi.fn(),
    queueOrSendRuntimeEvent: vi.fn(),
    showMainWindow: vi.fn(),
  }
  return { bootstrap, getMainWindow: () => mainWindow, logger, openSystemPath, options }
}

const settle = async (): Promise<void> => {
  await Promise.resolve()
  await Promise.resolve()
  await Promise.resolve()
}

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

    installSingleInstanceAndDeepLinks(harness.options as never)
    await vi.waitFor(() => expect(harness.openSystemPath).toHaveBeenCalledTimes(2))

    expect(harness.openSystemPath.mock.calls).toEqual([
      ['C:\\notes\\one.md', 'current'],
      ['C:\\notes\\two.markdown', 'new'],
    ])
  })

  it('opens a second-instance file in a new isolated window', async () => {
    const harness = createHarness()
    installSingleInstanceAndDeepLinks(harness.options as never)
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

    installSingleInstanceAndDeepLinks(harness.options as never)
    await settle()

    expect(harness.options.bootstrap).toHaveBeenCalledOnce()
    finishBootstrap?.()
    await settle()
  })
})
