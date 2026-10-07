import { shell, type BrowserWindow, type HandlerDetails } from 'electron'

const isExternalWebUrl = (value: string): boolean => {
  try {
    const protocol = new URL(value).protocol
    return protocol === 'http:' || protocol === 'https:'
  } catch {
    return false
  }
}

export const installWindowNavigationGuard = (
  window: BrowserWindow,
  appShellUrls: readonly string[],
): void => {
  const allowedNavigationUrls = new Set(appShellUrls)

  window.webContents.setWindowOpenHandler((details: HandlerDetails) => {
    if (details.postBody === undefined && isExternalWebUrl(details.url)) {
      void shell.openExternal(details.url).catch(() => undefined)
    }
    return { action: 'deny' }
  })

  window.webContents.on('will-navigate', (details) => {
    if (!allowedNavigationUrls.has(details.url)) details.preventDefault()
  })
}
