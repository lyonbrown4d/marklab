import { AlertTriangle, CheckCircle2, PanelsTopLeft } from 'lucide-react'
import { Separator } from '@/components/ui/separator'
import { Spinner } from '@/components/ui/spinner'
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip'
import StatusCenter from '@/components/StatusCenter'
import { useI18n } from '@/i18n/useI18n'
import type { SaveState } from '@/app/useEditorBuffer'
import type { ViewMode } from '@/store/appTypes'

type AppStatusBarRightProps = {
  activeLabel: string
  activePath: string | null
  activeSaveState?: SaveState
  assetSyncFailed: number
  assetSyncLastError: string | null
  assetSyncPending: number
  dirtyCount: number
  dirtyPaths: Record<string, true>
  saveStates: Record<string, SaveState>
  tabsCount: number
  terminalOpen: boolean
  viewMode: ViewMode
}

const viewLabelKeys: Record<ViewMode, string> = {
  wysiwyg: 'editor.modeWysiwyg',
  source: 'editor.modeSource',
  graph: 'tabs.graph',
  preview: 'editor.modePreview',
}

export const AppStatusBarRight = ({
  activeLabel,
  activePath,
  activeSaveState,
  assetSyncFailed,
  assetSyncLastError,
  assetSyncPending,
  dirtyCount,
  dirtyPaths,
  saveStates,
  tabsCount,
  terminalOpen,
  viewMode,
}: AppStatusBarRightProps) => {
  const { t } = useI18n()

  return (
    <div className="flex min-w-0 items-center justify-end gap-2" aria-live="polite">
      {dirtyCount > 0 && (
        <span className="hidden shrink-0 text-status-warning md:inline">
          {t('statusBar.unsavedFiles', { count: String(dirtyCount) })}
        </span>
      )}
      {activeSaveState?.status === 'saving' && (
        <span className="hidden shrink-0 text-status-info sm:inline">{t('save.saving')}</span>
      )}
      {activeSaveState?.status === 'error' && (
        <span className="hidden shrink-0 text-destructive sm:inline">{t('save.error')}</span>
      )}
      {assetSyncPending > 0 && (
        <span className="hidden shrink-0 items-center gap-1.5 text-status-info sm:inline-flex">
          <Spinner aria-hidden="true" role="presentation" className="size-3.5" />
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
              <AlertTriangle aria-hidden="true" className="size-3.5" />
              {t('statusBar.assetsFailed', { count: String(assetSyncFailed) })}
            </span>
          </TooltipTrigger>
          <TooltipContent>
            {assetSyncLastError ?? t('statusBar.assetsFailedTooltip')}
          </TooltipContent>
        </Tooltip>
      )}
      <span className="hidden shrink-0 sm:inline">{t(viewLabelKeys[viewMode])}</span>
      <Separator orientation="vertical" className="hidden h-3.5 bg-border/80 md:block" />
      <span className="hidden shrink-0 items-center gap-1.5 md:inline-flex">
        <PanelsTopLeft aria-hidden="true" className="size-3.5" />
        {t('statusBar.tabs', { count: String(tabsCount) })}
      </span>
      <Separator orientation="vertical" className="h-3.5 bg-border/80" />
      <StatusCenter
        activePath={activePath}
        dirtyPaths={dirtyPaths}
        saveStates={saveStates}
        terminalOpen={terminalOpen}
      />
      <Separator orientation="vertical" className="h-3.5 bg-border/80" />
      <span className="min-w-0 max-w-[320px] truncate" title={activeLabel}>
        {activeLabel}
      </span>
      {activeSaveState?.status === 'saved' && (
        <CheckCircle2
          aria-hidden="true"
          className="hidden size-3.5 shrink-0 text-status-success sm:block"
        />
      )}
    </div>
  )
}
