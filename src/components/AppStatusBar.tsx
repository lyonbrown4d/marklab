import { memo, useCallback, useMemo } from 'react'
import { useQuery } from '@tanstack/react-query'
import {
  AlertTriangle,
  CheckCircle2,
  FileText,
  FolderOpen,
  GitBranch,
  Loader2,
  PanelsTopLeft,
  RotateCcw,
  Terminal,
} from 'lucide-react'
import { useSearchParams } from 'react-router-dom'
import { Button } from '@/components/ui/button'
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip'
import StatusCenter from '@/components/StatusCenter'
import { createFileLabel } from '@/logic/paths'
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

const viewLabelKeys: Record<ViewMode, string> = {
  wysiwyg: 'editor.modeWysiwyg',
  source: 'editor.modeSource',
  graph: 'tabs.graph',
  preview: 'editor.modePreview',
}

const basename = (path: string) => {
  return path.split(/[\\/]/).filter(Boolean).pop() ?? path
}

const getActiveResourceLabel = (activeTab: WorkspaceTab | null, activePath: string | null) => {
  if (!activeTab) return null
  if (activeTab.kind === 'workspace-graph') return 'workspace-graph'
  if (activeTab.kind === 'git-diff') return `${createFileLabel(activeTab.path)} · Diff`
  return activePath ?? activeTab.path
}

