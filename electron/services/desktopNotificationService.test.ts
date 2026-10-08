import { beforeEach, describe, expect, it, vi } from 'vitest'

import { DesktopNotificationService } from '@electron/services/desktopNotificationService'
import { noopLogger } from '@electron/services/logger'

type FakeWindow = ReturnType<typeof createWindow>

const notifications = {
  instances: [] as FakeNotification[],
  supported: true,
}

class FakeNotification {
  static isSupported = () => notifications.supported
  readonly close = vi.fn()
  readonly show = vi.fn()
  private readonly listeners = new Map<string, () => void>()

  constructor(readonly options: { body: string; title: string }) {
    notifications.instances.push(this)
  }

  on(event: string, listener: () => void) {
    this.listeners.set(event, listener)
    return this
  }

  emit(event: string) {
    this.listeners.get(event)?.()
  }
}

const createWindow = (focused: boolean) => ({
  focus: vi.fn(),
  isDestroyed: vi.fn(() => false),
  isFocused: vi.fn(() => focused),
  isMinimized: vi.fn(() => false),
  restore: vi.fn(),
  show: vi.fn(),
  webContents: { id: 7 },
})

const createFixture = (overrides: Record<string, boolean> = {}) => {
  const owner = createWindow(false)
  const state = {
    desktopNotificationsEnabled: true,
    desktopNotificationsBackgroundOnly: true,
    desktopNotificationExportsEnabled: true,
    desktopNotificationSyncEnabled: true,
    ...overrides,
  }
  const BrowserWindowClass = {
    getAllWindows: vi.fn(() => [owner] as FakeWindow[]),
    getFocusedWindow: vi.fn(() => (owner.isFocused() ? owner : null)),
  }
  const settingsStore = {
    getRendererPersistValue: vi.fn(() => ({ state, version: 2 })),
  }
  const service = new DesktopNotificationService(
    BrowserWindowClass as never,
    FakeNotification as never,
    settingsStore as never,
    noopLogger,
  )
  return { BrowserWindowClass, owner, service, settingsStore }
}

describe('DesktopNotificationService', () => {
  beforeEach(() => {
    notifications.instances = []
    notifications.supported = true
  })

  it('suppresses foreground notifications under the default background-only policy', () => {
    const { owner, service } = createFixture()
    owner.isFocused.mockReturnValue(true)

    const shown = service.show({
      body: 'report.pdf is ready',
      category: 'export',
      id: 'export:one',
      ownerWebContentsId: 7,
      title: 'Export finished',
    })

    expect(shown).toBe(false)
    expect(notifications.instances).toHaveLength(0)
  })

  it('suppresses notifications while another Marklab window is focused', () => {
    const { BrowserWindowClass, service } = createFixture()
    BrowserWindowClass.getFocusedWindow.mockReturnValue(createWindow(true))

    const shown = service.show({
      body: 'report.pdf is ready',
      category: 'export',
      id: 'export:one',
      ownerWebContentsId: 7,
      title: 'Export finished',
    })

    expect(shown).toBe(false)
    expect(notifications.instances).toHaveLength(0)
  })

  it('shows background notifications and focuses the owner when clicked', () => {
    const { owner, service } = createFixture()
    const onClick = vi.fn()

    expect(
      service.show({
        body: 'Notes is up to date',
        category: 'sync',
        id: 'sync:one',
        onClick,
        ownerWebContentsId: 7,
        title: 'Sync completed',
      }),
    ).toBe(true)

    const notification = notifications.instances[0]
    expect(notification?.show).toHaveBeenCalledOnce()
    notification?.emit('click')
    expect(owner.show).toHaveBeenCalledOnce()
    expect(owner.focus).toHaveBeenCalledOnce()
    expect(onClick).toHaveBeenCalledOnce()
  })

  it('restores a minimized owner before focusing it', () => {
    const { owner, service } = createFixture()
    owner.isMinimized.mockReturnValue(true)

    service.show({
      body: 'Done',
      category: 'export',
      id: 'export:one',
      ownerWebContentsId: 7,
      title: 'Export finished',
    })
    notifications.instances[0]?.emit('click')

    expect(owner.restore).toHaveBeenCalledOnce()
    expect(owner.show).toHaveBeenCalledOnce()
    expect(owner.focus).toHaveBeenCalledOnce()
  })

  it.each([
    ['desktopNotificationsEnabled', 'export'],
    ['desktopNotificationExportsEnabled', 'export'],
    ['desktopNotificationSyncEnabled', 'sync'],
  ] as const)('honors the %s preference', (preference, category) => {
    const { service } = createFixture({ [preference]: false })

    expect(service.show({ body: 'Done', category, id: `${category}:one`, title: 'Finished' })).toBe(
      false,
    )
    expect(notifications.instances).toHaveLength(0)
  })

  it('replaces a notification with the same stable id', () => {
    const { service } = createFixture({ desktopNotificationsBackgroundOnly: false })
    const request = {
      body: 'Done',
      category: 'export' as const,
      id: 'export:stable',
      title: 'Finished',
    }

    service.show(request)
    service.show({ ...request, body: 'Done again' })

    expect(notifications.instances).toHaveLength(2)
    expect(notifications.instances[0]?.close).toHaveBeenCalledOnce()
  })

  it('falls back silently when native notifications are unsupported', () => {
    notifications.supported = false
    const { service } = createFixture({ desktopNotificationsBackgroundOnly: false })

    expect(
      service.show({ body: 'Done', category: 'export', id: 'export:one', title: 'Finished' }),
    ).toBe(false)
    expect(notifications.instances).toHaveLength(0)
  })

  it('does not let settings failures escape into the completed background task', () => {
    const { service, settingsStore } = createFixture()
    settingsStore.getRendererPersistValue.mockImplementation(() => {
      throw new Error('database unavailable')
    })

    expect(() =>
      service.show({ body: 'Done', category: 'export', id: 'export:one', title: 'Finished' }),
    ).not.toThrow()
    expect(notifications.instances).toHaveLength(0)
  })
})
