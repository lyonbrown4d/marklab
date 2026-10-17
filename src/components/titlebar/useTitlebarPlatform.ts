import { useCallback, useEffect, useState } from 'react'
import { inferPlatformFromUserAgent } from '@/runtime/environment'
import { getCurrentRuntimeWindow, isDesktopRuntime } from '@/runtime/window'
import { appApi, type AppPlatform } from '@/services/appApi'
import { rendererDiagnostics } from '@/services/rendererDiagnostics'

export const useTitlebarPlatform = () => {
  const [platform, setPlatform] = useState<AppPlatform>(inferPlatformFromUserAgent())

  const getAppWindow = useCallback(async () => {
    return getCurrentRuntimeWindow()
  }, [])

  useEffect(() => {
    if (!isDesktopRuntime()) return
    let active = true
    void appApi
      .getPlatform()
      .then((next) => {
        if (active) setPlatform(next)
      })
      .catch((error: unknown) => {
        if (active)
          rendererDiagnostics.warn('window.platform', 'native-platform-unavailable', error)
      })
    return () => {
      active = false
    }
  }, [])

  const isWindows = platform === 'windows'

  return {
    platform,
    getAppWindow,
    isWindows,
    showInlineMenu: platform === 'windows' || platform === 'linux',
    isMacDesktop: platform === 'macos' && isDesktopRuntime(),
  }
}
