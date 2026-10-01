import { memo } from 'react'
import { AlertTriangle, LockKeyhole, LockKeyholeOpen } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Spinner } from '@/components/ui/spinner'
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip'
import StatusCenter from '@/components/StatusCenter'
import { useI18n } from '@/i18n/useI18n'
import type { SaveState } from '@/app/useEditorBuffer'

type AppStatusBarRightProps = {
  activePath: string | null
  activeSaveState?: SaveState
  assetSyncFailed: number
  assetSyncLastError: string | null
  assetSyncPending: number
  dirtyCount: number
  dirtyPaths: Record<string, true>
  saveStates: Record<string, SaveState>
  terminalOpen: boolean
  readOnlyMode: boolean
  onToggleReadOnly: () => void
}

const AppStatusBarRightView = ({
  activePath,
  activeSaveState,
  assetSyncFailed,
  assetSyncLastError,
  assetSyncPending,
  dirtyCount,
  dirtyPaths,
  saveStates,
  terminalOpen,
  readOnlyMode,
  onToggleReadOnly,
}: AppStatusBarRightProps) => {
  const { t } = useI18n()
  const readOnlyLabel = t(readOnlyMode ? 'statusBar.readOnlyLocked' : 'statusBar.readOnlyEditable')
  const readOnlyAction = t(readOnlyMode ? 'statusBar.disableReadOnly' : 'statusBar.enableReadOnly')

  return (
    <div className="flex shrink-0 items-center justify-end gap-3" aria-live="polite">
      {dirtyCount > 0 && (
        <span className="shrink-0 text-status-warning">
          {t('statusBar.unsavedFiles', { count: String(dirtyCount) })}
        </span>
      )}
      {activeSaveState?.status === 'saving' && (
        <span className="shrink-0 text-status-info" title={activePath ?? undefined}>
          {t('save.saving')}
        </span>
      )}
      {activeSaveState?.status === 'error' && (
        <span className="shrink-0 text-destructive" title={activePath ?? undefined}>
          {t('save.error')}
        </span>
      )}
      {activePath && activeSaveState?.status === 'saved' && !dirtyPaths[activePath] && (
        <span className="shrink-0" title={activePath}>
          {t('save.saved')}
        </span>
      )}
      {assetSyncPending > 0 && (
        <span className="inline-flex shrink-0 items-center gap-1.5 text-status-info">
          <Spinner aria-hidden="true" role="presentation" className="size-3.5" />
          {t('statusBar.assetsSyncing', { count: String(assetSyncPending) })}
        </span>
      )}
      {assetSyncPending === 0 && assetSyncFailed > 0 && (
        <Tooltip>
          <TooltipTrigger asChild>
            <span
              className="inline-flex shrink-0 items-center gap-1.5 text-destructive"
              title={assetSyncLastError ?? t('statusBar.assetsFailedTooltip')}
            >
              <AlertTriangle aria-hidden="true" className="size-3.5" />
              {t('statusBar.assetsFailed', { count: String(assetSyncFailed) })}
            </span>
          </TooltipTrigger>
          <TooltipContent>
            {assetSyncLastError ?? t('statusBar.assetsFailedTooltip')}
          </TooltipContent>
        </Tooltip>
      )}
      <Tooltip>
        <TooltipTrigger asChild>
          <Button
            type="button"
            variant="ghost"
            size="sm"
            className={`h-6 gap-1.5 rounded border px-2 text-[11px] font-medium shadow-none transition-[background-color,border-color,color,box-shadow] duration-[180ms] ease-out motion-reduce:transition-none ${
              readOnlyMode
                ? 'border-status-warning/50 bg-status-warning/10 text-foreground hover:border-status-warning/60 hover:bg-status-warning/15 hover:text-foreground'
                : 'border-transparent text-muted-foreground hover:border-border/70 hover:bg-accent hover:text-foreground'
            }`}
            aria-label={readOnlyAction}
            aria-pressed={readOnlyMode}
            data-read-only={readOnlyMode}
            onClick={onToggleReadOnly}
          >
            {readOnlyMode ? (
              <LockKeyhole
                aria-hidden="true"
                className="text-status-warning"
                data-icon="read-only-locked"
              />
            ) : (
              <LockKeyholeOpen aria-hidden="true" data-icon="read-only-unlocked" />
            )}
            <span>{readOnlyLabel}</span>
          </Button>
        </TooltipTrigger>
        <TooltipContent>{readOnlyAction}</TooltipContent>
      </Tooltip>
      <StatusCenter
        activePath={activePath}
        dirtyPaths={dirtyPaths}
        saveStates={saveStates}
        terminalOpen={terminalOpen}
      />
    </div>
  )
}

export const AppStatusBarRight = memo(AppStatusBarRightView)
