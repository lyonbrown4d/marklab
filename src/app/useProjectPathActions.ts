import { useCallback, type RefObject } from 'react'
import { useLatest } from 'ahooks'
import { runInDesktop } from '@/runtime/environment'
import { fsApi } from '@/services/fsApi'
import { getWorkspaceTabId } from '@/logic/tabs'
import type { RootKind, WorkspaceTab } from '@/store/appTypes'
import type { LoadWorkspaceOptions } from '@/app/projectLoaderUtils'

type Options = {
  rootPath: string
  rootKind: RootKind
  tabs: WorkspaceTab[]
  activeTabId: string | null
  locationPathname: string
  mutationInProgress: RefObject<boolean>
  loadWorkspace: (options?: LoadWorkspaceOptions) => Promise<void>
}

const remapTab = (tab: WorkspaceTab, from: string, to: string): WorkspaceTab => {
  if (tab.kind === 'workspace-graph') return tab
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
        try {
          await operation(from, to)
          const current = latest.current
          if (current.rootKind !== initial.rootKind || current.rootPath !== initial.rootPath) return
          const active = current.tabs.find((tab) => getWorkspaceTabId(tab) === current.activeTabId)
          const nextActive = active ? remapTab(active, from, to) : undefined
          await current.loadWorkspace({
            tabs: current.tabs.map((tab) => remapTab(tab, from, to)),
            activeTabId: nextActive ? getWorkspaceTabId(nextActive) : current.activeTabId,
            preserveCurrentRoute:
              nextActive === active || current.locationPathname !== initial.locationPathname,
          })
        } finally {
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
