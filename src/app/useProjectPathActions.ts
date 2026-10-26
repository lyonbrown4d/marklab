import { useCallback, type RefObject } from 'react'
import { useLatest } from 'ahooks'
import { runInDesktop } from '@/runtime/environment'
import { fsApi } from '@/services/fsApi'
import { getWorkspaceTabId } from '@/logic/tabs'
import type { RootKind, WorkspaceTab } from '@/store/appTypes'
import type { LoadWorkspaceOptions } from '@/app/projectLoaderUtils'
import { flushEditorChanges } from '@/app/editorCloseLifecycle'
import type { BeginEditorPathMutation } from '@/app/useEditorBufferPathMutation'
import { pathToWorkspaceTabRoute } from '@/logic/routing'
import type { NavigateFunction } from 'react-router-dom'

type Options = {
  rootPath: string
  rootKind: RootKind
  tabs: WorkspaceTab[]
  activeTabId: string | null
  locationPathname: string
  mutationInProgress: RefObject<boolean>
  loadWorkspace: (options?: LoadWorkspaceOptions) => Promise<void>
  onBeforePathMutation?: BeginEditorPathMutation
  setTabs: (tabs: WorkspaceTab[]) => void
  setActiveTabId: (id: string | null) => void
  navigate: NavigateFunction
}

const remapTab = (tab: WorkspaceTab, from: string, to: string): WorkspaceTab => {
  if (tab.kind === 'web') return tab
  if (tab.path === from) return { ...tab, path: to }
  if (tab.path.startsWith(from + '/')) return { ...tab, path: to + tab.path.slice(from.length) }
  return tab
}

export const useProjectPathActions = (options: Options) => {
  const latest = useLatest(options)
  const runPathMutation = useCallback(
    async (operation: (from: string, to: string) => Promise<unknown>, from: string, to: string) => {
      if (from === to) return
      await runInDesktop(async () => {
        const initial = latest.current
        if (initial.mutationInProgress.current)
          throw new Error('Another workspace path change is in progress')
        initial.mutationInProgress.current = true
        let finish: ((committed: boolean) => void) | undefined
        let committed = false
        try {
          await flushEditorChanges()
          if (
            latest.current.rootKind !== initial.rootKind ||
            latest.current.rootPath !== initial.rootPath
          )
            return
          finish = initial.onBeforePathMutation?.(from, to)
          await operation(from, to)
          committed = true
          finish?.(true)
          finish = undefined
          const current = latest.current
          if (current.rootKind !== initial.rootKind || current.rootPath !== initial.rootPath) return
          const active = current.tabs.find((tab) => getWorkspaceTabId(tab) === current.activeTabId)
          const nextActive = active ? remapTab(active, from, to) : undefined
          const nextTabs = current.tabs.map((tab) => remapTab(tab, from, to))
          const nextActiveId = nextActive ? getWorkspaceTabId(nextActive) : current.activeTabId
          // The native move has committed. Reflect that path even if refreshing
          // the tree fails, so the editor cannot remain attached to a retired path.
          current.setTabs(nextTabs)
          current.setActiveTabId(nextActiveId)
          if (
            nextActive !== active &&
            nextActive &&
            current.locationPathname === initial.locationPathname
          )
            current.navigate(pathToWorkspaceTabRoute(nextActive), { replace: true })
          await current.loadWorkspace({
            tabs: nextTabs,
            activeTabId: nextActiveId,
            preserveCurrentRoute: true,
          })
        } finally {
          finish?.(committed)
          initial.mutationInProgress.current = false
        }
      })
    },
    [latest],
  )

  const runEntryMutation = useCallback(
    async (operation: () => Promise<unknown>, preserveCurrentRoute: boolean) => {
      await runInDesktop(async () => {
        const initial = latest.current
        if (initial.mutationInProgress.current)
          throw new Error('Another workspace path change is in progress')
        initial.mutationInProgress.current = true
        try {
          await operation()
          const current = latest.current
          if (current.rootKind !== initial.rootKind || current.rootPath !== initial.rootPath) return
          await current.loadWorkspace({
            tabs: current.tabs,
            activeTabId: current.activeTabId,
            preserveCurrentRoute:
              preserveCurrentRoute || current.locationPathname !== initial.locationPathname,
          })
        } finally {
          initial.mutationInProgress.current = false
        }
      })
    },
    [latest],
  )

  const createFile = useCallback(
    (path: string) => {
      const normalized = path.endsWith('.md') || path.endsWith('.markdown') ? path : path + '.md'
      return runEntryMutation(() => fsApi.createFile(normalized), true)
    },
    [runEntryMutation],
  )
  const createFolder = useCallback(
    (path: string) => {
      return runEntryMutation(() => fsApi.createDir(path), true)
    },
    [runEntryMutation],
  )
  const renamePath = useCallback(
    (from: string, to: string) => runPathMutation(fsApi.renamePath, from, to),
    [runPathMutation],
  )
  const movePath = useCallback(
    (from: string, to: string) => runPathMutation(fsApi.movePath, from, to),
    [runPathMutation],
  )
  const deletePath = useCallback(
    (path: string) => {
      return runEntryMutation(() => fsApi.deletePath(path), false)
    },
    [runEntryMutation],
  )

  return { createFile, createFolder, renamePath, movePath, deletePath }
}
