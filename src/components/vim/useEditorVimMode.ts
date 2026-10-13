import { fileViewTabId, getWorkspaceTabId } from '@/logic/tabs'
import { usePreferencesStore } from '@/store/usePreferencesStore'
import { useVimModeStore, vimTabKey } from '@/store/useVimModeStore'
import { useWorkspaceStore } from '@/store/useWorkspaceStore'

type EditorVimModeOptions = {
  workspaceKey: string
  path: string | null
  tabId?: string
}

export const useEditorVimMode = ({ workspaceKey, path, tabId }: EditorVimModeOptions): boolean => {
  const globalEnabled = usePreferencesStore((state) => state.vimModeEnabled)
  const activeTabId = useWorkspaceStore((state) => {
    if (`${state.rootKind}:${state.rootPath}` !== workspaceKey) return null
    const activeTab = state.tabs.find((tab) => getWorkspaceTabId(tab) === state.activeTabId)
    return activeTab?.kind === 'file' && activeTab.path === path ? state.activeTabId : null
  })
  const effectiveTabId = path ? (tabId ?? activeTabId ?? fileViewTabId(path, 'source')) : null
  const override = useVimModeStore((state) =>
    effectiveTabId ? state.perTabOverrides[vimTabKey(workspaceKey, effectiveTabId)] : undefined,
  )
  return override ?? globalEnabled
}

export const useCurrentTabVimModeEnabled = (): boolean => {
  const globalEnabled = usePreferencesStore((state) => state.vimModeEnabled)
  const workspaceKey = useWorkspaceStore((state) => `${state.rootKind}:${state.rootPath}`)
  const activeTabId = useWorkspaceStore((state) => state.activeTabId)
  const override = useVimModeStore((state) =>
    activeTabId ? state.perTabOverrides[vimTabKey(workspaceKey, activeTabId)] : undefined,
  )
  return override ?? globalEnabled
}
