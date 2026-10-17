import { useCallback, type MouseEvent as ReactMouseEvent } from 'react'

import { isTauriRuntime } from '@/runtime/environment'
import { isDesktopRuntime, type RuntimeWindowHandle } from '@/runtime/window'
import type { AppPlatform } from '@/services/appApi'
import { rendererDiagnostics } from '@/services/rendererDiagnostics'

export const useTitlebarDrag = (
  platform: AppPlatform,
  getAppWindow: () => Promise<RuntimeWindowHandle | null>,
) => {
  return useCallback(
    (e: ReactMouseEvent) => {
      if (!isDesktopRuntime() || (platform !== 'macos' && !isTauriRuntime())) return
      if (e.button !== 0) return
      const target = e.target as HTMLElement
      if (
        target.closest(
          'button, a, input, select, textarea, [role="button"], [role="menuitem"], [data-no-drag]',
        )
      )
        return
      void getAppWindow()
        .then(async (windowHandle) => {
          if (!windowHandle) return
          if (isTauriRuntime() && platform !== 'macos' && e.detail === 2) {
            if (await windowHandle.isMaximized()) await windowHandle.unmaximize()
            else await windowHandle.maximize()
          } else {
            await windowHandle.startDragging()
          }
        })
        .catch((error: unknown) =>
          rendererDiagnostics.warn('window.titlebar', 'native-action-failed', error),
        )
    },
    [getAppWindow, platform],
  )
}
