import {
  dispatchMenuAction,
  getLaunchInfo,
  getPlatform,
  openCurrentWorkspaceInNewWindow,
  openPathInNewWindow,
} from '@/runtime/app'

export type AppPlatform = 'windows' | 'linux' | 'macos' | 'unknown'
export type AppLaunchInfo = Awaited<ReturnType<typeof getLaunchInfo>>
export type AppWindowOpenResult = Awaited<ReturnType<typeof openCurrentWorkspaceInNewWindow>>

export const appApi = {
  getPlatform,
  getLaunchInfo,
  openCurrentWorkspaceInNewWindow,
  openPathInNewWindow,
  menuDispatch(id: string) {
    return dispatchMenuAction(id)
  },
}
