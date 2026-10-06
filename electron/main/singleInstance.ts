import { app, type BrowserWindow } from 'electron'
import {
  createSingleInstancePayload,
  launchInfo,
  publishDeepLinksFromArgs,
  publishDeepLinkUrl,
  registerDeepLinkProtocol,
} from '@electron/main/deepLinks'
import { resolveExistingOpenTargets } from '@electron/main/openTargets'
import type { RuntimeEventQueue } from '@electron/main/runtimeEvents'
import type { Logger } from '@electron/services/logger'
import type { DeepLinkPayload } from '@electron/types'

type SingleInstanceOptions = Pick<
  RuntimeEventQueue,
  'queueDeepLinkPayload' | 'queueOrSendRuntimeEvent'
> & {
  bootstrap: () => Promise<void>
  getLogger: () => Logger
  getMainWindow: () => Pick<
    BrowserWindow,
    'focus' | 'isDestroyed' | 'isMinimized' | 'restore'
  > | null
  openSystemPath: (path: string, disposition: NativeOpenDisposition) => Promise<unknown>
  showMainWindow: () => void
}

export type NativeOpenDisposition = 'current' | 'new'

type PendingOpenTarget = {
  disposition: NativeOpenDisposition
  path: string
}

const focusMainWindow = (options: SingleInstanceOptions): boolean => {
  const main = options.getMainWindow()
  if (!main || main.isDestroyed()) return false

  options.showMainWindow()
  if (main.isMinimized()) main.restore()
  main.focus()
  return true
}

export const installSingleInstanceAndDeepLinks = (options: SingleInstanceOptions): void => {
  const pendingOpenTargets: PendingOpenTarget[] = []
  const queuedOpenTargets = new Set<string>()
  let bootstrapPromise: Promise<void> | null = null
  let primaryOpenTargetReserved = false

  const runBootstrap = (reason: string, afterBootstrap?: () => void): void => {
    if (!bootstrapPromise) {
      bootstrapPromise = options
        .bootstrap()
        .catch((error) => {
          options.getLogger().error('bootstrap failed', { error, reason })
          throw error
        })
        .finally(() => {
          bootstrapPromise = null
        })
    }
    void bootstrapPromise.then(afterBootstrap).catch(() => undefined)
  }

  const focusOrBootstrap = (reason: string, afterBootstrap?: () => void): void => {
    if (focusMainWindow(options)) return
    if (app.isReady()) runBootstrap(reason, afterBootstrap)
  }

  const flushOpenTargets = (): void => {
    if (!options.getMainWindow()) return
    const next = pendingOpenTargets.shift()
    if (!next) return
    queuedOpenTargets.delete(next.path)
    void options
      .openSystemPath(next.path, next.disposition)
      .catch((error) => {
        options.getLogger().warn('native open target failed', {
          error,
          target: next.path,
        })
      })
      .finally(flushOpenTargets)
  }

  const queueOpenTargets = (targets: string[], preferPrimaryWindow: boolean): void => {
    for (const target of targets) {
      if (queuedOpenTargets.has(target)) continue
      queuedOpenTargets.add(target)
      const usePrimaryWindow = preferPrimaryWindow && !primaryOpenTargetReserved
      if (usePrimaryWindow) primaryOpenTargetReserved = true
      pendingOpenTargets.push({
        disposition: usePrimaryWindow ? 'current' : 'new',
        path: target,
      })
    }
    if (targets.length > 0) {
      focusOrBootstrap('native-open-target', flushOpenTargets)
      flushOpenTargets()
    }
  }

  const resolveAndQueueOpenTargets = (
    args: readonly unknown[],
    cwd: string,
    preferPrimaryWindow: boolean,
  ): void => {
    void resolveExistingOpenTargets(args, cwd)
      .then((targets) => queueOpenTargets(targets, preferPrimaryWindow))
      .catch((error) => {
        options.getLogger().warn('native open target resolution failed', { error })
      })
  }

  const queueDeepLinkPayload = (payload: DeepLinkPayload): void => {
    options.queueDeepLinkPayload(payload)
  }

  publishDeepLinksFromArgs(launchInfo.args, 'startup', queueDeepLinkPayload)
  resolveAndQueueOpenTargets(launchInfo.args, launchInfo.cwd, true)

  app.on('open-url', (event, url) => {
    event.preventDefault()
    options.getLogger().info('deep link received from open-url')
    publishDeepLinkUrl(url, 'open-url', queueDeepLinkPayload)
    focusOrBootstrap('open-url')
  })

  app.on('open-file', (event, filePath) => {
    event.preventDefault()
    options.getLogger().info('native file open received')
    queueOpenTargets([filePath], !app.isReady())
  })

  if (!app.requestSingleInstanceLock()) {
    options.getLogger().warn('single instance lock unavailable, quitting')
    app.quit()
    return
  }

  registerDeepLinkProtocol(options.getLogger().child('deep-link'))

  app.on('second-instance', (_event, commandLine, workingDirectory) => {
    options.getLogger().info('second instance received')
    const payload = createSingleInstancePayload(commandLine, workingDirectory)
    focusOrBootstrap('second-instance')
    options.queueOrSendRuntimeEvent({ eventName: 'single-instance', payload })
    publishDeepLinksFromArgs(payload.args, 'second-instance', queueDeepLinkPayload)
    resolveAndQueueOpenTargets(payload.args, payload.cwd, false)
  })

  app.whenReady().then(() => {
    runBootstrap('ready', flushOpenTargets)
  })

  app.on('activate', () => {
    if (focusMainWindow(options)) return
    runBootstrap('activate', flushOpenTargets)
  })
}
