import { beforeEach, describe, expect, it, vi } from 'vitest'

const electronState = vi.hoisted(() => {
  const listeners = new Map<string, Array<(...args: unknown[]) => void>>()
  const app = {
    isReady: vi.fn(() => true),
    on: vi.fn((event: string, listener: (...args: unknown[]) => void) => {
      listeners.set(event, [...(listeners.get(event) ?? []), listener])
    }),
    quit: vi.fn(),
    requestSingleInstanceLock: vi.fn(() => true),
    whenReady: vi.fn(() => new Promise<void>(() => undefined)),
  }
  return {
    app,
    emit: (event: string, ...args: unknown[]) => {
      for (const listener of listeners.get(event) ?? []) listener(...args)
    },
    reset: () => listeners.clear(),
  }
})
const deepLinks = vi.hoisted(() => ({ publishDeepLinkUrl: vi.fn() }))

vi.mock('electron', () => ({ app: electronState.app }))
vi.mock('@electron/main/deepLinks', () => ({
  createSingleInstancePayload: vi.fn(),
  launchInfo: { args: [], cwd: 'C:\\notes' },
  publishDeepLinksFromArgs: vi.fn(),
  publishDeepLinkUrl: deepLinks.publishDeepLinkUrl,
  registerDeepLinkProtocol: vi.fn(),
}))

import { installSingleInstanceAndDeepLinks } from '@electron/main/singleInstance'

const createHarness = () => {
  const main = {
    focus: vi.fn(),
    isDestroyed: vi.fn(() => false),
    isMinimized: vi.fn(() => true),
    restore: vi.fn(),
  }
  const logger = {
    child: vi.fn(function () {
      return logger
    }),
    error: vi.fn(),
    info: vi.fn(),
    warn: vi.fn(),
  }
  const options: Parameters<typeof installSingleInstanceAndDeepLinks>[0] = {
    bootstrap: vi.fn(async () => undefined),
    getLogger: () => logger as never,
    getMainWindow: () => main as never,
    holdInitialPresentationUntil: vi.fn(),
    openSystemPath: vi.fn(async () => ({ ok: true })),
    queueDeepLinkPayload: vi.fn(),
    queueOrSendRuntimeEvent: vi.fn(),
    showMainWindow: vi.fn(),
  }
  return { logger, main, options }
}

beforeEach(() => {
  vi.clearAllMocks()
  electronState.reset()
  electronState.app.requestSingleInstanceLock.mockReturnValue(true)
})

describe('single-instance native lifecycle events', () => {
  it('restores and focuses the existing window for activation and deep links', () => {
    const { main, options } = createHarness()
    installSingleInstanceAndDeepLinks(options)
    const urlEvent = { preventDefault: vi.fn() }

    electronState.emit('open-url', urlEvent, 'marklab://open?path=note.md')
    electronState.emit('activate')

    expect(urlEvent.preventDefault).toHaveBeenCalledOnce()
    expect(deepLinks.publishDeepLinkUrl).toHaveBeenCalledOnce()
    expect(options.showMainWindow).toHaveBeenCalledTimes(2)
    expect(main.restore).toHaveBeenCalledTimes(2)
    expect(main.focus).toHaveBeenCalledTimes(2)
  })

  it('quits without registering protocol ownership when the lock is unavailable', () => {
    electronState.app.requestSingleInstanceLock.mockReturnValue(false)

    installSingleInstanceAndDeepLinks(createHarness().options)

    expect(electronState.app.quit).toHaveBeenCalledOnce()
  })
})
