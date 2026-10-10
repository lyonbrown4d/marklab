import { app, type BrowserWindow } from 'electron'
import {
  createSingleInstancePayload,
  launchInfo,
  publishDeepLinksFromArgs,
  publishDeepLinkUrl,
  registerDeepLinkProtocol,
} from '@electron/main/deepLinks'
import {
  runNativeOpenWithStartupTimeout,
  scheduleInitialNativeOpenTimeout,
} from '@electron/main/initialNativeOpen'
import { collectOpenTargetCandidates, resolveExistingOpenTargets } from '@electron/main/openTargets'
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
  holdInitialPresentationUntil: (settled: Promise<void>) => void
  openSystemPath: (
    path: string,
    disposition: NativeOpenDisposition,
    options?: { signal?: AbortSignal; startup?: boolean },
  ) => Promise<unknown>
  showMainWindow: () => void
}

export type NativeOpenDisposition = 'current' | 'new'
export { createInitialNativeOpenPresentationGate } from '@electron/main/initialNativeOpen'

type PendingOpenTarget = {
  disposition: NativeOpenDisposition
  path: string
  settle?: () => void
  startup: boolean
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
  const initialOpenTargetCandidates = collectOpenTargetCandidates(launchInfo.args, launchInfo.cwd)
  const initialFailoverOpenTargets = new Set<string>()
  const pendingOpenTargets: PendingOpenTarget[] = []
  const trackedOpenTargets = new Map<string, PendingOpenTarget>()
  let activeInitialSettle: (() => void) | null = null
  let bootstrapPromise: Promise<void> | null = null
  let initialOpenTargetResolutionCompleted = initialOpenTargetCandidates.length === 0
  let initialOpenTargetResolutionPending = initialOpenTargetCandidates.length > 0
  let initialOpenTargetResolutionTimedOut = false
  let processingOpenTarget: PendingOpenTarget | null = null
  let primaryOpenTargetReserved = false

  const ensureInitialPresentationGate = (): (() => void) => {
    if (activeInitialSettle) return activeInitialSettle
    let resolveGate!: () => void
    const settled = new Promise<void>((resolve) => {
      resolveGate = resolve
    })
    const settle = (): void => {
      if (activeInitialSettle !== settle) return
      activeInitialSettle = null
      resolveGate()
    }
    activeInitialSettle = settle
    options.holdInitialPresentationUntil(settled)
    return settle
  }

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
    if (initialOpenTargetResolutionPending || processingOpenTarget || !options.getMainWindow()) {
      return
    }
    const next = pendingOpenTargets.shift()
    if (!next) return
    if (initialOpenTargetResolutionTimedOut && !initialOpenTargetResolutionCompleted) {
      initialFailoverOpenTargets.add(next.path)
    }
    processingOpenTarget = next
    runNativeOpenWithStartupTimeout({
      logger: options.getLogger(),
      onFinished: () => {
        if (trackedOpenTargets.get(next.path) === next) trackedOpenTargets.delete(next.path)
        if (processingOpenTarget === next) processingOpenTarget = null
        next.settle?.()
        flushOpenTargets()
      },
      openSystemPath: options.openSystemPath,
      request: next,
    })
  }

  const queueOpenTargets = (
    targets: string[],
    preferPrimaryWindow: boolean,
    settleStartup?: () => void,
    trackInitialFailover = true,
  ): boolean => {
    let retainedStartupTarget = false
    for (const target of targets) {
      if (
        trackInitialFailover &&
        initialOpenTargetResolutionTimedOut &&
        !initialOpenTargetResolutionCompleted
      ) {
        initialFailoverOpenTargets.add(target)
      }
      const trackedTarget = trackedOpenTargets.get(target)
      if (trackedTarget) {
        if (preferPrimaryWindow) {
          if (!trackedTarget.startup && !primaryOpenTargetReserved) {
            trackedTarget.disposition = 'current'
            trackedTarget.settle = settleStartup
            trackedTarget.startup = true
            primaryOpenTargetReserved = true
          }
          retainedStartupTarget ||= trackedTarget.startup && trackedTarget.settle === settleStartup
        }
        continue
      }
      const usePrimaryWindow = preferPrimaryWindow && !primaryOpenTargetReserved
      if (usePrimaryWindow) primaryOpenTargetReserved = true
      retainedStartupTarget ||= usePrimaryWindow
      const pendingTarget: PendingOpenTarget = {
        disposition: usePrimaryWindow ? 'current' : 'new',
        path: target,
        settle: usePrimaryWindow ? settleStartup : undefined,
        startup: usePrimaryWindow,
      }
      trackedOpenTargets.set(target, pendingTarget)
      pendingOpenTargets.push(pendingTarget)
    }
    if (targets.length > 0) {
      const main = options.getMainWindow()
      if (retainedStartupTarget) {
        if ((!main || main.isDestroyed()) && app.isReady()) {
          runBootstrap('native-open-target', flushOpenTargets)
        }
      } else {
        focusOrBootstrap('native-open-target', flushOpenTargets)
      }
      flushOpenTargets()
    }
    return retainedStartupTarget
  }

  const resolveAndQueueOpenTargets = (
    args: readonly unknown[],
    cwd: string,
    preferPrimaryWindow: boolean,
    settleStartup?: () => void,
    onSettled?: () => void,
    isInitialResolution = false,
  ): void => {
    void resolveExistingOpenTargets(args, cwd)
      .then((targets) => {
        const startupActive = !isInitialResolution || !initialOpenTargetResolutionTimedOut
        const resolvedTargets =
          isInitialResolution && !startupActive
            ? targets.filter((target) => !initialFailoverOpenTargets.has(target))
            : targets
        const activeSettle = startupActive ? settleStartup : undefined
        if (resolvedTargets.length === 0) {
          if (!primaryOpenTargetReserved) activeSettle?.()
          return
        }
        const retainedStartupTarget = queueOpenTargets(
          resolvedTargets,
          startupActive ? preferPrimaryWindow : false,
          activeSettle,
          !isInitialResolution,
        )
        if (activeSettle && !retainedStartupTarget && !primaryOpenTargetReserved) {
          activeSettle()
        }
      })
      .catch((error) => {
        options.getLogger().warn('native open target resolution failed', { error })
        if (!primaryOpenTargetReserved) settleStartup?.()
      })
      .finally(onSettled)
  }

  const queueDeepLinkPayload = (payload: DeepLinkPayload): void => {
    options.queueDeepLinkPayload(payload)
  }

  publishDeepLinksFromArgs(launchInfo.args, 'startup', queueDeepLinkPayload)
  if (initialOpenTargetCandidates.length > 0) {
    const settleStartup = ensureInitialPresentationGate()
    const cancelResolutionTimeout = scheduleInitialNativeOpenTimeout({
      logger: options.getLogger(),
      onTimeout: () => {
        initialOpenTargetResolutionTimedOut = true
        initialOpenTargetResolutionPending = false
        if (!primaryOpenTargetReserved) settleStartup()
        flushOpenTargets()
      },
      phase: 'resolution',
    })
    resolveAndQueueOpenTargets(
      launchInfo.args,
      launchInfo.cwd,
      true,
      settleStartup,
      () => {
        cancelResolutionTimeout()
        initialOpenTargetResolutionCompleted = true
        initialOpenTargetResolutionPending = false
        initialFailoverOpenTargets.clear()
        flushOpenTargets()
      },
      true,
    )
  }

  app.on('open-url', (event, url) => {
    event.preventDefault()
    options.getLogger().info('deep link received from open-url')
    publishDeepLinkUrl(url, 'open-url', queueDeepLinkPayload)
    focusOrBootstrap('open-url')
  })

  app.on('open-file', (event, filePath) => {
    event.preventDefault()
    options.getLogger().info('native file open received')
    const startup = !app.isReady()
    queueOpenTargets([filePath], startup, startup ? ensureInitialPresentationGate() : undefined)
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
