import { useState } from 'react'
import { Badge } from '@/components/ui/badge'
import { SettingsActionButton } from '@/components/settings/SettingsButtons'
import { useI18n } from '@/i18n/useI18n'
import type { AiProviderUpdate, PublicAiProvider } from '@/services/aiApi'
import { usePreferencesStore } from '@/store/usePreferencesStore'
import { AiProviderForm } from '@/components/settings/AiProviderForm'
import {
  isAiProviderUsable,
  isLoopbackHttpUrl,
  isOllamaPreset,
} from '@/components/settings/aiProviderUtils'

type ProviderRowProps = {
  provider: PublicAiProvider
  deletePending: boolean
  testPending: boolean
  savePending: boolean
  saveError?: string
  testPassed: boolean
  onSave: (input: AiProviderUpdate) => Promise<void>
  onDelete: (id: string) => void
  onTest: (id: string) => void
  onStartEdit: () => void
  onClearCredential: (provider: PublicAiProvider) => void
}

export const AiProviderRow = ({
  provider,
  deletePending,
  testPending,
  savePending,
  saveError,
  testPassed,
  onSave,
  onDelete,
  onTest,
  onStartEdit,
  onClearCredential,
}: ProviderRowProps) => {
  const { t } = useI18n()
  const [editing, setEditing] = useState(false)
  const defaultId = usePreferencesStore((state) => state.aiDefaultProviderId)
  const setDefaultId = usePreferencesStore((state) => state.setAiDefaultProviderId)
  const usable = isAiProviderUsable(provider)

  const handleSave = async (input: AiProviderUpdate) => {
    try {
      await onSave(input)
      setEditing(false)
    } catch {
      // The mutation exposes the actionable error in the form.
    }
  }

  if (editing) {
    return (
      <AiProviderForm
        mode={
          provider.kind === 'openai-compatible'
            ? isOllamaPreset(provider)
              ? 'ollama'
              : 'compatible'
            : 'cloud'
        }
        provider={provider}
        pending={savePending}
        error={saveError}
        onCancel={() => setEditing(false)}
        onSave={handleSave}
      />
    )
  }

  return (
    <div className="border-t border-border/70 py-3 first:border-t-0 first:pt-0 last:pb-0">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <p className="text-sm font-medium">{provider.label}</p>
          <p className="mt-1 text-xs text-muted-foreground">{provider.model}</p>
          {provider.apiKeySource === 'stored' && (
            <p className="mt-1 text-xs text-muted-foreground">{t('settings.aiCredentialStored')}</p>
          )}
          {provider.apiKeySource === 'environment' && (
            <p className="mt-1 text-xs text-muted-foreground">
              {t('settings.aiCredentialEnvironment')}
            </p>
          )}
          {!usable && (
            <p className="mt-1 text-xs text-destructive">{t('settings.aiCredentialRequired')}</p>
          )}
          {provider.kind === 'openai-compatible' && (
            <p className="mt-1 text-xs text-muted-foreground">
              {isLoopbackHttpUrl(provider.baseUrl)
                ? t('settings.aiLoopbackPrivacy')
                : t('settings.aiCompatibleRemoteWarning')}
            </p>
          )}
        </div>
        <div className="flex flex-wrap justify-end gap-2">
          {defaultId === provider.id ? (
            <Badge variant="outline">{t('settings.aiDefaultActive')}</Badge>
          ) : (
            <SettingsActionButton
              aria-label={`${t('settings.aiMakeDefault')} ${provider.label}`}
              onClick={() => setDefaultId(provider.id)}
              disabled={!usable}
            >
              {t('settings.aiMakeDefault')}
            </SettingsActionButton>
          )}
          <SettingsActionButton
            aria-label={`${t('settings.aiTest')} ${provider.label}`}
            onClick={() => onTest(provider.id)}
            disabled={testPending}
          >
            {t('settings.aiTest')}
          </SettingsActionButton>
          <SettingsActionButton
            aria-label={`${t('settings.edit')} ${provider.label}`}
            variant="ghost"
            onClick={() => {
              onStartEdit()
              setEditing(true)
            }}
            disabled={savePending}
          >
            {t('settings.edit')}
          </SettingsActionButton>
          <SettingsActionButton
            aria-label={`${t('settings.delete')} ${provider.label}`}
            variant="ghost"
            onClick={() => onDelete(provider.id)}
            disabled={deletePending}
          >
            {t('settings.delete')}
          </SettingsActionButton>
          {provider.apiKeySource === 'stored' && (
            <SettingsActionButton
              aria-label={`${t('settings.aiClearCredential')} ${provider.label}`}
              variant="ghost"
              onClick={() => onClearCredential(provider)}
              disabled={savePending}
            >
              {t('settings.aiClearCredential')}
            </SettingsActionButton>
          )}
        </div>
      </div>
      {testPassed && (
        <p role="status" className="mt-2 text-xs">
          {t('settings.aiTestSucceeded')}
        </p>
      )}
    </div>
  )
}
