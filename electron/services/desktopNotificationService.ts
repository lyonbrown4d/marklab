import type { BrowserWindow, Notification, NotificationConstructorOptions } from 'electron'
import { z } from 'zod'

import type { Logger } from '@electron/services/logger'
import { noopLogger } from '@electron/services/logger'
import type { SettingsStore } from '@electron/services/settingsStore'
import { RENDERER_PERSIST_KEYS } from '@/types/persistenceKeys'

export type DesktopNotificationCategory = 'export' | 'sync'

export type DesktopNotificationRequest = {
  body: string
  category: DesktopNotificationCategory
  id: string
  onClick?: () => void
  ownerWebContentsId?: number
  title: string
}

export type DesktopNotificationServiceContract = Pick<DesktopNotificationService, 'show'>

type NativeNotification = Pick<Notification, 'close' | 'on' | 'show'>
type NativeNotificationConstructor = {
  isSupported: () => boolean
  new (options: NotificationConstructorOptions): NativeNotification
}

const preferencesSchema = z.looseObject({
  state: z
    .looseObject({
      desktopNotificationExportsEnabled: z.boolean().optional(),
      desktopNotificationsBackgroundOnly: z.boolean().optional(),
      desktopNotificationsEnabled: z.boolean().optional(),
      desktopNotificationSyncEnabled: z.boolean().optional(),
    })
    .optional(),
})

const defaultPreferences = {
  desktopNotificationExportsEnabled: true,
  desktopNotificationsBackgroundOnly: true,
  desktopNotificationsEnabled: true,
  desktopNotificationSyncEnabled: true,
}

export class DesktopNotificationService {
  private readonly active = new Map<string, NativeNotification>()

  constructor(
    private readonly BrowserWindowClass: typeof BrowserWindow,
    private readonly NotificationClass: NativeNotificationConstructor,
    private readonly settingsStore: Pick<SettingsStore, 'getRendererPersistValue'>,
    private readonly logger: Logger = noopLogger,
  ) {}

  show(request: DesktopNotificationRequest): boolean {
    try {
      const preferences = this.preferences()
      if (!this.shouldShow(request, preferences)) return false
      const previous = this.active.get(request.id)
      previous?.close()
      const notification = new this.NotificationClass({
        body: request.body,
        title: request.title,
      })
      this.active.set(request.id, notification)
      const release = () => {
        if (this.active.get(request.id) === notification) this.active.delete(request.id)
      }
      notification.on('close', release)
      notification.on('click', () => {
        release()
        try {
          this.focusOwner(request.ownerWebContentsId)
          request.onClick?.()
        } catch (error) {
          this.logger.warn('desktop notification click action failed', {
            category: request.category,
            error,
          })
        }
      })
      notification.show()
      return true
    } catch (error) {
      this.logger.warn('desktop notification could not be shown', {
        category: request.category,
        error,
      })
      return false
    }
  }

  private shouldShow(
    request: DesktopNotificationRequest,
    preferences: typeof defaultPreferences,
  ): boolean {
    if (!this.NotificationClass.isSupported() || !preferences.desktopNotificationsEnabled) {
      return false
    }
    if (request.category === 'export' && !preferences.desktopNotificationExportsEnabled) {
      return false
    }
    if (request.category === 'sync' && !preferences.desktopNotificationSyncEnabled) return false
    if (!preferences.desktopNotificationsBackgroundOnly) return true
    return !this.BrowserWindowClass.getFocusedWindow()
  }

  private preferences(): typeof defaultPreferences {
    const value = this.settingsStore.getRendererPersistValue(RENDERER_PERSIST_KEYS.preferences)
    const parsed = preferencesSchema.safeParse(value)
    return { ...defaultPreferences, ...(parsed.success ? parsed.data.state : undefined) }
  }

  private ownerWindow(ownerWebContentsId?: number): BrowserWindow | null {
    if (ownerWebContentsId === undefined) return null
    return (
      this.BrowserWindowClass.getAllWindows().find(
        (window) => !window.isDestroyed() && window.webContents.id === ownerWebContentsId,
      ) ?? null
    )
  }

  private focusOwner(ownerWebContentsId?: number): void {
    const owner = this.ownerWindow(ownerWebContentsId)
    if (!owner) return
    if (owner.isMinimized()) owner.restore()
    owner.show()
    owner.focus()
  }
}
