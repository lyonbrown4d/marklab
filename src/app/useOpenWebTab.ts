import { useCallback } from 'react'
import { useNavigate } from 'react-router-dom'
import { pathToWebTabRoute } from '@/logic/routing'
import { createWebTab, getWorkspaceTabId } from '@/logic/tabs'
import { useWorkspaceStore } from '@/store/useWorkspaceStore'
import { normalizeNavigableWebUrl } from '@/pages/web/webTabUrl'
import type { WorkspaceTab } from '@/store/appTypes'

type WebTab = Extract<WorkspaceTab, { kind: 'web' }>

export const useOpenWebTab = () => {
  const navigate = useNavigate()
  return useCallback(
    (url: string, title: string) => {
      const safeUrl = normalizeNavigableWebUrl(url)
      if (!safeUrl) return
      const state = useWorkspaceStore.getState()
      const existing = state.tabs.find(
        (tab): tab is WebTab => tab.kind === 'web' && tab.url === safeUrl,
      )
      const tab = existing ?? createWebTab(safeUrl, title)
      if (!existing) {
        const activeIndex = state.tabs.findIndex(
          (item) => getWorkspaceTabId(item) === state.activeTabId,
        )
        const insertionIndex = activeIndex < 0 ? state.tabs.length : activeIndex + 1
        state.setTabs([
          ...state.tabs.slice(0, insertionIndex),
          tab,
          ...state.tabs.slice(insertionIndex),
        ])
      }
      state.setActiveTabId(getWorkspaceTabId(tab))
      navigate(pathToWebTabRoute(tab.id))
    },
    [navigate],
  )
}
