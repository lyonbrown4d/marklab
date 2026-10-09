import type { StateCreator } from 'zustand'

export type NotificationPreferencesState = {
  desktopNotificationsEnabled: boolean
  desktopNotificationsBackgroundOnly: boolean
  desktopNotificationExportsEnabled: boolean
  desktopNotificationSyncEnabled: boolean
  desktopNotificationUpdatesEnabled: boolean
  setDesktopNotificationsEnabled: (enabled: boolean) => void
  setDesktopNotificationsBackgroundOnly: (enabled: boolean) => void
  setDesktopNotificationExportsEnabled: (enabled: boolean) => void
  setDesktopNotificationSyncEnabled: (enabled: boolean) => void
  setDesktopNotificationUpdatesEnabled: (enabled: boolean) => void
}

export const createNotificationPreferencesSlice: StateCreator<
  NotificationPreferencesState,
  [],
  [],
  NotificationPreferencesState
> = (set) => ({
  desktopNotificationsEnabled: true,
  desktopNotificationsBackgroundOnly: true,
  desktopNotificationExportsEnabled: true,
  desktopNotificationSyncEnabled: true,
  desktopNotificationUpdatesEnabled: true,
  setDesktopNotificationsEnabled: (desktopNotificationsEnabled) =>
    set((state) =>
      state.desktopNotificationsEnabled === desktopNotificationsEnabled
        ? state
        : { desktopNotificationsEnabled },
    ),
  setDesktopNotificationsBackgroundOnly: (desktopNotificationsBackgroundOnly) =>
    set((state) =>
      state.desktopNotificationsBackgroundOnly === desktopNotificationsBackgroundOnly
        ? state
        : { desktopNotificationsBackgroundOnly },
    ),
  setDesktopNotificationExportsEnabled: (desktopNotificationExportsEnabled) =>
    set((state) =>
      state.desktopNotificationExportsEnabled === desktopNotificationExportsEnabled
        ? state
        : { desktopNotificationExportsEnabled },
    ),
  setDesktopNotificationSyncEnabled: (desktopNotificationSyncEnabled) =>
    set((state) =>
      state.desktopNotificationSyncEnabled === desktopNotificationSyncEnabled
        ? state
        : { desktopNotificationSyncEnabled },
    ),
  setDesktopNotificationUpdatesEnabled: (desktopNotificationUpdatesEnabled) =>
    set((state) =>
      state.desktopNotificationUpdatesEnabled === desktopNotificationUpdatesEnabled
        ? state
        : { desktopNotificationUpdatesEnabled },
    ),
})
