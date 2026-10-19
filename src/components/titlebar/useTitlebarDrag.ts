import { useCallback, useRef, type MouseEvent as ReactMouseEvent } from 'react'

import { isDesktopRuntime, type RuntimeWindowHandle } from '@/runtime/window'
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

export const useTitlebarDrag = (getAppWindow: () => Promise<RuntimeWindowHandle | null>) => {
  const resizing = useRef(false)
  const onMouseDown = useCallback(
    (event: ReactMouseEvent) => {
      // Let the browser finish the second click before resizing the window.
      if (!isTitlebarAction(event) || event.detail >= 2) return
      void getAppWindow()
        .then((windowHandle) => windowHandle?.startDragging())
        .catch((error: unknown) =>
          rendererDiagnostics.warn('window.titlebar', 'native-action-failed', error),
        )
    },
    [getAppWindow],
  )
  const onDoubleClick = useCallback(
    (event: ReactMouseEvent) => {
      if (!isTitlebarAction(event) || resizing.current) return
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
    },
    [getAppWindow],
  )
  return { onMouseDown, onDoubleClick }
}
