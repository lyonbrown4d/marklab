import { describe, expect, it, vi } from 'vitest'
import { configureAppIdentity, MARKLAB_APP_NAME } from '@electron/appIdentity.js'

describe('app identity', () => {
  it('sets the native app name used by macOS menus in development', () => {
    const app = {
      setAboutPanelOptions: vi.fn(),
      setName: vi.fn(),
    }

    configureAppIdentity(app)

    expect(app.setName).toHaveBeenCalledWith(MARKLAB_APP_NAME)
    expect(app.setAboutPanelOptions).toHaveBeenCalledWith({
      applicationName: MARKLAB_APP_NAME,
    })
  })
})
