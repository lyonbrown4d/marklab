import type {
  NativeCommandRequest,
  RuntimeCommandName,
  RuntimeCommandParameters,
  RuntimeCommandResult,
} from '@/runtime/tauri/contract'
import { isTauri } from '@tauri-apps/api/core'
import type { DesktopRuntimeApi } from '@/runtime/desktop'
import { createGitApi } from '@/runtime/tauri/git'
import { createNativeApis } from '@/runtime/tauri/native'
import { createEventHub, invokeWorkspaceCommand, request } from '@/runtime/tauri/transport'
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
    const seed = await request('workspace_session_seed')
    // A live change received while awaiting the snapshot is newer than it.
    if (seed && !events.has('workspace-session-seed'))
      events.publish('workspace-session-seed', seed)
  } catch (error) {
    windows.dispose()
    events.dispose()
    throw error
  }

  const appReady: DesktopRuntimeApi['appReady'] = (signal = { phase: 'shell' }) => {
    const attempt = events.attempt()
    return request('app_ready', { ...signal, ...(attempt !== undefined ? { attempt } : {}) })
  }
  const api: DesktopRuntimeApi = {
    ...createNativeApis(events),
    ...createWorkspaceApis(events),
    appReady,
    lifecycle: { getLaunchInfo: () => request('lifecycle_get_launch_info') },
    platform: { get: () => request('app_get_platform') },
    commands: {
      invoke: <C extends RuntimeCommandName>(
        command: C,
        ...args: RuntimeCommandParameters<C>
      ): Promise<RuntimeCommandResult<C>> =>
        command === 'app-ready'
          ? (appReady(args[0] as NativeCommandRequest<'app_ready'>) as Promise<
              RuntimeCommandResult<C>
            >)
          : invokeWorkspaceCommand(command, ...args),
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
  // Publish only after native subscriptions and workspace recovery are ready.
  window.marklabTauri = api
}
