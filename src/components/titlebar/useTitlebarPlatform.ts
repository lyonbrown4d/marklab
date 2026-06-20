import { useCallback, useEffect, useState } from 'react'
import { inferPlatformFromUserAgent } from '@/runtime/environment'
import { getCurrentRuntimeWindow, isDesktopRuntime } from '@/runtime/window'
import { appApi, type AppPlatform } from '@/services/appApi'

export const useTitlebarPlatform = () => {
  const [platform, setPlatform] = useState<AppPlatform>(inferPlatformFromUserAgent())

  const getAppWindow = useCallback(async () => {
    return getCurrentRuntimeWindow()
  }, [])

  useEffect(() => {
    if (!isDesktopRuntime()) return
    void appApi
      .getPlatform()
      .then((next) => setPlatform(next))
      .catch(() => {})
  }, [])

  const isWindows =
    typeof window !== 'undefined' && window.navigator.userAgent.toLowerCase().includes('windows')

  return {
    platform,
    getAppWindow,
    isWindows,
    showInlineMenu: platform === 'windows' || platform === 'linux',
    isMacDesktop: platform === 'macos' && isDesktopRuntime(),
  }
}
