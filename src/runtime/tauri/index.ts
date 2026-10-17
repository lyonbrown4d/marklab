import { isTauri } from '@tauri-apps/api/core'
import type { RendererSafeElectronApi } from '@/runtime/electron'
import type { WorkspaceSessionSeedPayload } from '@/runtime/rendererLifecycle'
import { createGitApi } from '@/runtime/tauri/git'
import { createNativeApis } from '@/runtime/tauri/native'
import { createEventHub, invokeLegacyCommand, request } from '@/runtime/tauri/transport'
import { createWindowApis } from '@/runtime/tauri/window'
import { createWorkspaceApis, createWorkspaceSyncApi } from '@/runtime/tauri/workspace'

let installation: Promise<void> | null = null

export const initializeDesktopRuntime = (): Promise<void> => {
  if (!isTauri()) return Promise.resolve()
  if (installation) return installation
  const operation = installRuntime().catch((error: unknown) => {
    installation = null
    throw error
  })
  installation = operation
  return operation
}

const installRuntime = async (): Promise<void> => {
  const events = createEventHub()
  const windows = createWindowApis(events)
  try {
    await events.install()
    await windows.install()
    const seed = await request<WorkspaceSessionSeedPayload | null>('workspace_session_seed')
    // A live change received while awaiting the snapshot is newer than it.
    if (seed && !events.has('workspace-session-seed'))
      events.publish('workspace-session-seed', seed)
  } catch (error) {
    windows.dispose()
    events.dispose()
    throw error
  }

  const appReady: RendererSafeElectronApi['appReady'] = (signal = { phase: 'shell' }) => {
    const attempt = events.attempt()
    return request('app_ready', { ...signal, ...(attempt !== undefined ? { attempt } : {}) })
  }
  const api: RendererSafeElectronApi = {
    ...createNativeApis(events),
    ...createWorkspaceApis(events),
    appReady,
    lifecycle: { getLaunchInfo: () => request('lifecycle_get_launch_info') },
    platform: { get: () => request('app_get_platform') },
    commands: {
      invoke: <T>(command: string, payload?: Record<string, unknown>): Promise<T> =>
        command === 'app-ready'
          ? (appReady(payload as Parameters<typeof appReady>[0]) as Promise<T>)
          : invokeLegacyCommand<T>(command, payload),
    },
    events: { listen: events.subscribe },
    git: createGitApi(),
    menu: {
      dispatch: (id) => request('menu_dispatch', { id }),
      onCommand: (handler) => events.on('menu-action', handler),
    },
    opening: {
      onProgress: (handler) => events.on('window-opening-progress', handler),
      retry: () => request('retry_window_open'),
    },
    workspaceSync: createWorkspaceSyncApi(events),
    window: windows.window,
    webview: windows.webview,
  }
  // Existing services retain their narrow typed domain surface while the
  // compatibility name remains available to the current renderer test suite.
  window.marklabTauri = api
}