const AppStatusBar = ({
  rootKind,
  rootPath,
  files,
  tabs,
  activeTab,
  activePath,
  viewMode,
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
  const activeResourceLabel = getActiveResourceLabel(activeTab, activePath)
  const activeLabel =
    activeResourceLabel === 'workspace-graph'
      ? t('tabs.workspaceGraph')
      : (activeResourceLabel ?? t('statusBar.noFile'))

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
        className="app-status-bar flex h-7 shrink-0 items-center justify-between gap-2 border-t border-border/80 px-2 text-[11px] text-muted-foreground"
      >
        <div className="flex min-w-0 items-center gap-1.5">
          <Tooltip>
            <TooltipTrigger asChild>
              <Button
                type="button"
                variant="ghost"
                size="sm"
                className="h-6 max-w-[220px] gap-1.5 rounded px-2 text-[11px] font-normal text-muted-foreground"
                aria-label={t('statusBar.openScm')}
                onClick={openScmPanel}
              >
                {gitStatusQuery.isFetching ? (
                  <Loader2 aria-hidden="true" className="h-3.5 w-3.5 animate-spin" />
                ) : gitConflictCount > 0 || gitStatusQuery.isError ? (
                  <AlertTriangle aria-hidden="true" className="h-3.5 w-3.5 text-destructive" />
                ) : (
                  <GitBranch aria-hidden="true" className="h-3.5 w-3.5" />
                )}
                <span className="truncate">
                  {gitStatusQuery.data?.repo.is_repository
                    ? `${gitBranch} · ${gitLabel}`
                    : gitLabel}
                </span>
              </Button>
            </TooltipTrigger>
            <TooltipContent>{t('statusBar.openScm')}</TooltipContent>
          </Tooltip>
          <Tooltip>
            <TooltipTrigger asChild>
              <Button
                type="button"
                variant={terminalOpen ? 'secondary' : 'ghost'}
                size="icon"
                className="h-6 w-6 rounded"
                aria-label={t('statusBar.toggleTerminal')}
                aria-pressed={terminalOpen}
                onClick={onToggleTerminal}
              >
                <Terminal aria-hidden="true" className="h-3.5 w-3.5" />
              </Button>
            </TooltipTrigger>
            <TooltipContent>{t('statusBar.toggleTerminal')}</TooltipContent>
          </Tooltip>
          <div className="hidden h-3.5 w-px bg-border/80 sm:block" />
          <div className="hidden min-w-0 items-center gap-1.5 px-1 sm:flex">
            <FolderOpen aria-hidden="true" className="h-3.5 w-3.5 shrink-0" />
            <span className="max-w-[240px] truncate">{workspaceLabel}</span>
          </div>
          {restoreStatusMessage ? (
            <div className="inline-flex min-w-0 items-center gap-1.5">
              <Tooltip>
                <TooltipTrigger asChild>
                  <div
                    className="inline-flex min-w-0 items-center gap-1.5 text-amber-600"
                    role="status"
                    title={restoreStatusMessage}
                  >
                    <AlertTriangle aria-hidden="true" className="h-3.5 w-3.5 shrink-0" />
                    <span className="max-w-[180px] truncate">{restoreStatusMessage}</span>
                  </div>
                </TooltipTrigger>
                <TooltipContent>{restoreStatusMessage}</TooltipContent>
              </Tooltip>
              <Button
                type="button"
                variant="outline"
                size="sm"
                className="h-6 gap-1.5 px-2"
                onClick={onRestoreSession}
                disabled={restoreStatusBusy}
              >
                {restoreStatusBusy ? (
                  <Loader2 aria-hidden="true" className="h-3.5 w-3.5 animate-spin" />
                ) : (
                  <RotateCcw aria-hidden="true" className="h-3.5 w-3.5" />
                )}
                {t('app.restoreRetry')}
              </Button>
            </div>
          ) : null}
          <div className="hidden items-center gap-1.5 px-1 md:flex">
            <FileText aria-hidden="true" className="h-3.5 w-3.5" />
            <span>{t('statusBar.files', { count: String(markdownFileCount) })}</span>
          </div>
        </div>
        <div className="flex min-w-0 items-center justify-end gap-2" aria-live="polite">
          {dirtyCount > 0 && (
            <span className="hidden shrink-0 text-amber-600 md:inline">
              {t('statusBar.unsavedFiles', { count: String(dirtyCount) })}
            </span>
          )}
          {activeSaveState?.status === 'saving' && (
            <span className="hidden shrink-0 text-sky-600 sm:inline">{t('save.saving')}</span>
          )}
          {activeSaveState?.status === 'error' && (
            <span className="hidden shrink-0 text-destructive sm:inline">{t('save.error')}</span>
          )}
          {assetSyncPending > 0 && (
            <span className="hidden shrink-0 items-center gap-1.5 text-sky-600 sm:inline-flex">
              <Loader2 aria-hidden="true" className="h-3.5 w-3.5 animate-spin" />
              {t('statusBar.assetsSyncing', { count: String(assetSyncPending) })}
            </span>
          )}
          {assetSyncPending === 0 && assetSyncFailed > 0 && (
            <Tooltip>
              <TooltipTrigger asChild>
                <span
                  className="hidden shrink-0 items-center gap-1.5 text-destructive sm:inline-flex"
                  title={assetSyncLastError ?? t('statusBar.assetsFailedTooltip')}
                >
                  <AlertTriangle aria-hidden="true" className="h-3.5 w-3.5" />
                  {t('statusBar.assetsFailed', { count: String(assetSyncFailed) })}
                </span>
              </TooltipTrigger>
              <TooltipContent>
                {assetSyncLastError ?? t('statusBar.assetsFailedTooltip')}
              </TooltipContent>
            </Tooltip>
          )}
          <span className="hidden shrink-0 sm:inline">{t(viewLabelKeys[viewMode])}</span>
          <div className="hidden h-3.5 w-px bg-border/80 md:block" />
          <span className="hidden shrink-0 items-center gap-1.5 md:inline-flex">
            <PanelsTopLeft aria-hidden="true" className="h-3.5 w-3.5" />
            {t('statusBar.tabs', { count: String(tabs.length) })}
          </span>
          <div className="h-3.5 w-px bg-border/80" />
          <StatusCenter
            activePath={activePath}
            dirtyPaths={dirtyPaths}
            saveStates={saveStates}
            terminalOpen={terminalOpen}
          />
          <div className="h-3.5 w-px bg-border/80" />
          <span className="min-w-0 max-w-[320px] truncate" title={activeLabel}>
            {activeLabel}
          </span>
          {activeSaveState?.status === 'saved' && (
            <CheckCircle2
              aria-hidden="true"
              className="hidden h-3.5 w-3.5 shrink-0 text-emerald-600 sm:block"
            />
          )}
        </div>
      </footer>
    </TooltipProvider>
  )
}

export default memo(AppStatusBar)
