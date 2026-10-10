import { beforeEach, describe, expect, it, vi } from 'vitest'
import { usePreferencesStore } from '@/store/usePreferencesStore'

const storage = vi.hoisted(() => ({
  getItem: vi.fn(),
  setItem: vi.fn(),
  removeItem: vi.fn(),
}))

vi.mock('@/store/persistStorage', () => ({
  createElectronSettingsJsonStorage: () => storage,
}))

beforeEach(() => {
  storage.getItem.mockReturnValue(null)
  usePreferencesStore.setState(usePreferencesStore.getInitialState(), true)
})

describe('writing-first layout preferences', () => {
  it('stores the default AI provider as an optional persisted preference', () => {
    const store = usePreferencesStore.getState()

    expect(store.aiDefaultProviderId).toBeNull()
    store.setAiDefaultProviderId('ollama-local')

    expect(usePreferencesStore.getState().aiDefaultProviderId).toBe('ollama-local')
  })

  it('toggles the editor read-only browsing mode', () => {
    const store = usePreferencesStore.getState()

    expect(store.editorReadOnlyMode).toBe(false)
    store.setEditorReadOnlyMode(true)

    expect(usePreferencesStore.getState().editorReadOnlyMode).toBe(true)
  })

  it('starts new users with focus mode disabled', () => {
    expect(usePreferencesStore.getState().sidebarCollapsed).toBe(true)
    expect(usePreferencesStore.getState().rightSidebarCollapsed).toBe(true)
    expect(usePreferencesStore.getState().showEditorStatusBar).toBe(true)
    expect(usePreferencesStore.getState().immersiveFocusMode).toBe(false)
    expect(usePreferencesStore.getState().immersiveFocusScope).toBe('block')
    expect(usePreferencesStore.getState().immersiveFocusIntensity).toBe('standard')
  })

  it('enables background-only desktop notifications by default', () => {
    const store = usePreferencesStore.getState()

    expect(store.desktopNotificationsEnabled).toBe(true)
    expect(store.desktopNotificationsBackgroundOnly).toBe(true)
    expect(store.desktopNotificationExportsEnabled).toBe(true)
    expect(store.desktopNotificationSyncEnabled).toBe(true)
    expect(store.desktopNotificationUpdatesEnabled).toBe(true)

    store.setDesktopNotificationsEnabled(false)
    store.setDesktopNotificationsBackgroundOnly(false)
    store.setDesktopNotificationExportsEnabled(false)
    store.setDesktopNotificationSyncEnabled(false)
    store.setDesktopNotificationUpdatesEnabled(false)

    expect(usePreferencesStore.getState()).toMatchObject({
      desktopNotificationsEnabled: false,
      desktopNotificationsBackgroundOnly: false,
      desktopNotificationExportsEnabled: false,
      desktopNotificationSyncEnabled: false,
      desktopNotificationUpdatesEnabled: false,
    })
  })

  it('stores the graph minimap corner and compact size', () => {
    const store = usePreferencesStore.getState()

    expect(store.graphMiniMapPosition).toBe('bottom-right')
    expect(store.graphMiniMapSize).toBe('regular')
    store.setGraphMiniMapPosition('top-left')
    store.setGraphMiniMapSize('compact')

    expect(usePreferencesStore.getState()).toMatchObject({
      graphMiniMapPosition: 'top-left',
      graphMiniMapSize: 'compact',
    })
  })

  it('rehydrates graph minimap presentation preferences', async () => {
    storage.getItem.mockReturnValue({
      state: { graphMiniMapPosition: 'top-right', graphMiniMapSize: 'compact' },
      version: 2,
    })

    await usePreferencesStore.persist.rehydrate()

    expect(usePreferencesStore.getState()).toMatchObject({
      graphMiniMapPosition: 'top-right',
      graphMiniMapSize: 'compact',
    })
  })

  it('preserves an existing explicit focus mode preference', async () => {
    storage.getItem.mockReturnValue({
      state: {
        immersiveFocusIntensity: 'strong',
        immersiveFocusMode: true,
        immersiveFocusScope: 'section',
      },
      version: 2,
    })

    await usePreferencesStore.persist.rehydrate()

    expect(usePreferencesStore.getState().immersiveFocusMode).toBe(true)
    expect(usePreferencesStore.getState().immersiveFocusScope).toBe('section')
    expect(usePreferencesStore.getState().immersiveFocusIntensity).toBe('strong')
  })

  it('stores an optional terminal shell path', () => {
    const store = usePreferencesStore.getState()

    expect(store.terminalShellPath).toBeNull()
    store.setTerminalShellPath('C:\\Program Files\\PowerShell\\7\\pwsh.exe')

    expect(usePreferencesStore.getState().terminalShellPath).toBe(
      'C:\\Program Files\\PowerShell\\7\\pwsh.exe',
    )
  })

  it('preserves an existing preference to keep the inspector open', async () => {
    storage.getItem.mockReturnValue({ state: { rightSidebarCollapsed: false }, version: 2 })
    await usePreferencesStore.persist.rehydrate()
    expect(usePreferencesStore.getState().rightSidebarCollapsed).toBe(false)
  })

  it('uses the collapsed default when older preferences omit the inspector state', async () => {
    storage.getItem.mockReturnValue({ state: { sidebarCollapsed: false }, version: 2 })
    await usePreferencesStore.persist.rehydrate()
    expect(usePreferencesStore.getState().rightSidebarCollapsed).toBe(true)
  })
})
