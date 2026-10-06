import type { Event, Session, WebContents } from 'electron'

import { normalizeWebTabUrl } from '@electron/services/webTabs/webTabUrl'

const configuredSessions = new WeakSet<Session>()

export const configureWebTabSession = (session: Session): void => {
  if (configuredSessions.has(session)) return
  configuredSessions.add(session)
  session.setPermissionCheckHandler(() => false)
  session.setPermissionRequestHandler((_webContents, _permission, callback) => callback(false))
  session.setDevicePermissionHandler(() => false)
  session.setDisplayMediaRequestHandler((_request, callback) => callback({}))
  session.on('will-download', (event) => event.preventDefault())
}

export const installNavigationGuard = (webContents: WebContents): void => {
  const guard = (event: Event, url: string): void => {
    try {
      normalizeWebTabUrl(url)
    } catch {
      event.preventDefault()
    }
  }
  webContents.on('will-navigate', guard)
  webContents.on('will-redirect', guard)
}
