import { useId, useSyncExternalStore } from 'react'
import { Button } from '@/components/ui/button'
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover'
import { Switch } from '@/components/ui/switch'
import { useI18n } from '@/i18n/useI18n'
import { usePreferencesStore } from '@/store/usePreferencesStore'
import { useVimModeStore, vimTabKey } from '@/store/useVimModeStore'
import { getFocusedVimMode, onVimKeyboardScopeChange } from '@/components/vim/vimKeyboardScope'

type VimStatusBarControlProps = {
  workspaceKey: string
  tabId: string
  sourceEditor: boolean
  readOnlyMode: boolean
}

const getServerMode = () => null

export const VimStatusBarControl = ({
  workspaceKey,
  tabId,
  sourceEditor,
  readOnlyMode,
}: VimStatusBarControlProps) => {
  const { t } = useI18n()
  const currentSwitchId = useId()
  const globalSwitchId = useId()
  const globalEnabled = usePreferencesStore((state) => state.vimModeEnabled)
  const setGlobalEnabled = usePreferencesStore((state) => state.setVimModeEnabled)
  const override = useVimModeStore((state) => state.perTabOverrides[vimTabKey(workspaceKey, tabId)])
  const setTabOverride = useVimModeStore((state) => state.setTabOverride)
  const focusedMode = useSyncExternalStore(
    onVimKeyboardScopeChange,
    getFocusedVimMode,
    getServerMode,
  )
  const enabled = override ?? globalEnabled
  const modeLabel = !enabled
    ? t('statusBar.vimOff')
    : readOnlyMode
      ? t('statusBar.vimReadOnly')
      : focusedMode
        ? `Vim: ${focusedMode}`
        : t(sourceEditor ? 'statusBar.vimOn' : 'statusBar.vimSourceOnly')

  return (
    <Popover>
      <PopoverTrigger asChild>
        <Button
          variant="ghost"
          size="sm"
          className="h-6 px-1.5 font-mono text-[11px] text-muted-foreground hover:text-foreground"
          data-testid="vim-status-control"
          aria-label={t('statusBar.vimControl')}
          title={modeLabel}
        >
          <span aria-live="polite">{modeLabel}</span>
        </Button>
      </PopoverTrigger>
      <PopoverContent
        side="top"
        align="end"
        className="w-72 max-w-[calc(100vw-2rem)] space-y-3 p-3 text-xs"
      >
        <p className="font-medium">{t('settings.vimMode')}</p>
        <p className="text-muted-foreground">{t('statusBar.vimScope')}</p>
        <div className="flex items-center justify-between gap-3">
          <label htmlFor={currentSwitchId}>{t('statusBar.vimCurrentTab')}</label>
          <Switch
            data-testid="vim-tab-toggle"
            id={currentSwitchId}
            checked={enabled}
            onCheckedChange={(checked) => setTabOverride(workspaceKey, tabId, checked)}
          />
        </div>
        <Button
          variant="outline"
          size="sm"
          className="h-7 w-full text-xs"
          data-testid="vim-follow-global"
          disabled={override === undefined}
          onClick={() => setTabOverride(workspaceKey, tabId, undefined)}
        >
          {t('statusBar.vimFollowGlobal')}
        </Button>
        <p className="text-muted-foreground">
          {t(override === undefined ? 'statusBar.vimFollowingGlobal' : 'statusBar.vimTabOverride')}
        </p>
        <div className="flex items-center justify-between gap-3 border-t border-border/50 pt-3">
          <label htmlFor={globalSwitchId}>{t('statusBar.vimGlobalDefault')}</label>
          <Switch
            data-testid="vim-global-toggle"
            id={globalSwitchId}
            checked={globalEnabled}
            onCheckedChange={setGlobalEnabled}
          />
        </div>
      </PopoverContent>
    </Popover>
  )
}
