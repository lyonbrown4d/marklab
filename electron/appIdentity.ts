import type * as Electron from 'electron'

export const MARKLAB_APP_NAME = 'Marklab'
export const MARKLAB_APP_USER_MODEL_ID = 'app.marklab.desktop'

type AppIdentityTarget = Pick<
  Electron.App,
  'setAboutPanelOptions' | 'setAppUserModelId' | 'setName'
>

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
