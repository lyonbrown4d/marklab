import { useCallback, useRef, type MouseEvent as ReactMouseEvent } from 'react'

import { isDesktopRuntime, type RuntimeWindowHandle } from '@/runtime/window'
import type { AppPlatform } from '@/services/appApi'
import { rendererDiagnostics } from '@/services/rendererDiagnostics'

const interactiveTarget = [
  'button',
  'a',
  'input',
  'select',
  'textarea',
  'label',
  'summary',
  '[role="button"]',
  '[role="link"]',
  '[role="menuitem"]',
  '[role="tab"]',
  '[role="checkbox"]',
  '[role="radio"]',
  '[role="switch"]',
  '[role="option"]',
  '[contenteditable]:not([contenteditable="false"])',
  '[tabindex]:not([tabindex="-1"])',
  '[data-no-drag]',
].join(', ')

const isTitlebarAction = (event: ReactMouseEvent): boolean =>
  isDesktopRuntime() &&
  event.button === 0 &&
  !event.defaultPrevented &&
  event.target instanceof Element &&
  !event.target.closest(interactiveTarget)

export const useTitlebarDrag = (
  platform: AppPlatform,
  getAppWindow: () => Promise<RuntimeWindowHandle | null>,
) => {
  const resizing = useRef(false)
  const secondPress = useRef<{ x: number; y: number } | null>(null)
  const toggleMaximize = useCallback(() => {
    if (resizing.current) return
    resizing.current = true
    void getAppWindow()
      .then(async (windowHandle) => {
        if (!windowHandle) return
        if (await windowHandle.isMaximized()) await windowHandle.unmaximize()
        else await windowHandle.maximize()
      })
      .catch((error: unknown) =>
        rendererDiagnostics.warn('window.titlebar', 'native-action-failed', error),
      )
      .finally(() => {
        resizing.current = false
      })
  }, [getAppWindow])
  const onMouseDown = useCallback(
    (event: ReactMouseEvent) => {
      secondPress.current = null
      if (!isTitlebarAction(event) || event.detail > 2) return
      // Match Tauri's drag region timing: native dragging may consume mouseup,
      // so Windows/Linux resize on the second press without waiting for dblclick.
      if (event.detail === 2) {
        if (platform === 'macos') {
          secondPress.current = { x: event.clientX, y: event.clientY }
        } else {
          toggleMaximize()
        }
        return
      }
      void getAppWindow()
        .then((windowHandle) => windowHandle?.startDragging())
        .catch((error: unknown) =>
          rendererDiagnostics.warn('window.titlebar', 'native-action-failed', error),
        )
    },
    [getAppWindow, platform, toggleMaximize],
  )
  const onMouseUp = useCallback(
    (event: ReactMouseEvent) => {
      const press = secondPress.current
      secondPress.current = null
      // macOS permits canceling the second click by moving before releasing.
      if (
        platform === 'macos' &&
        isTitlebarAction(event) &&
        event.detail === 2 &&
        press &&
        press.x === event.clientX &&
        press.y === event.clientY
      )
        toggleMaximize()
    },
    [platform, toggleMaximize],
  )
  return { onMouseDown, onMouseUp }
}
