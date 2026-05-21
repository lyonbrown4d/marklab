import { app, session } from 'electron'

let cspInstalled = false

export const installContentSecurityPolicy = (): void => {
  if (cspInstalled) return
  cspInstalled = true
  const contentSecurityPolicy = createContentSecurityPolicy()

  session.defaultSession.webRequest.onHeadersReceived((details, callback) => {
    const responseHeaders = { ...details.responseHeaders }
    for (const headerName of Object.keys(responseHeaders)) {
      if (headerName.toLowerCase() === 'content-security-policy') {
        delete responseHeaders[headerName]
      }
    }
    responseHeaders['Content-Security-Policy'] = [contentSecurityPolicy]
    callback({ responseHeaders })
  })
}

const createContentSecurityPolicy = (): string => {
  const scriptSources = ["'self'", 'blob:']
  if (!app.isPackaged && process.env.VITE_REACT_DEVTOOLS === 'true') {
    scriptSources.push('http://localhost:8097')
  }

  return [
    "default-src 'self'",
    "base-uri 'self'",
    "object-src 'none'",
    `script-src ${scriptSources.join(' ')}`,
    "style-src 'self' 'unsafe-inline'",
    "img-src 'self' data: blob: file: marko-asset: http: https:",
    "font-src 'self' data:",
    "connect-src 'self' marko-asset: http://localhost:* http://127.0.0.1:* ws://localhost:* ws://127.0.0.1:*",
    "media-src 'self' data: blob: file: marko-asset:",
    "worker-src 'self' blob:",
  ].join('; ')
}
