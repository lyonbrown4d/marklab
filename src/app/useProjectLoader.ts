import { useCallback } from 'react'
import { useLatest } from 'ahooks'
import type { NavigateFunction } from 'react-router-dom'
import isEqual from 'lodash-es/isEqual'
import type { FileEntry, FileViewKind, WorkspaceTab } from '@/store/appTypes'
import { pathToFileViewRoute, pathToGitDiffRoute, pathToWorkspaceGraphRoute } from '@/logic/routing'
import { useI18n } from '@/i18n/useI18n'
import { fsApi, type FsSnapshot } from '@/services/fsApi'
import { openDialog } from '@/runtime/dialog'
import { runInDesktop } from '@/runtime/environment'
import { createFileTab, getWorkspaceTabId } from '@/logic/tabs'
import {
  MARKLAB_DOCUMENT_EXTENSIONS,
  fileViewForOpenPath,
  isMarkdownFilePath,
  isPreviewableFilePath,
} from '@/logic/fileTypes'
import { toast } from 'sonner'

type UseProjectLoaderArgs = {
  rootPath: string
  rootKind: 'internal' | 'external' | 'single'
  entries: FileEntry[]
  tabs: WorkspaceTab[]
  activeTabId: string | null
  locationPathname: string
  preserveCurrentRoute: boolean
  defaultFileView: FileViewKind
  navigate: NavigateFunction
  setEntries: (entries: FileEntry[]) => void
  setRootPath: (path: string) => void
  setRootKind: (kind: 'internal' | 'external' | 'single') => void
  setTabs: (tabs: WorkspaceTab[]) => void
  setActiveTabId: (id: string | null) => void
  touchRecentProject: (path: string) => void
}

type LoadWorkspaceOptions = {
  activeTabId?: string | null
  preserveCurrentRoute?: boolean
  snapshot?: FsSnapshot
  tabs?: WorkspaceTab[]
}

const isFile = (entry: FileEntry) => {
  return entry.kind === 'file'
}

const areTabListsEqual = (left: WorkspaceTab[], right: WorkspaceTab[]) => {
  return isEqual(left.map(getWorkspaceTabId), right.map(getWorkspaceTabId))
}

const areEntriesEqual = (left: FileEntry[], right: FileEntry[]) => {
  return isEqual(left.map(toEntryIdentity), right.map(toEntryIdentity))
}

const toEntryIdentity = (entry: FileEntry) => [entry.path, entry.kind]

const fetchSnapshot = async () => {
  return fsApi.getSnapshot()
}

const errorMessage = (error: unknown) => (error instanceof Error ? error.message : String(error))

