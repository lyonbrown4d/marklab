import { useEffect, useLayoutEffect, useRef, type RefObject } from 'react'
import type { usePanelRef } from 'react-resizable-panels'
import { useInspectorOverlay } from '@/app/useInspectorOverlay'

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
  leftSidebarPanelRef: ReturnType<typeof usePanelRef>
  rightSidebarPanelRef: ReturnType<typeof usePanelRef>
  terminalPanelRef: ReturnType<typeof usePanelRef>
  workspaceGroupElementRef: RefObject<HTMLDivElement | null>
  shellGroupElementRef: RefObject<HTMLDivElement | null>
  sidebarCollapsed: boolean
  rightSidebarCollapsed: boolean
  terminalOpen: boolean
}

export const useAppPanelLayoutSync = ({
  leftSidebarPanelRef,
  rightSidebarPanelRef,
  terminalPanelRef,
  workspaceGroupElementRef,
  shellGroupElementRef,
  sidebarCollapsed,
  rightSidebarCollapsed: requestedRightSidebarCollapsed,
  terminalOpen,
}: UseAppPanelLayoutSyncArgs) => {
  const inspectorOverlay = useInspectorOverlay()
  const rightSidebarCollapsed = requestedRightSidebarCollapsed || inspectorOverlay
  const leftSidebarCollapsedRef = useRef(sidebarCollapsed)
  const rightSidebarCollapsedRef = useRef(rightSidebarCollapsed)
  const terminalOpenRef = useRef(terminalOpen)

  useEffect(() => {
    const panel = leftSidebarPanelRef.current
    if (!panel) return

    const shouldAnimate = leftSidebarCollapsedRef.current !== sidebarCollapsed
    leftSidebarCollapsedRef.current = sidebarCollapsed
    const updateLayout = () => {
      if (sidebarCollapsed) {
        panel.collapse()
        return
      }
      if (panel.isCollapsed()) panel.expand()
    }

    if (shouldAnimate) {
      animatePanelLayoutChange(workspaceGroupElementRef.current, updateLayout)
      return
    }
    updateLayout()
  }, [leftSidebarPanelRef, sidebarCollapsed, workspaceGroupElementRef])

  useEffect(() => {
    // Constraint changes re-register the panel through a nested library commit.
    // Wait for that commit before invoking an API backed by its previous constraints.
    const frame = window.requestAnimationFrame(() => {
      const panel = rightSidebarPanelRef.current
      if (!panel) return

      const shouldAnimate = rightSidebarCollapsedRef.current !== rightSidebarCollapsed
      rightSidebarCollapsedRef.current = rightSidebarCollapsed
      const updateLayout = () => {
        if (rightSidebarCollapsed) {
          panel.collapse()
          return
        }
        if (panel.isCollapsed()) panel.expand()
      }

      if (shouldAnimate) {
        animatePanelLayoutChange(workspaceGroupElementRef.current, updateLayout)
        return
      }
      updateLayout()
    })
    return () => window.cancelAnimationFrame(frame)
  }, [inspectorOverlay, rightSidebarCollapsed, rightSidebarPanelRef, workspaceGroupElementRef])

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
