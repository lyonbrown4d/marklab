import { signalAppReady } from '@/runtime/app'
import { listen } from '@/runtime/events'
import { rendererDiagnostics } from '@/services/rendererDiagnostics'
import type { RendererReadySignal } from '@/types/rendererReady'

export type WorkspaceSessionSeedPayload = {
  state?: Record<string, unknown>
  version?: number
}

type SeedListener = (payload: WorkspaceSessionSeedPayload) => void

let bridgeInstallation: Promise<void> | null = null
let pendingSeed: WorkspaceSessionSeedPayload | null = null
const seedListeners = new Set<SeedListener>()
const interactiveListeners = new Set<() => void>()

export const isStandbyRenderer = (): boolean =>
  typeof window !== 'undefined' &&
  new URLSearchParams(window.location.search).get('marklab-standby') === '1'

export const acceptWorkspaceSessionSeed = (payload: WorkspaceSessionSeedPayload): void => {
  pendingSeed = payload
  for (const listener of seedListeners) listener(payload)
}

export const installWorkspaceSessionSeedBridge = (): Promise<void> => {
  if (bridgeInstallation) return bridgeInstallation
  const installation = listen<WorkspaceSessionSeedPayload>('workspace-session-seed', (event) =>
    acceptWorkspaceSessionSeed(event.payload),
  ).then(() => undefined)
  const guardedInstallation = installation.catch((error: unknown) => {
    if (bridgeInstallation === guardedInstallation) bridgeInstallation = null
    throw error
  })
  bridgeInstallation = guardedInstallation
  return bridgeInstallation
}

const errorMessage = (error: unknown): string => {
  try {
    return error instanceof Error ? error.message : String(error)
  } catch {
    return 'Workspace seed bridge installation failed.'
  }
}

export const initializeRendererLifecycle = async (): Promise<void> => {
  try {
    await installWorkspaceSessionSeedBridge()
  } catch (error) {
    rendererDiagnostics.error('app.lifecycle', 'workspace-seed-bridge-install-failed', error)
    try {
      await signalRendererReady({ error: errorMessage(error), phase: 'workspace-error' })
    } catch (reportError) {
      rendererDiagnostics.error(
        'app.lifecycle',
        'workspace-seed-bridge-failure-report-failed',
        reportError,
      )
    }
  }
}

export const hasPendingWorkspaceSessionSeed = (): boolean => pendingSeed !== null

export const consumeWorkspaceSessionSeed = (payload: WorkspaceSessionSeedPayload): void => {
  if (pendingSeed === payload) pendingSeed = null
}

export const onWorkspaceSessionSeed = (listener: SeedListener): (() => void) => {
  seedListeners.add(listener)
  if (pendingSeed) listener(pendingSeed)
  return () => seedListeners.delete(listener)
}

export const notifyRendererInteractive = (): void => {
  for (const listener of interactiveListeners) listener()
}

export const onRendererInteractive = (listener: () => void): (() => void) => {
  interactiveListeners.add(listener)
  return () => interactiveListeners.delete(listener)
}

export const signalRendererReady = async (signal: RendererReadySignal): Promise<void> => {
  await signalAppReady(signal)
  if (signal.phase === 'workspace-interactive') notifyRendererInteractive()
}

const nextAnimationFrame = (): Promise<void> =>
  new Promise((resolve) => window.requestAnimationFrame(() => resolve()))

const INITIAL_CONTENT_LOADING_SELECTOR =
  '[data-editor-loading="true"], [data-testid="markdown-editor"][data-state="loading"]'
const INITIAL_CONTENT_READY_TIMEOUT_MS = 30_000

const waitForInitialContentReady = (): Promise<void> => {
  if (!document.querySelector(INITIAL_CONTENT_LOADING_SELECTOR)) return Promise.resolve()
  return new Promise((resolve) => {
    let settled = false
    const finish = (): void => {
      if (settled) return
      settled = true
      observer.disconnect()
      window.clearTimeout(timeout)
      resolve()
    }
    const check = (): void => {
      if (!document.querySelector(INITIAL_CONTENT_LOADING_SELECTOR)) finish()
    }
    const observer = new MutationObserver(check)
    const timeout = window.setTimeout(finish, INITIAL_CONTENT_READY_TIMEOUT_MS)
    observer.observe(document.body, {
      attributeFilter: ['data-editor-loading', 'data-state'],
      attributes: true,
      childList: true,
      subtree: true,
    })
    check()
  })
}

export const waitForWorkspaceInteractivePaint = async (): Promise<void> => {
  await nextAnimationFrame()
  await nextAnimationFrame()
  await waitForInitialContentReady()
  await nextAnimationFrame()
}
