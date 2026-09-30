import { useLayoutEffect, useRef, type RefObject } from 'react'
import type { usePanelRef } from 'react-resizable-panels'

const PANEL_LAYOUT_ANIMATION_MS = 260
const panelLayoutAnimationTimers = new WeakMap<HTMLElement, number>()

const animatePanelLayoutChange = (element: HTMLElement | null, updateLayout: () => void) => {
  if (!element) {
    updateLayout()
    return
  }

  const activeTimer = panelLayoutAnimationTimers.get(element)
  if (activeTimer !== undefined) window.clearTimeout(activeTimer)

  element.classList.add('is-panel-layout-animating')
  void element.offsetWidth
  updateLayout()

  const timer = window.setTimeout(() => {
    element.classList.remove('is-panel-layout-animating')
    panelLayoutAnimationTimers.delete(element)
  }, PANEL_LAYOUT_ANIMATION_MS + 60)
  panelLayoutAnimationTimers.set(element, timer)
}

type UseAppPanelLayoutSyncArgs = {
  terminalPanelRef: ReturnType<typeof usePanelRef>
  shellGroupElementRef: RefObject<HTMLDivElement | null>
  terminalOpen: boolean
}

export const useAppPanelLayoutSync = ({
  terminalPanelRef,
  shellGroupElementRef,
  terminalOpen,
}: UseAppPanelLayoutSyncArgs) => {
  const terminalOpenRef = useRef(terminalOpen)

  useLayoutEffect(() => {
    const panel = terminalPanelRef.current
    if (!panel) return

    const shouldAnimate = terminalOpenRef.current !== terminalOpen
    terminalOpenRef.current = terminalOpen
    const updateLayout = () => {
      if (!terminalOpen) {
        panel.collapse()
        return
      }

      if (panel.isCollapsed()) panel.expand()
      if (panel.getSize().inPixels < 120) panel.resize('280px')
    }

    if (shouldAnimate) {
      animatePanelLayoutChange(shellGroupElementRef.current, updateLayout)
      return
    }
    updateLayout()
  }, [shellGroupElementRef, terminalOpen, terminalPanelRef])
}
