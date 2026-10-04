import type { Session } from 'electron'

type CaptureSession = Pick<
  Session,
  | 'on'
  | 'setDevicePermissionHandler'
  | 'setDisplayMediaRequestHandler'
  | 'setPermissionCheckHandler'
  | 'setPermissionRequestHandler'
  | 'webRequest'
>

const ALLOWED_CAPTURE_PROTOCOLS = new Set(['blob:', 'data:', 'http:', 'https:'])
const ALLOWED_ABOUT_PAGES = new Set(['about:blank', 'about:srcdoc'])

export const installWebPreviewSessionSecurity = (session: CaptureSession): void => {
  session.setPermissionCheckHandler(() => false)
  session.setPermissionRequestHandler((_webContents, _permission, callback) => callback(false))
  session.setDevicePermissionHandler(() => false)
  session.setDisplayMediaRequestHandler((_request, callback) => callback({}))
  session.on('will-download', (event) => event.preventDefault())
  session.webRequest.onBeforeRequest((details, callback) => {
    try {
      const url = new URL(details.url)
      const allowed =
        ALLOWED_CAPTURE_PROTOCOLS.has(url.protocol) || ALLOWED_ABOUT_PAGES.has(url.href)
      callback({ cancel: !allowed })
    } catch {
      callback({ cancel: true })
    }
  })
}
