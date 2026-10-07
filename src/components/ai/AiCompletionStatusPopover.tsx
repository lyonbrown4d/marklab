import { Settings2, Sparkles } from 'lucide-react'
import { useAiProvidersQuery } from '@/components/ai/aiProviderQuery'
import { Button } from '@/components/ui/button'
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { Switch } from '@/components/ui/switch'
import { useI18n } from '@/i18n/useI18n'
import { isDesktopRuntime } from '@/runtime/environment'
import type { AiCompletionTriggerMode } from '@/store/aiCompletionPreferences'
import { usePreferencesStore } from '@/store/usePreferencesStore'

type AiCompletionStatusPopoverProps = {
  onOpenSettings: () => void
}

const triggerModes: AiCompletionTriggerMode[] = ['fast', 'balanced', 'battery-saver']

export const AiCompletionStatusPopover = ({ onOpenSettings }: AiCompletionStatusPopoverProps) => {
  const { t } = useI18n()
  const enabled = usePreferencesStore((state) => state.aiCompletionEnabled)
  const providerId = usePreferencesStore((state) => state.aiCompletionProviderId)
  const defaultProviderId = usePreferencesStore((state) => state.aiDefaultProviderId)
  const triggerMode = usePreferencesStore((state) => state.aiCompletionTriggerMode)
  const setEnabled = usePreferencesStore((state) => state.setAiCompletionEnabled)
  const setTriggerMode = usePreferencesStore((state) => state.setAiCompletionTriggerMode)
  const providersQuery = useAiProvidersQuery(isDesktopRuntime())
  const provider = providersQuery.data?.find(
    (candidate) => candidate.id === (providerId ?? defaultProviderId),
  )
  const providerLabel = provider
    ? `${provider.label} · ${provider.model}`
    : t('statusBar.aiNoModel')
  const stateLabel = enabled
    ? provider?.locality === 'local'
      ? t('statusBar.aiCompletionLocal')
      : t('statusBar.aiCompletionOn')
    : t('statusBar.aiCompletion')

  return (
    <Popover>
      <PopoverTrigger asChild>
        <Button
          aria-label={t('statusBar.aiCompletion')}
          aria-pressed={enabled}
          className="h-6 gap-1.5 rounded border border-transparent px-2 text-[11px] font-medium text-muted-foreground shadow-none hover:border-border/70 hover:bg-accent hover:text-foreground"
          size="sm"
          type="button"
          variant="ghost"
        >
          <span
            aria-hidden="true"
            className={enabled ? 'size-1.5 rounded-full bg-status-success' : 'hidden'}
          />
          <Sparkles aria-hidden="true" className="size-3.5" />
          <span data-status-label>{stateLabel}</span>
        </Button>
      </PopoverTrigger>
      <PopoverContent align="end" className="w-80 p-0" side="top" sideOffset={8}>
        <div className="flex items-start justify-between gap-4 p-3">
          <div className="min-w-0">
            <p className="text-sm font-medium">{t('statusBar.aiCompletion')}</p>
            <p className="mt-0.5 truncate text-xs text-muted-foreground" title={providerLabel}>
              {providerLabel}
            </p>
          </div>
          <Switch
            aria-label={t('statusBar.aiCompletionEnabled')}
            checked={enabled}
            disabled={!provider}
            onCheckedChange={setEnabled}
          />
        </div>
        <div className="border-t border-border/70 p-3">
          <label className="mb-1.5 block text-xs text-muted-foreground" htmlFor="ai-trigger-mode">
            {t('statusBar.aiCompletionDelay')}
          </label>
          <Select
            onValueChange={(value) => setTriggerMode(value as AiCompletionTriggerMode)}
            value={triggerMode}
          >
            <SelectTrigger className="h-8 text-xs" id="ai-trigger-mode">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {triggerModes.map((mode) => (
                <SelectItem key={mode} value={mode}>
                  {t(`settings.aiCompletionTrigger.${mode}`)}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        <div className="border-t border-border/70 p-1.5">
          <Button
            aria-label={t('statusBar.aiCompletionSettings')}
            className="h-8 w-full justify-start text-xs"
            onClick={onOpenSettings}
            size="sm"
            type="button"
            variant="ghost"
          >
            <Settings2 aria-hidden="true" />
            {t('statusBar.aiCompletionSettings')}
          </Button>
        </div>
      </PopoverContent>
    </Popover>
  )
}
