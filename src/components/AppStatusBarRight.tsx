import { AlertTriangle } from 'lucide-react'
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
}

export const AppStatusBarRight = ({
  activePath,
  activeSaveState,
  assetSyncFailed,
  assetSyncLastError,
  assetSyncPending,
  dirtyCount,
  dirtyPaths,
  saveStates,
  terminalOpen,
}: AppStatusBarRightProps) => {
  const { t } = useI18n()

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
      <StatusCenter
        activePath={activePath}
        dirtyPaths={dirtyPaths}
        saveStates={saveStates}
        terminalOpen={terminalOpen}
      />
    </div>
  )
}
