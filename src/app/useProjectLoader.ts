import { useCallback, useRef } from 'react'
import { useLatest } from 'ahooks'
import { useCreateWorkspace } from '@/app/useCreateWorkspace'
import { useProjectPathActions } from '@/app/useProjectPathActions'
import { pathToWorkspaceTabRoute } from '@/logic/routing'
import { useI18n } from '@/i18n/useI18n'
import { fsApi } from '@/services/fsApi'
import { openDialog } from '@/runtime/dialog'
import { runInDesktop } from '@/runtime/environment'
import { createFileTab, getWorkspaceTabId } from '@/logic/tabs'
import { getWorkspaceFilesTarget } from '@/logic/workspaceFilesTarget'
import { MARKLAB_DOCUMENT_EXTENSIONS, fileViewForOpenPath } from '@/logic/fileTypes'
import { toast } from 'sonner'
import {
  areWorkspaceEntriesEqual,
  areWorkspaceTabListsEqual,
  fetchWorkspaceLoadProjection,
  isWorkspaceFileEntry,
  projectLoaderErrorMessage,
  selectProjectRoot,
  setRootSwitching,
  type LoadWorkspaceOptions,
} from '@/app/projectLoaderUtils'
import { useWorkspaceStore } from '@/store/useWorkspaceStore'
import { flushEditorChanges } from '@/app/editorCloseLifecycle'
import type { UseProjectLoaderArgs } from '@/app/projectLoaderTypes'

export const useProjectLoader = ({
  onWorkspaceOpened,
  onBeforeWorkspaceOpen,
  onBeforePathMutation,
  rootSwitchingRef: externalRootSwitchingRef,
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
  const localRootSwitchingRef = useRef(false)
  const rootSwitchingRef = externalRootSwitchingRef ?? localRootSwitchingRef
  const pathMutationInProgress = useRef(false)
  const loadRequest = useRef(0)

  const loadWorkspace = useCallback(
    async (options?: LoadWorkspaceOptions) => {
      // Watch refreshes must not supersede the authoritative path mutation load.
      if (pathMutationInProgress.current && !options?.tabs) return
      const request = ++loadRequest.current
      const isCurrent = () =>
        request === loadRequest.current && !(pathMutationInProgress.current && !options?.tabs)
      await runInDesktop(async () => {
        let snapshot = options?.snapshot
        if (!snapshot) {
          useWorkspaceStore.getState().beginTreeLoad()
          try {
            const projection = await fetchWorkspaceLoadProjection(
              options?.tabs ?? tabsRef.current,
              isCurrent,
            )
            if (!isCurrent()) {
              if (request === loadRequest.current)
                useWorkspaceStore.setState({ treeStatus: 'ready' })
              return
            }
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
            if (!isCurrent()) {
              if (request === loadRequest.current)
                useWorkspaceStore.setState({ treeStatus: 'ready' })
              return
            }
            useWorkspaceStore.getState().failTreeLoad(error)
            throw error
          }
        }
        const rootInfo = snapshot.root
        if (rootPathRef.current !== rootInfo.path) setRootPath(rootInfo.path)
        if (rootKindRef.current !== rootInfo.kind) setRootKind(rootInfo.kind)

        const nextEntries = snapshot.entries

        if (!areWorkspaceEntriesEqual(entriesRef.current, nextEntries)) {
          setEntries(nextEntries)
        }
        const filesOnly = nextEntries.filter(isWorkspaceFileEntry)

        if (filesOnly.length === 0 && options?.tabs) {
          setTabs(options.tabs)
          setActiveTabId(options.activeTabId ?? null)
          if (!options.preserveCurrentRoute) navigate('/', { replace: true })
        }
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
    async (path: string, options: { preserveTabs?: boolean } = {}): Promise<boolean> => {
      if (rootSwitchingRef.current) return false
      setRootSwitching(rootSwitchingRef, true)
      try {
        const opened = await runInDesktop(async () => {
          await onBeforeWorkspaceOpen?.()
          await flushEditorChanges()
          await selectProjectRoot(path)
          touchRecentProject(path)
          await loadWorkspace({
            preserveCurrentRoute: false,
            ...(options.preserveTabs ? {} : { tabs: [], activeTabId: null }),
          })
          await onWorkspaceOpened?.()
          return true
        })
        return opened === true
      } catch (error) {
        toast.error(t('projectLoader.openPathFailed'), {
          description: `${path}\n${projectLoaderErrorMessage(error)}`,
        })
        return false
      } finally {
        setRootSwitching(rootSwitchingRef, false)
      }
    },
    [
      loadWorkspace,
      onBeforeWorkspaceOpen,
      onWorkspaceOpened,
      rootSwitchingRef,
      t,
      touchRecentProject,
    ],
  )

  const onCreateWorkspace = useCreateWorkspace(openFolder, rootSwitchingRef, onBeforeWorkspaceOpen)

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

  const onUseInternalRoot = useCallback(async (): Promise<boolean> => {
    if (rootSwitchingRef.current) return false
    setRootSwitching(rootSwitchingRef, true)
    try {
      const opened = await runInDesktop(async () => {
        await onBeforeWorkspaceOpen?.()
        await flushEditorChanges()
        if (rootKindRef.current !== 'internal') await fsApi.setRoot(null)
        await loadWorkspace({
          preserveCurrentRoute: false,
          ...(rootKindRef.current === 'internal' ? {} : { tabs: [], activeTabId: null }),
        })
        await onWorkspaceOpened?.()
        return true
      })
      return opened === true
    } catch (error) {
      toast.error(t('projectLoader.openLocalWorkspaceFailed'), {
        description: projectLoaderErrorMessage(error),
      })
      return false
    } finally {
      setRootSwitching(rootSwitchingRef, false)
    }
  }, [loadWorkspace, onBeforeWorkspaceOpen, onWorkspaceOpened, rootKindRef, rootSwitchingRef, t])

  const pathActions = useProjectPathActions({
    rootPath,
    rootKind,
    tabs,
    activeTabId,
    locationPathname,
    loadWorkspace,
    mutationInProgress: pathMutationInProgress,
    onBeforePathMutation,
    setTabs,
    setActiveTabId,
    navigate,
  })
  return {
    loadWorkspace,
    onCreateWorkspace,
    onSelectFolder,
    onSelectSingleFile,
    onUseInternalRoot,
    openFolder,
    ...pathActions,
  }
}
