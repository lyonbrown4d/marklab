import type * as Electron from 'electron'

export const MARKLAB_APP_NAME = 'Marklab'
export const MARKLAB_APP_USER_MODEL_ID = 'app.marklab.desktop'

type AppIdentityTarget = Pick<
  Electron.App,
  'setAboutPanelOptions' | 'setAppUserModelId' | 'setName'
>

type WindowAppIdentityTarget = Pick<Electron.BrowserWindow, 'setAppDetails'>

export const configureAppIdentity = (
  app: AppIdentityTarget,
  platform: NodeJS.Platform | string = process.platform,
): void => {
  app.setName(MARKLAB_APP_NAME)
  if (platform === 'win32') app.setAppUserModelId(MARKLAB_APP_USER_MODEL_ID)
  app.setAboutPanelOptions({
    applicationName: MARKLAB_APP_NAME,
  })
}

export const configureWindowAppIdentity = (
  window: WindowAppIdentityTarget,
  appIconPath: string | null,
  platform: NodeJS.Platform | string = process.platform,
): void => {
  if (platform !== 'win32' || !appIconPath) return
  window.setAppDetails({
    appId: MARKLAB_APP_USER_MODEL_ID,
    appIconPath,
    appIconIndex: 0,
  })
}