export const useProjectLoader = ({
  rootPath,
  rootKind,
  entries,
  tabs,
  activeTabId,
  locationPathname,
  preserveCurrentRoute,
  defaultFileView,
  navigate,
  setEntries,
  setRootPath,
  setRootKind,
  setTabs,
  setActiveTabId,
  touchRecentProject,
}: UseProjectLoaderArgs) => {
  const { t } = useI18n()
  const entriesRef = useLatest(entries)
  const tabsRef = useLatest(tabs)
  const activeTabIdRef = useLatest(activeTabId)
  const rootPathRef = useLatest(rootPath)
  const rootKindRef = useLatest(rootKind)
  const locationPathnameRef = useLatest(locationPathname)
  const preserveCurrentRouteRef = useLatest(preserveCurrentRoute)
  const defaultFileViewRef = useLatest(defaultFileView)

  const loadWorkspace = useCallback(
    async (options?: LoadWorkspaceOptions) => {
      await runInDesktop(async () => {
        const snapshot = options?.snapshot ?? (await fetchSnapshot())
        const rootInfo = snapshot.root
        if (rootPathRef.current !== rootInfo.path) {
          setRootPath(rootInfo.path)
        }
        if (rootKindRef.current !== rootInfo.kind) {
          setRootKind(rootInfo.kind)
        }

        let nextEntries = snapshot.entries
        if (rootInfo.kind !== 'single' && !nextEntries.some(isFile)) {
          const fallbackName = 'Untitled.md'
          await fsApi.createFile(fallbackName)
          const refreshed = await fetchSnapshot()
          nextEntries = refreshed.entries
          if (rootPathRef.current !== refreshed.root.path) {
            setRootPath(refreshed.root.path)
          }
          if (rootKindRef.current !== refreshed.root.kind) {
            setRootKind(refreshed.root.kind)
          }
        }

        if (!areEntriesEqual(entriesRef.current, nextEntries)) {
          setEntries(nextEntries)
        }
        const filesOnly = nextEntries.filter(isFile)

        if (filesOnly.length > 0) {
          const available = new Set(filesOnly.map((file) => file.path))
          const defaultPath = filesOnly[0].path
          const seedTabs = options?.tabs ?? tabsRef.current
          const seedActiveTabId =
            options && 'activeTabId' in options ? options.activeTabId : activeTabIdRef.current
          const nextTabs = seedTabs.flatMap((tab) => {
            if (tab.kind === 'workspace-graph') return [tab]
            if (!available.has(tab.path)) return []
            if (tab.kind === 'file') {
              return [createFileTab(tab.path, fileViewForOpenPath(tab.path, tab.view))]
            }
            return [tab]
          })
          const finalTabs =
            nextTabs.length > 0
              ? nextTabs
              : [
                  createFileTab(
                    defaultPath,
                    fileViewForOpenPath(defaultPath, defaultFileViewRef.current),
                  ),
                ]
          if (!areTabListsEqual(tabsRef.current, finalTabs)) {
            setTabs(finalTabs)
          }
          const currentActiveTabId = seedActiveTabId
          const currentActiveTab = finalTabs.find(
            (tab) => getWorkspaceTabId(tab) === currentActiveTabId,
          )
          const nextActiveTab =
            currentActiveTab ??
            finalTabs[0] ??
            createFileTab(defaultPath, fileViewForOpenPath(defaultPath, defaultFileViewRef.current))
          const nextActiveTabId = getWorkspaceTabId(nextActiveTab)
          if (nextActiveTabId !== currentActiveTabId) {
            setActiveTabId(nextActiveTabId)
          }
          if (options?.preserveCurrentRoute ?? preserveCurrentRouteRef.current) return
          const nextRoute =
            nextActiveTab.kind === 'file'
              ? pathToFileViewRoute(nextActiveTab.path, nextActiveTab.view)
              : nextActiveTab.kind === 'workspace-graph'
                ? pathToWorkspaceGraphRoute()
                : pathToGitDiffRoute(nextActiveTab.section, nextActiveTab.path)
          if (locationPathnameRef.current !== nextRoute) {
            navigate(nextRoute, { replace: true })
          }
        }
      })
    },
    [
      activeTabIdRef,
      defaultFileViewRef,
      entriesRef,
      locationPathnameRef,
      navigate,
      preserveCurrentRouteRef,
      rootKindRef,
      rootPathRef,
      setActiveTabId,
      setEntries,
      setRootKind,
      setRootPath,
      setTabs,
      tabsRef,
    ],
  )

  const openFolder = useCallback(
    async (path: string) => {
      try {
        await runInDesktop(async () => {
          const preferSingleFile = isMarkdownFilePath(path) || isPreviewableFilePath(path)
          if (preferSingleFile) {
            try {
              await fsApi.setSingleFile(path)
            } catch (singleFileError) {
              try {
                await fsApi.setRoot(path)
              } catch {
                throw singleFileError
              }
            }
          } else {
            try {
              await fsApi.setRoot(path)
            } catch (folderError) {
              try {
                await fsApi.setSingleFile(path)
              } catch {
                throw folderError
              }
            }
          }
          touchRecentProject(path)
          await loadWorkspace({ preserveCurrentRoute: false })
        })
      } catch (error) {
        toast.error('Failed to open path', {
          description: `${path}\n${errorMessage(error)}`,
        })
      }
    },
    [loadWorkspace, touchRecentProject],
  )

  const onSelectFolder = useCallback(async () => {
    try {
      await runInDesktop(async () => {
        const selected = await openDialog({
          directory: true,
          multiple: false,
          title: t('dialog.selectProjectTitle'),
        })
        if (typeof selected === 'string') {
          await openFolder(selected)
        }
      })
    } catch (error) {
      toast.error('Failed to select folder', {
        description: errorMessage(error),
      })
    }
  }, [openFolder, t])

  const onSelectSingleFile = useCallback(async () => {
    try {
      await runInDesktop(async () => {
        const selected = await openDialog({
          directory: false,
          multiple: false,
          title: t('dialog.selectFileTitle'),
          filters: [
            {
              name: 'Marklab documents',
              extensions: MARKLAB_DOCUMENT_EXTENSIONS,
            },
          ],
        })
        if (typeof selected === 'string') {
          await openFolder(selected)
        }
      })
    } catch (error) {
      toast.error('Failed to select file', {
        description: errorMessage(error),
      })
    }
  }, [openFolder, t])

  const onUseInternalRoot = useCallback(async () => {
    try {
      await runInDesktop(async () => {
        await fsApi.setRoot(null)
        await loadWorkspace({ preserveCurrentRoute: false })
      })
    } catch (error) {
      toast.error('Failed to open local workspace', {
        description: errorMessage(error),
      })
    }
  }, [loadWorkspace])

  const createFile = useCallback(async (path: string) => {
    await runInDesktop(async () => {
      const normalized = path.endsWith('.md') || path.endsWith('.markdown') ? path : `${path}.md`
      await fsApi.createFile(normalized)
    })
  }, [])

  const createFolder = useCallback(async (path: string) => {
    await runInDesktop(() => fsApi.createDir(path))
  }, [])

  const renamePath = useCallback(async (from: string, to: string) => {
    await runInDesktop(() => fsApi.renamePath(from, to))
  }, [])

  const movePath = useCallback(async (from: string, to: string) => {
    await runInDesktop(() => fsApi.movePath(from, to))
  }, [])

  const deletePath = useCallback(async (path: string) => {
    await runInDesktop(() => fsApi.deletePath(path))
  }, [])

  return {
    loadWorkspace,
    onSelectFolder,
    onSelectSingleFile,
    onUseInternalRoot,
    openFolder,
    createFile,
    createFolder,
    renamePath,
    movePath,
    deletePath,
  }
}
