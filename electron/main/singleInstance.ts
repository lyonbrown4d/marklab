import { app, type BrowserWindow } from 'electron'
import type { ElectronContainer } from '@electron/container.js'
import {
  createSingleInstancePayload,
  launchInfo,
  publishDeepLinksFromArgs,
  publishDeepLinkUrl,
  registerDeepLinkProtocol,
} from '@electron/main/deepLinks.js'
import type { RuntimeEventQueue } from '@electron/main/runtimeEvents.js'
import type { DeepLinkPayload } from '@electron/types.js'

type SingleInstanceOptions = Pick<
  RuntimeEventQueue,
  'queueDeepLinkPayload' | 'queueOrSendRuntimeEvent'
> & {
  bootstrap: () => Promise<void>
  getContainer: () => ElectronContainer
  getMainWindow: () => BrowserWindow | null
  showMainWindow: () => void
}

const focusMainWindow = (options: SingleInstanceOptions): boolean => {
  const main = options.getMainWindow()
  if (!main || main.isDestroyed()) return false

  options.showMainWindow()
  if (main.isMinimized()) main.restore()
  main.focus()
  return true
}

const runBootstrap = (options: SingleInstanceOptions, reason: string): void => {
  void options.bootstrap().catch((error) => {
    options.getContainer().cradle.logger.error('bootstrap failed', { error, reason })
    throw error
  })
}

const focusOrBootstrap = (options: SingleInstanceOptions, reason: string): void => {
  if (focusMainWindow(options)) return
  if (app.isReady()) runBootstrap(options, reason)
}

export const installSingleInstanceAndDeepLinks = (options: SingleInstanceOptions): void => {
  const queueDeepLinkPayload = (payload: DeepLinkPayload): void => {
    options.queueDeepLinkPayload(payload)
  }

  publishDeepLinksFromArgs(launchInfo.args, 'startup', queueDeepLinkPayload)

  app.on('open-url', (event, url) => {
    event.preventDefault()
    options.getContainer().cradle.logger.info('deep link received from open-url')
    publishDeepLinkUrl(url, 'open-url', queueDeepLinkPayload)
    focusOrBootstrap(options, 'open-url')
  })

  if (!app.requestSingleInstanceLock()) {
    options.getContainer().cradle.logger.warn('single instance lock unavailable, quitting')
    app.quit()
    return
  }

  registerDeepLinkProtocol(options.getContainer().cradle.logger.child('deep-link'))

  app.on('second-instance', (_event, commandLine, workingDirectory) => {
    options.getContainer().cradle.logger.info('second instance received')
    const payload = createSingleInstancePayload(commandLine, workingDirectory)
    focusOrBootstrap(options, 'second-instance')
    options.queueOrSendRuntimeEvent({ eventName: 'single-instance', payload })
    publishDeepLinksFromArgs(payload.args, 'second-instance', queueDeepLinkPayload)
  })

  app.whenReady().then(() => {
    runBootstrap(options, 'ready')
  })

  app.on('activate', () => {
    if (focusMainWindow(options)) return
    runBootstrap(options, 'activate')
  })
}
