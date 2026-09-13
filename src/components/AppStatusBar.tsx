import { memo, useCallback, useMemo } from 'react'
import { useQuery } from '@tanstack/react-query'
import { useSearchParams } from 'react-router-dom'
import { TooltipProvider } from '@/components/ui/tooltip'
import { AppStatusBarLeft } from '@/components/AppStatusBarLeft'
import { AppStatusBarRight } from '@/components/AppStatusBarRight'
import { EditorStatusBarSlot } from '@/components/EditorStatusBar'
import { SIDEBAR_ACTIVITY_PARAM } from '@/logic/routing'
import { countChangedFiles, countGitConflicts, gitStatusQueryKey } from '@/logic/gitStatus'
import { useI18n } from '@/i18n/useI18n'
import { gitApi } from '@/services/gitApi'
import { useMarkdownAssetSyncStore } from '@/store/useMarkdownAssetSyncStore'
import { isDesktopRuntime } from '@/runtime/environment'
import type { SaveState } from '@/app/useEditorBuffer'
import type { FileEntry, ViewMode, WorkspaceTab } from '@/store/appTypes'

type AppStatusBarProps = {
  rootKind: 'internal' | 'external' | 'single'
  rootPath: string
  files: FileEntry[]
  tabs: WorkspaceTab[]
  activeTab: WorkspaceTab | null
  activePath: string | null
  viewMode: ViewMode
  dirtyPaths: Record<string, true>
  saveStates: Record<string, SaveState>
  terminalOpen: boolean
  onToggleTerminal: () => void
  onRestoreSession: () => void
  restoreStatusMessage: string | null
  restoreStatusBusy: boolean
}

const basename = (path: string) => {
  return path.split(/[\\/]/).filter(Boolean).pop() ?? path
}

const AppStatusBar = ({
  rootKind,
  rootPath,
  files,
  activePath,
  dirtyPaths,
  saveStates,
  terminalOpen,
  onToggleTerminal,
  onRestoreSession,
  restoreStatusMessage,
  restoreStatusBusy,
}: AppStatusBarProps) => {
  const { t } = useI18n()
  const [, setSearchParams] = useSearchParams()
  const assetSyncPending = useMarkdownAssetSyncStore((state) => state.pending)
  const assetSyncFailed = useMarkdownAssetSyncStore((state) => state.failed)
  const assetSyncLastError = useMarkdownAssetSyncStore((state) => state.lastError)
  const gitEnabled = isDesktopRuntime() && rootKind !== 'single' && Boolean(rootPath)
  const queryKey = useMemo(() => gitStatusQueryKey(rootPath), [rootPath])

  const gitStatusQuery = useQuery({
    queryKey,
    queryFn: () => gitApi.getStatus(rootPath),
    enabled: gitEnabled,
    staleTime: 2_000,
  })

  const openScmPanel = useCallback(() => {
    setSearchParams(
      (params) => {
        const next = new URLSearchParams(params)
        next.set(SIDEBAR_ACTIVITY_PARAM, 'scm')
        return next
      },
      { replace: false },
    )
  }, [setSearchParams])

  const markdownFileCount = useMemo(
    () => files.filter((entry) => entry.kind === 'file').length,
    [files],
  )
  const dirtyCount = Object.keys(dirtyPaths).length
  const activeSaveState = activePath ? saveStates[activePath] : undefined
  const workspaceLabel =
    rootKind === 'single'
      ? t('statusBar.singleFile')
      : rootPath
        ? basename(rootPath)
        : t('statusBar.noWorkspace')
  const gitChangeCount = countChangedFiles(gitStatusQuery.data)
  const gitConflictCount = countGitConflicts(gitStatusQuery.data)
  const gitBranch = gitStatusQuery.data?.repo.branch ?? t('scm.noBranch')
  const gitLabel = !gitEnabled
    ? rootKind === 'single'
      ? t('statusBar.singleFile')
      : t('statusBar.gitUnavailable')
    : gitStatusQuery.isLoading
      ? t('statusBar.gitChecking')
      : gitStatusQuery.isError
        ? t('statusBar.gitError')
        : !gitStatusQuery.data?.repo.is_repository
          ? t('statusBar.gitUnavailable')
          : gitConflictCount > 0
            ? t('statusBar.gitConflicts', { count: String(gitConflictCount) })
            : gitChangeCount > 0
              ? t('statusBar.gitChanges', { count: String(gitChangeCount) })
              : t('statusBar.gitClean')

  return (
    <TooltipProvider>
      <footer
        aria-label={t('statusBar.label')}
        className="app-status-bar flex min-h-7 shrink-0 items-center justify-between gap-3 px-2 text-[11px] text-muted-foreground"
      >
        <AppStatusBarLeft
          gitBranch={gitBranch}
          gitHasProblem={gitConflictCount > 0 || gitStatusQuery.isError}
          gitIsFetching={gitStatusQuery.isFetching}
          gitIsRepository={Boolean(gitStatusQuery.data?.repo.is_repository)}
          gitLabel={gitLabel}
          markdownFileCount={markdownFileCount}
          restoreStatusBusy={restoreStatusBusy}
          restoreStatusMessage={restoreStatusMessage}
          terminalOpen={terminalOpen}
          workspaceLabel={workspaceLabel}
          onOpenScmPanel={openScmPanel}
          onRestoreSession={onRestoreSession}
          onToggleTerminal={onToggleTerminal}
        />
        <EditorStatusBarSlot label={t('statusBar.label')} />
        <AppStatusBarRight
          activePath={activePath}
          activeSaveState={activeSaveState}
          assetSyncFailed={assetSyncFailed}
          assetSyncLastError={assetSyncLastError}
          assetSyncPending={assetSyncPending}
          dirtyCount={dirtyCount}
          dirtyPaths={dirtyPaths}
          saveStates={saveStates}
          terminalOpen={terminalOpen}
        />
      </footer>
    </TooltipProvider>
  )
}

export default memo(AppStatusBar)
