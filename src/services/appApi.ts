import { dispatchMenuAction, getLaunchInfo, getPlatform } from '@/runtime/app'

export type AppPlatform = 'windows' | 'linux' | 'macos' | 'unknown'
export type AppLaunchInfo = Awaited<ReturnType<typeof getLaunchInfo>>

export const appApi = {
  getPlatform,
  getLaunchInfo,
  menuDispatch(id: string) {
    return dispatchMenuAction(id)
  },
}
