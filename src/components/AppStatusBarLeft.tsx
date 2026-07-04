import { AlertTriangle, FileText, FolderOpen, GitBranch, RotateCcw, Terminal } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Separator } from '@/components/ui/separator'
import { Spinner } from '@/components/ui/spinner'
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip'
import { useI18n } from '@/i18n/useI18n'

type AppStatusBarLeftProps = {
  gitBranch: string
  gitHasProblem: boolean
  gitIsFetching: boolean
  gitIsRepository: boolean
  gitLabel: string
  markdownFileCount: number
  restoreStatusBusy: boolean
  restoreStatusMessage: string | null
  terminalOpen: boolean
  workspaceLabel: string
  onOpenScmPanel: () => void
  onRestoreSession: () => void
  onToggleTerminal: () => void
}

export const AppStatusBarLeft = ({
  gitBranch,
  gitHasProblem,
  gitIsFetching,
  gitIsRepository,
  gitLabel,
  markdownFileCount,
  restoreStatusBusy,
  restoreStatusMessage,
  terminalOpen,
  workspaceLabel,
  onOpenScmPanel,
  onRestoreSession,
  onToggleTerminal,
}: AppStatusBarLeftProps) => {
  const { t } = useI18n()

  return (
    <div className="flex min-w-0 items-center gap-1.5">
      <Tooltip>
        <TooltipTrigger asChild>
          <Button
            type="button"
            variant="ghost"
            size="sm"
            className="h-6 max-w-[220px] gap-1.5 rounded px-2 text-[11px] font-normal text-muted-foreground"
            aria-label={t('statusBar.openScm')}
            onClick={onOpenScmPanel}
          >
            {gitIsFetching ? (
              <Spinner aria-hidden="true" role="presentation" data-icon="inline-start" />
            ) : gitHasProblem ? (
              <AlertTriangle
                aria-hidden="true"
                className="text-destructive"
                data-icon="inline-start"
              />
            ) : (
              <GitBranch aria-hidden="true" data-icon="inline-start" />
            )}
            <span className="truncate">
              {gitIsRepository ? `${gitBranch} · ${gitLabel}` : gitLabel}
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
            className="size-6 rounded"
            aria-label={t('statusBar.toggleTerminal')}
            aria-pressed={terminalOpen}
            onClick={onToggleTerminal}
          >
            <Terminal aria-hidden="true" data-icon="icon" />
          </Button>
        </TooltipTrigger>
        <TooltipContent>{t('statusBar.toggleTerminal')}</TooltipContent>
      </Tooltip>
      <Separator orientation="vertical" className="hidden h-3.5 bg-border/80 sm:block" />
      <div className="hidden min-w-0 items-center gap-1.5 px-1 sm:flex">
        <FolderOpen aria-hidden="true" className="size-3.5 shrink-0" />
        <span className="max-w-[240px] truncate">{workspaceLabel}</span>
      </div>
      {restoreStatusMessage ? (
        <div className="inline-flex min-w-0 items-center gap-1.5">
          <Tooltip>
            <TooltipTrigger asChild>
              <div
                className="inline-flex min-w-0 items-center gap-1.5 text-status-warning"
                role="status"
                title={restoreStatusMessage}
              >
                <AlertTriangle aria-hidden="true" className="size-3.5 shrink-0" />
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
              <Spinner aria-hidden="true" role="presentation" data-icon="inline-start" />
            ) : (
              <RotateCcw aria-hidden="true" data-icon="inline-start" />
            )}
            {t('app.restoreRetry')}
          </Button>
        </div>
      ) : null}
      <div className="hidden items-center gap-1.5 px-1 md:flex">
        <FileText aria-hidden="true" className="size-3.5" />
        <span>{t('statusBar.files', { count: String(markdownFileCount) })}</span>
      </div>
    </div>
  )
}
