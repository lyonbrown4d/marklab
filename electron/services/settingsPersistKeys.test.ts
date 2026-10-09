import { describe, expect, it } from 'vitest'
import {
  drawioStateKeys,
  preferenceStateKeys,
  rendererPersistKeys,
} from '@electron/services/settingsPersistKeys'

describe('settingsPersistKeys', () => {
  it('allows drawio settings through the renderer persist boundary', () => {
    expect(rendererPersistKeys.has('marklab.drawio')).toBe(true)
    expect(drawioStateKeys.has('drawioEditorMode')).toBe(true)
    expect(drawioStateKeys.has('drawioEmbedUrl')).toBe(true)
  })

  it('allows AI completion preferences through the renderer persist boundary', () => {
    expect(preferenceStateKeys).toEqual(
      expect.objectContaining({
        has: expect.any(Function),
      }),
    )
    expect(preferenceStateKeys.has('aiCompletionEnabled')).toBe(true)
    expect(preferenceStateKeys.has('aiCompletionProviderId')).toBe(true)
    expect(preferenceStateKeys.has('aiCompletionTriggerMode')).toBe(true)
    expect(preferenceStateKeys.has('aiCompletionLength')).toBe(true)
    expect(preferenceStateKeys.has('aiCompletionNearbyContextEnabled')).toBe(true)
    expect(preferenceStateKeys.has('aiCompletionCloudContextConsent')).toBe(true)
    expect(preferenceStateKeys.has('documentCompletionEnabled')).toBe(true)
  })

  it('allows the terminal shell preference through the renderer persist boundary', () => {
    expect(preferenceStateKeys.has('terminalShellPath')).toBe(true)
  })

  it('allows graph minimap presentation preferences through the renderer persist boundary', () => {
    expect(preferenceStateKeys.has('graphMiniMapPosition')).toBe(true)
    expect(preferenceStateKeys.has('graphMiniMapSize')).toBe(true)
  })

  it('allows desktop notification preferences through the renderer persist boundary', () => {
    expect(preferenceStateKeys.has('desktopNotificationsEnabled')).toBe(true)
    expect(preferenceStateKeys.has('desktopNotificationsBackgroundOnly')).toBe(true)
    expect(preferenceStateKeys.has('desktopNotificationExportsEnabled')).toBe(true)
    expect(preferenceStateKeys.has('desktopNotificationSyncEnabled')).toBe(true)
    expect(preferenceStateKeys.has('desktopNotificationUpdatesEnabled')).toBe(true)
  })
})
