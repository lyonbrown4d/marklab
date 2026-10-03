import { useCallback, useEffect, useRef, useState, type RefCallback } from 'react'
import { getElectronRuntime } from '@/runtime/electron'
import type { WorkspaceTab } from '@/store/appTypes'
import type { WebTabBounds, WebTabState } from '@/types/webTabs'
import { useWorkspaceStore } from '@/store/useWorkspaceStore'
import { normalizeNavigableWebUrl } from '@/pages/web/webTabUrl'

type WebTab = Extract<WorkspaceTab, { kind: 'web' }>

const initialState = (tab: WebTab): WebTabState => ({
  active: false,
  canGoBack: false,
  canGoForward: false,
  status: 'idle',
  tabId: tab.id,
  title: tab.title,
  url: tab.url,
})

const measureBounds = (element: HTMLElement): WebTabBounds | null => {
  const rect = element.getBoundingClientRect()
  const bounds = {
    height: Math.round(rect.height),
    width: Math.round(rect.width),
    x: Math.round(rect.left),
    y: Math.round(rect.top),
  }
  return bounds.height > 0 && bounds.width > 0 ? bounds : null
}

const equalBounds = (left: WebTabBounds | null, right: WebTabBounds) =>
  Boolean(
    left &&
    left.height === right.height &&
    left.width === right.width &&
    left.x === right.x &&
    left.y === right.y,
  )

export const useWebTabNativeView = ({
  onOpenRequested,
  suspended,
  tab,
}: {
  onOpenRequested: (url: string) => void
  suspended: boolean
  tab: WebTab
}) => {
  const [host, setHost] = useState<HTMLElement | null>(null)
  const [state, setState] = useState<WebTabState>(() => initialState(tab))
  const lastBoundsRef = useRef<WebTabBounds | null>(null)
  const activatedRef = useRef(false)
  const frameRef = useRef<number | null>(null)
  const hostRef: RefCallback<HTMLDivElement> = useCallback((element) => setHost(element), [])

  useEffect(() => {
    return getElectronRuntime().webTabs.onState((event) => {
      if (event.type === 'open-requested') {
        if (event.tabId === tab.id && event.url) onOpenRequested(event.url)
        return
      }
      if (event.type !== 'state') return
      if (event.state.tabId !== tab.id) return
      setState(event.state)
      const safeUrl = normalizeNavigableWebUrl(event.state.url)
      if (!safeUrl) return
      const workspace = useWorkspaceStore.getState()
      const currentTab = workspace.tabs.find(
        (item): item is WebTab => item.kind === 'web' && item.id === tab.id,
      )
      const title = event.state.title.trim() || currentTab?.title || tab.title
      if (!currentTab || (currentTab.title === title && currentTab.url === safeUrl)) return
      workspace.setTabs(
        workspace.tabs.map((item) =>
          item.kind === 'web' && item.id === tab.id
            ? {
                ...item,
                title,
                url: safeUrl,
              }
            : item,
        ),
      )
    })
  }, [onOpenRequested, tab.id, tab.title])

  useEffect(() => {
    if (!host) return
    const webTabs = getElectronRuntime().webTabs
    const syncBounds = () => {
      frameRef.current = null
      const bounds = measureBounds(host)
      if (!bounds) {
        const wasActive = activatedRef.current || lastBoundsRef.current !== null
        lastBoundsRef.current = null
        activatedRef.current = false
        if (wasActive) void webTabs.hide({ tabId: tab.id })
        return
      }
      if (equalBounds(lastBoundsRef.current, bounds)) return
      lastBoundsRef.current = bounds
      if (!activatedRef.current) {
        if (suspended) return
        activatedRef.current = true
        void webTabs.activate({ bounds, tabId: tab.id, url: tab.url }).catch(() => {
          activatedRef.current = false
          setState((current) => ({
            ...current,
            error: { description: 'Unable to open webpage' },
            status: 'error',
          }))
        })
        return
      }
      void webTabs.setBounds({ bounds, tabId: tab.id })
    }
    const scheduleBounds = () => {
      if (frameRef.current !== null) cancelAnimationFrame(frameRef.current)
      frameRef.current = requestAnimationFrame(syncBounds)
    }
    const observer = new ResizeObserver(scheduleBounds)
    observer.observe(host)
    scheduleBounds()
    return () => {
      observer.disconnect()
      if (frameRef.current !== null) cancelAnimationFrame(frameRef.current)
    }
  }, [host, suspended, tab.id, tab.url])

  useEffect(() => {
    const webTabs = getElectronRuntime().webTabs
    const hide = () => void webTabs.hide({ tabId: tab.id })
    const show = () => {
      const bounds = lastBoundsRef.current
      if (!bounds || suspended) return
      activatedRef.current = true
      void webTabs.activate({ bounds, tabId: tab.id, url: state.url })
    }
    const handleVisibility = () => (document.hidden ? hide() : show())
    document.addEventListener('visibilitychange', handleVisibility)
    return () => {
      document.removeEventListener('visibilitychange', handleVisibility)
      hide()
    }
  }, [state.url, suspended, tab.id])

  useEffect(() => {
    const bounds = lastBoundsRef.current
    const webTabs = getElectronRuntime().webTabs
    if (suspended || !bounds) {
      if (suspended) void webTabs.hide({ tabId: tab.id })
      return
    }
    activatedRef.current = true
    void webTabs.activate({ bounds, tabId: tab.id, url: state.url })
  }, [state.url, suspended, tab.id])

  return { hostRef, state }
}
