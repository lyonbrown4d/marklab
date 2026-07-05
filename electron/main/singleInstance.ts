import { app, type BrowserWindow } from 'electron'
import type { ElectronContainer } from '@electron/container.js'
import {
  createSingleInstancePayload,
  launchInfo,
  publishDeepLinksFromArgs,
  publishDeepLinkUrl,
  registerDeepLinkProtocol,
} from '@electron/main/deepLinks.js'
import { resolveExistingOpenTargets } from '@electron/main/openTargets.js'
import type { RuntimeEventQueue } from '@electron/main/runtimeEvents.js'
import type { DeepLinkPayload } from '@electron/types.js'

type SingleInstanceOptions = Pick<
  RuntimeEventQueue,
  'queueDeepLinkPayload' | 'queueOrSendRuntimeEvent'
> & {
  bootstrap: () => Promise<void>
  getContainer: () => ElectronContainer
  getMainWindow: () => BrowserWindow | null
  openSystemPath: (path: string) => Promise<unknown>
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

const runBootstrap = (
  options: SingleInstanceOptions,
  reason: string,
  afterBootstrap?: () => void,
): void => {
  void options
    .bootstrap()
    .then(() => {
      afterBootstrap?.()
    })
    .catch((error) => {
      options.getContainer().cradle.logger.error('bootstrap failed', { error, reason })
      throw error
    })
}

const focusOrBootstrap = (
  options: SingleInstanceOptions,
  reason: string,
  afterBootstrap?: () => void,
): void => {
  if (focusMainWindow(options)) return
  if (app.isReady()) runBootstrap(options, reason, afterBootstrap)
}

export const installSingleInstanceAndDeepLinks = (options: SingleInstanceOptions): void => {
  const pendingOpenTargets: string[] = []
  const queuedOpenTargets = new Set<string>()

  const flushOpenTargets = (): void => {
    if (!options.getMainWindow()) return
    const target = pendingOpenTargets.shift()
    if (!target) return
    queuedOpenTargets.delete(target)
    void options
      .openSystemPath(target)
      .catch((error) => {
        options.getContainer().cradle.logger.warn('native open target failed', { error, target })
      })
      .finally(flushOpenTargets)
  }

  const queueOpenTargets = (targets: string[]): void => {
    for (const target of targets) {
      if (queuedOpenTargets.has(target)) continue
      queuedOpenTargets.add(target)
      pendingOpenTargets.push(target)
    }
    if (targets.length > 0) {
      focusOrBootstrap(options, 'native-open-target', flushOpenTargets)
      flushOpenTargets()
    }
  }

  const resolveAndQueueOpenTargets = (args: readonly unknown[], cwd: string): void => {
    void resolveExistingOpenTargets(args, cwd)
      .then(queueOpenTargets)
      .catch((error) => {
        options.getContainer().cradle.logger.warn('native open target resolution failed', { error })
      })
  }

  const queueDeepLinkPayload = (payload: DeepLinkPayload): void => {
    options.queueDeepLinkPayload(payload)
  }

  publishDeepLinksFromArgs(launchInfo.args, 'startup', queueDeepLinkPayload)
  resolveAndQueueOpenTargets(launchInfo.args, launchInfo.cwd)

  app.on('open-url', (event, url) => {
    event.preventDefault()
    options.getContainer().cradle.logger.info('deep link received from open-url')
    publishDeepLinkUrl(url, 'open-url', queueDeepLinkPayload)
    focusOrBootstrap(options, 'open-url')
  })

  app.on('open-file', (event, filePath) => {
    event.preventDefault()
    options.getContainer().cradle.logger.info('native file open received')
    queueOpenTargets([filePath])
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
    resolveAndQueueOpenTargets(payload.args, payload.cwd)
  })

  app.whenReady().then(() => {
    runBootstrap(options, 'ready', flushOpenTargets)
  })

  app.on('activate', () => {
    if (focusMainWindow(options)) return
    runBootstrap(options, 'activate', flushOpenTargets)
  })
}
