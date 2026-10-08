import { describe, expect, it, vi } from 'vitest'
import { configureAppIdentity, MARKLAB_APP_NAME } from '@electron/appIdentity'

describe('app identity', () => {
  it('sets the native app name on every platform', () => {
    const app = {
      setAboutPanelOptions: vi.fn(),
      setAppUserModelId: vi.fn(),
      setName: vi.fn(),
    }

    configureAppIdentity(app, 'darwin')

    expect(app.setName).toHaveBeenCalledWith(MARKLAB_APP_NAME)
    expect(app.setAppUserModelId).not.toHaveBeenCalled()
    expect(app.setAboutPanelOptions).toHaveBeenCalledWith({
      applicationName: MARKLAB_APP_NAME,
    })
  })

  it('sets the Windows AppUserModelID used by shortcuts and Jump Lists', () => {
    const app = {
      setAboutPanelOptions: vi.fn(),
      setAppUserModelId: vi.fn(),
      setName: vi.fn(),
    }

    configureAppIdentity(app, 'win32')

    expect(app.setAppUserModelId).toHaveBeenCalledWith('app.marklab.desktop')
  })
})
