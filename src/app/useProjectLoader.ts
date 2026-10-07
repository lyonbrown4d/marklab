import { useCallback, useRef } from 'react'
import { useLatest } from 'ahooks'
import { useProjectPathActions } from '@/app/useProjectPathActions'
import type { NavigateFunction } from 'react-router-dom'
import type { FileEntry, FileViewKind, WorkspaceTab } from '@/store/appTypes'
import { pathToWorkspaceTabRoute } from '@/logic/routing'
import { useI18n } from '@/i18n/useI18n'
import { fsApi } from '@/services/fsApi'
import { openDialog } from '@/runtime/dialog'
import { runInDesktop } from '@/runtime/environment'
import { createFileTab, getWorkspaceTabId } from '@/logic/tabs'
import { getWorkspaceFilesTarget } from '@/logic/workspaceFilesTarget'
import {
  MARKLAB_DOCUMENT_EXTENSIONS,
  fileViewForOpenPath,
  isMarkdownFilePath,
  isPreviewableFilePath,
} from '@/logic/fileTypes'
import { toast } from 'sonner'
import {
  areWorkspaceEntriesEqual,
  areWorkspaceTabListsEqual,
  fetchWorkspaceLoadProjection,
  isWorkspaceFileEntry,
  projectLoaderErrorMessage,
  type LoadWorkspaceOptions,
} from '@/app/projectLoaderUtils'
import { useWorkspaceStore } from '@/store/useWorkspaceStore'
import { flushEditorChanges } from '@/app/editorCloseLifecycle'

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
  const internalRootSwitchingRef = useRef(false)
  const pathMutationInProgress = useRef(false)
  const loadRequest = useRef(0)

  const loadWorkspace = useCallback(
    async (options?: LoadWorkspaceOptions) => {
      const request = ++loadRequest.current
      if (pathMutationInProgress.current && options?.snapshot) return
      await runInDesktop(async () => {
        let snapshot = options?.snapshot
        if (!snapshot) {
          useWorkspaceStore.getState().beginTreeLoad()
          try {
            const projection = await fetchWorkspaceLoadProjection(options?.tabs ?? tabsRef.current)
            if (request !== loadRequest.current) return
            snapshot = projection.snapshot
            useWorkspaceStore.setState({
              loadedTreeParents: [''],
              treeNextCursors: { '': projection.nextCursor },
              treeError: null,
              treeGeneration: projection.generation,
              treeRevision: projection.revision,
              treeStatus: 'ready',
            })
          } catch (error) {
            useWorkspaceStore.getState().failTreeLoad(error)
            throw error
          }
        }
        const rootInfo = snapshot.root
        if (rootPathRef.current !== rootInfo.path) {
          setRootPath(rootInfo.path)
        }
        if (rootKindRef.current !== rootInfo.kind) {
          setRootKind(rootInfo.kind)
        }

        const nextEntries = snapshot.entries

        if (!areWorkspaceEntriesEqual(entriesRef.current, nextEntries)) {
          setEntries(nextEntries)
        }
        const filesOnly = nextEntries.filter(isWorkspaceFileEntry)

        if (filesOnly.length > 0) {
          const available = new Set(filesOnly.map((file) => file.path))
          const seedTabs = options?.tabs ?? tabsRef.current
          const seedActiveTabId =
            options && 'activeTabId' in options ? options.activeTabId : activeTabIdRef.current
          const nextTabs = seedTabs.flatMap((tab) => {
            if (tab.kind === 'web') return [tab]
            if (!available.has(tab.path)) return []
            if (tab.kind === 'file') {
              return [createFileTab(tab.path, fileViewForOpenPath(tab.path, tab.view))]
            }
            return [tab]
          })
          const defaultTab = getWorkspaceFilesTarget(
            [],
            filesOnly,
            null,
            defaultFileViewRef.current,
          )
          if (!defaultTab) return
          const finalTabs = nextTabs.length > 0 ? nextTabs : [defaultTab]
          if (!areWorkspaceTabListsEqual(tabsRef.current, finalTabs)) {
            setTabs(finalTabs)
          }
          const currentActiveTabId = seedActiveTabId
          const currentActiveTab = finalTabs.find(
            (tab) => getWorkspaceTabId(tab) === currentActiveTabId,
          )
          const nextActiveTab = currentActiveTab ?? finalTabs[0] ?? defaultTab
          const nextActiveTabId = getWorkspaceTabId(nextActiveTab)
          if (nextActiveTabId !== activeTabIdRef.current) {
            setActiveTabId(nextActiveTabId)
          }
          if (options?.preserveCurrentRoute ?? preserveCurrentRouteRef.current) return
          const nextRoute = pathToWorkspaceTabRoute(nextActiveTab)
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
          await flushEditorChanges()
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
        toast.error(t('projectLoader.openPathFailed'), {
          description: `${path}\n${projectLoaderErrorMessage(error)}`,
        })
      }
    },
    [loadWorkspace, t, touchRecentProject],
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
      toast.error(t('projectLoader.selectFolderFailed'), {
        description: projectLoaderErrorMessage(error),
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
      toast.error(t('projectLoader.selectFileFailed'), {
        description: projectLoaderErrorMessage(error),
      })
    }
  }, [openFolder, t])

  const onUseInternalRoot = useCallback(async () => {
    if (rootKindRef.current === 'internal') {
      await loadWorkspace({ preserveCurrentRoute: false })
      return
    }
    if (internalRootSwitchingRef.current) return
    internalRootSwitchingRef.current = true
    try {
      await runInDesktop(async () => {
        await flushEditorChanges()
        await fsApi.setRoot(null)
        await loadWorkspace({ preserveCurrentRoute: false })
      })
    } catch (error) {
      toast.error(t('projectLoader.openLocalWorkspaceFailed'), {
        description: projectLoaderErrorMessage(error),
      })
    } finally {
      internalRootSwitchingRef.current = false
    }
  }, [loadWorkspace, rootKindRef, t])

  const { createFile, createFolder, renamePath, movePath, deletePath } = useProjectPathActions({
    rootPath,
    rootKind,
    tabs,
    activeTabId,
    locationPathname,
    loadWorkspace,
    mutationInProgress: pathMutationInProgress,
  })
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
