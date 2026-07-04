import type * as Electron from 'electron'

export const MARKLAB_APP_NAME = 'Marklab'

type AppIdentityTarget = Pick<Electron.App, 'setAboutPanelOptions' | 'setName'>

export const configureAppIdentity = (app: AppIdentityTarget): void => {
  app.setName(MARKLAB_APP_NAME)
  app.setAboutPanelOptions({
    applicationName: MARKLAB_APP_NAME,
  })
}
