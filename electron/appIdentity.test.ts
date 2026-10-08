import { describe, expect, it, vi } from 'vitest'
import {
  configureAppIdentity,
  configureWindowAppIdentity,
  MARKLAB_APP_NAME,
} from '@electron/appIdentity'

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

  it('sets an explicit Windows relaunch icon for the taskbar Jump List', () => {
    const window = { setAppDetails: vi.fn() }
    const iconPath = 'C:\\Program Files\\Marklab\\resources\\marklab.ico'

    configureWindowAppIdentity(window, iconPath, 'win32')

    expect(window.setAppDetails).toHaveBeenCalledWith({
      appId: 'app.marklab.desktop',
      appIconPath: iconPath,
      appIconIndex: 0,
    })
  })

  it('does not set Windows taskbar details on other platforms', () => {
    const window = { setAppDetails: vi.fn() }

    configureWindowAppIdentity(window, '/opt/marklab/marklab.png', 'linux')

    expect(window.setAppDetails).not.toHaveBeenCalled()
  })
})
