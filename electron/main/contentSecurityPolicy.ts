import { app, session } from 'electron'

let cspInstalled = false

export const installContentSecurityPolicy = (): void => {
  if (cspInstalled) return
  cspInstalled = true
  const contentSecurityPolicy = createContentSecurityPolicy()

  session.defaultSession.webRequest.onHeadersReceived((details, callback) => {
    if (!shouldApplyMarklabCsp(details.url)) {
      callback({ responseHeaders: details.responseHeaders })
      return
    }

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
  const isDev = !app.isPackaged
  const scriptSources = ["'self'", 'blob:']
  const styleSources = ["'self'", "'unsafe-inline'"]
  const fontSources = ["'self'", 'data:']
  const connectSources = [
    "'self'",
    'marklab-asset:',
    'http://localhost:*',
    'http://127.0.0.1:*',
    'ws://localhost:*',
    'ws://127.0.0.1:*',
  ]
  if (isDev) {
    scriptSources.push("'unsafe-eval'")
    scriptSources.push("'unsafe-inline'")
    styleSources.push('https://fonts.googleapis.com')
    fontSources.push('https://fonts.gstatic.com')
    connectSources.push('https://fonts.googleapis.com', 'https://www.react-grab.com')
  }
  if (!app.isPackaged && process.env.VITE_REACT_DEVTOOLS === 'true') {
    scriptSources.push('http://localhost:8097')
  }

  return [
    "default-src 'self'",
    "base-uri 'self'",
    "object-src 'none'",
    `script-src ${scriptSources.join(' ')}`,
    `style-src ${styleSources.join(' ')}`,
    "img-src 'self' data: blob: file: marklab-asset: http: https:",
    `font-src ${fontSources.join(' ')}`,
    `connect-src ${connectSources.join(' ')}`,
    "media-src 'self' data: blob: file: marklab-asset:",
    "frame-src 'self' https:",
    "child-src 'self' https:",
    "worker-src 'self' blob:",
  ].join('; ')
}

const shouldApplyMarklabCsp = (value: string): boolean => {
  try {
    const url = new URL(value)
    if (url.protocol === 'file:' || url.protocol === 'marklab-asset:') return true
    if (url.protocol !== 'http:') return false
    return ['localhost', '127.0.0.1', '[::1]'].includes(url.hostname)
  } catch {
    return false
  }
}
