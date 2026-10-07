import { memo, useCallback, useMemo } from 'react'
import { useQuery } from '@tanstack/react-query'
import { useSearchParams } from 'react-router-dom'
import { TooltipProvider } from '@/components/AppTooltip'
import { AppStatusBarLeft } from '@/components/AppStatusBarLeft'
import { AppStatusBarRight } from '@/components/AppStatusBarRight'
import { EditorStatusBarSlot } from '@/components/EditorStatusBar'
import { SIDEBAR_ACTIVITY_PARAM } from '@/logic/routing'
import { useI18n } from '@/i18n/useI18n'
import { useMarkdownAssetSyncStore } from '@/store/useMarkdownAssetSyncStore'
import { usePreferencesStore } from '@/store/usePreferencesStore'
import { isDesktopRuntime } from '@/runtime/environment'
import { SyncCenterPopover } from '@/features/workspace-sync/SyncCenterPopover'
import { useWorkspaceSyncStatus } from '@/features/workspace-sync/useWorkspaceSyncStatus'
import { countChangedFiles, countGitConflicts, gitStatusQueryKey } from '@/logic/gitStatus'
import { gitApi } from '@/services/gitApi'
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
  readOnlyMode: boolean
  onToggleTerminal: () => void
  onToggleReadOnly: () => void
  onOpenSettings: () => void
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
  readOnlyMode,
  onToggleTerminal,
  onToggleReadOnly,
  onOpenSettings,
  onRestoreSession,
  restoreStatusMessage,
  restoreStatusBusy,
}: AppStatusBarProps) => {
  const { t } = useI18n()
  const [, setSearchParams] = useSearchParams()
  const assetSyncPending = useMarkdownAssetSyncStore((state) => state.pending)
  const assetSyncFailed = useMarkdownAssetSyncStore((state) => state.failed)
  const assetSyncLastError = useMarkdownAssetSyncStore((state) => state.lastError)
  const desktopWorkspaceEnabled = isDesktopRuntime() && rootKind !== 'single' && Boolean(rootPath)
  const workspaceSync = useWorkspaceSyncStatus({ rootKind, rootPath })
  const gitStatus = useQuery({
    queryKey: gitStatusQueryKey(rootPath),
    queryFn: () => gitApi.getStatus(rootPath),
    enabled: desktopWorkspaceEnabled,
    staleTime: 2_000,
  })

  const openScmPanel = useCallback(() => {
    usePreferencesStore.setState((current) =>
      current.sidebarCollapsed ? { sidebarCollapsed: false } : current,
    )
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
  const gitSnapshot = gitStatus.data
  const gitIsRepository = Boolean(gitSnapshot?.repo.is_repository)
  const gitChangeCount = countChangedFiles(gitSnapshot)
  const gitConflictCount = countGitConflicts(gitSnapshot)
  const gitBranch = gitIsRepository ? (gitSnapshot?.repo.branch ?? t('scm.noBranch')) : ''
  const gitLabel = !desktopWorkspaceEnabled
    ? rootKind === 'single'
      ? t('statusBar.singleFile')
      : t('statusBar.gitUnavailable')
    : gitStatus.isLoading
      ? t('statusBar.gitChecking')
      : gitStatus.isError
        ? t('statusBar.gitError')
        : !gitIsRepository
          ? t('statusBar.gitUnavailable')
          : gitConflictCount > 0
            ? t('statusBar.gitConflicts', { count: String(gitConflictCount) })
            : gitChangeCount > 0
              ? t('statusBar.gitChanges', { count: String(gitChangeCount) })
              : t('statusBar.gitClean')

  return (
    <TooltipProvider>
      <footer
        id="app-status-bar"
        aria-label={t('statusBar.label')}
        className="app-status-bar flex min-h-7 shrink-0 items-center justify-between gap-2 overflow-hidden border-t border-border/60 px-2 text-[11px] text-muted-foreground"
      >
        <AppStatusBarLeft
          gitBranch={gitBranch}
          gitHasProblem={gitConflictCount > 0 || gitStatus.isError}
          gitIsFetching={gitStatus.isFetching}
          gitIsRepository={gitIsRepository}
          gitLabel={gitLabel}
          markdownFileCount={markdownFileCount}
          restoreStatusBusy={restoreStatusBusy}
          restoreStatusMessage={restoreStatusMessage}
          terminalOpen={terminalOpen}
          workspaceLabel={workspaceLabel}
          syncControl={
            desktopWorkspaceEnabled ? (
              <SyncCenterPopover
                loading={workspaceSync.loading}
                webdav={workspaceSync.webdav}
                onCancel={workspaceSync.onCancel}
                cancelError={workspaceSync.cancelError}
                cancelPending={workspaceSync.cancelPending}
                onStart={workspaceSync.onStart}
              />
            ) : null
          }
          onOpenScmPanel={openScmPanel}
          onRestoreSession={onRestoreSession}
          onToggleTerminal={onToggleTerminal}
        />
        <EditorStatusBarSlot label={t('statusBar.label')} />
        <div className="flex shrink-0 items-center gap-1 pr-1">
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
            readOnlyMode={readOnlyMode}
            onToggleReadOnly={onToggleReadOnly}
            onOpenSettings={onOpenSettings}
          />
        </div>
      </footer>
    </TooltipProvider>
  )
}

export default memo(AppStatusBar)
