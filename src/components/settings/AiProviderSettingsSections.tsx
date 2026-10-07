import { Cloud, Server } from 'lucide-react'
import { useRef, useState, type RefObject } from 'react'
import { Alert, AlertDescription } from '@/components/ui/alert'
import { SettingsActionButton, SettingsEmptyState } from '@/components/settings/SettingsButtons'
import { SettingsSection } from '@/components/settings/SettingsRow'
import { useI18n } from '@/i18n/useI18n'
import type { AiProviderUpdate, PublicAiProvider } from '@/services/aiApi'
import { AiProviderDialog } from '@/components/settings/AiProviderDialog'
import { AiProviderRow } from '@/components/settings/AiProviderRow'
import { isOllamaPreset } from '@/components/settings/aiProviderUtils'
import { useAiProviders } from '@/components/settings/useAiProviders'

type ProviderListProps = {
  providers: PublicAiProvider[]
  emptyText: string
  actions: ReturnType<typeof useAiProviders>
  fallbackFocusRef: RefObject<HTMLElement | null>
}

const ProviderList = ({ providers, emptyText, actions, fallbackFocusRef }: ProviderListProps) => {
  const [testedId, setTestedId] = useState<string | null>(null)
  const saveError = actions.saveMutation.error?.message
  if (providers.length === 0) return <SettingsEmptyState>{emptyText}</SettingsEmptyState>

  const providerIds = new Set(providers.map((provider) => provider.id))
  const actionError =
    actions.testMutation.isError && providerIds.has(actions.testMutation.variables)
      ? actions.testMutation.error.message
      : undefined

  return (
    <>
      {actionError && (
        <p role="alert" className="mb-2 text-xs text-destructive">
          {actionError}
        </p>
      )}
      {providers.map((provider) => (
        <AiProviderRow
          key={provider.id}
          provider={provider}
          deletePending={actions.deleteMutation.isPending}
          deleteError={
            actions.deleteMutation.isError && actions.deleteMutation.variables === provider.id
              ? actions.deleteMutation.error.message
              : undefined
          }
          testPending={actions.testMutation.isPending}
          savePending={actions.saveMutation.isPending}
          saveError={saveError}
          clearCredentialError={
            actions.saveMutation.isError &&
            actions.saveMutation.variables.id === provider.id &&
            actions.saveMutation.variables.apiKey === null
              ? actions.saveMutation.error.message
              : undefined
          }
          fallbackFocusRef={fallbackFocusRef}
          testPassed={testedId === provider.id && actions.testMutation.isSuccess}
          onSave={async (input) => {
            await actions.saveMutation.mutateAsync(input)
          }}
          onDelete={(id) => actions.deleteMutation.mutateAsync(id)}
          onTest={(id) => {
            setTestedId(id)
            actions.testMutation.mutate(id)
          }}
          onStartEdit={() => actions.saveMutation.reset()}
          onStartDelete={() => actions.deleteMutation.reset()}
          onStartClearCredential={() => actions.saveMutation.reset()}
          onClearCredential={async (item) => {
            await actions.saveMutation.mutateAsync({
              id: item.id,
              label: item.label,
              kind: item.kind,
              model: item.model,
              ...(item.baseUrl ? { baseUrl: item.baseUrl } : {}),
              apiKey: null,
            })
          }}
        />
      ))}
    </>
  )
}

export const AiProviderSettingsSections = () => {
  const { t } = useI18n()
  const actions = useAiProviders()
  const localProviderFallbackRef = useRef<HTMLButtonElement>(null)
  const cloudProviderFallbackRef = useRef<HTMLButtonElement>(null)
  const [formMode, setFormMode] = useState<'ollama' | 'compatible' | 'cloud' | null>(null)
  const providers = actions.providersQuery.data ?? []
  const localProviders = providers.filter((provider) => provider.locality === 'local')
  const cloudProviders = providers.filter((provider) => provider.locality === 'remote')
  const ollamaProvider = localProviders.find(isOllamaPreset)

  const handleSave = async (input: AiProviderUpdate) => {
    if (actions.saveMutation.isPending) return
    try {
      await actions.saveMutation.mutateAsync(input)
      setFormMode(null)
    } catch {
      // The mutation error remains visible in the active form.
    }
  }

  const openForm = (mode: 'ollama' | 'compatible' | 'cloud') => {
    actions.saveMutation.reset()
    setFormMode(mode)
  }

  const queryState = actions.providersQuery.isPending ? (
    <p role="status">{t('settings.aiProvidersLoading')}</p>
  ) : actions.providersQuery.isError ? (
    <Alert variant="destructive">
      <AlertDescription>{actions.providersQuery.error.message}</AlertDescription>
      <SettingsActionButton className="mt-2" onClick={() => void actions.providersQuery.refetch()}>
        {t('settings.aiRetryProviders')}
      </SettingsActionButton>
    </Alert>
  ) : null

  return (
    <>
      <SettingsSection
        targetId="settings-ai-local"
        title={t('settings.aiExternalLocal')}
        description={t('settings.aiExternalLocalDescription')}
        icon={Server}
      >
        <p className="mb-3 text-xs text-muted-foreground">{t('settings.aiOllamaPrivacy')}</p>
        {queryState}
        {!queryState && (
          <ProviderList
            providers={localProviders}
            emptyText={t('settings.aiNoExternalLocal')}
            actions={actions}
            fallbackFocusRef={localProviderFallbackRef}
          />
        )}
        <div className="mt-3 flex flex-wrap gap-2">
          <SettingsActionButton ref={localProviderFallbackRef} onClick={() => openForm('ollama')}>
            {t('settings.aiConfigureOllama')}
          </SettingsActionButton>
          <SettingsActionButton variant="ghost" onClick={() => openForm('compatible')}>
            {t('settings.aiAddCompatible')}
          </SettingsActionButton>
        </div>
      </SettingsSection>
      <SettingsSection
        targetId="settings-ai-cloud"
        title={t('settings.aiCloud')}
        description={t('settings.aiCloudDescription')}
        icon={Cloud}
      >
        <p className="mb-3 text-xs text-muted-foreground">{t('settings.aiRemotePrivacy')}</p>
        {actions.providersQuery.isSuccess && (
          <ProviderList
            providers={cloudProviders}
            emptyText={t('settings.aiNoCloudProviders')}
            actions={actions}
            fallbackFocusRef={cloudProviderFallbackRef}
          />
        )}
        <SettingsActionButton
          ref={cloudProviderFallbackRef}
          className="mt-3 self-start"
          onClick={() => openForm('cloud')}
        >
          {t('settings.aiAddCloudProvider')}
        </SettingsActionButton>
      </SettingsSection>
      {formMode && (
        <AiProviderDialog
          key={formMode}
          mode={formMode}
          provider={formMode === 'ollama' ? ollamaProvider : undefined}
          open
          pending={actions.saveMutation.isPending}
          error={actions.saveMutation.error?.message}
          onOpenChange={(open) => {
            if (!open) setFormMode(null)
          }}
          onSave={handleSave}
        />
      )}
    </>
  )
}
