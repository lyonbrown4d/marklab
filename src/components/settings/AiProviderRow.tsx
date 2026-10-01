import { useRef, useState, type RefObject } from 'react'
import { Badge } from '@/components/ui/badge'
import { SettingsActionButton } from '@/components/settings/SettingsButtons'
import { useI18n } from '@/i18n/useI18n'
import type { AiProviderUpdate, PublicAiProvider } from '@/services/aiApi'
import { usePreferencesStore } from '@/store/usePreferencesStore'
import { AiProviderDialog } from '@/components/settings/AiProviderDialog'
import { ConfirmDestructiveActionDialog } from '@/components/ConfirmDestructiveActionDialog'
import {
  isAiProviderUsable,
  isLoopbackHttpUrl,
  isOllamaPreset,
} from '@/components/settings/aiProviderUtils'

type ProviderRowProps = {
  provider: PublicAiProvider
  deletePending: boolean
  deleteError?: string
  testPending: boolean
  savePending: boolean
  saveError?: string
  clearCredentialError?: string
  fallbackFocusRef: RefObject<HTMLElement | null>
  testPassed: boolean
  onSave: (input: AiProviderUpdate) => Promise<void>
  onDelete: (id: string) => Promise<void>
  onTest: (id: string) => void
  onStartEdit: () => void
  onStartDelete: () => void
  onStartClearCredential: () => void
  onClearCredential: (provider: PublicAiProvider) => Promise<void>
}

export const AiProviderRow = ({
  provider,
  deletePending,
  deleteError,
  testPending,
  savePending,
  saveError,
  clearCredentialError,
  fallbackFocusRef,
  testPassed,
  onSave,
  onDelete,
  onTest,
  onStartEdit,
  onStartDelete,
  onStartClearCredential,
  onClearCredential,
}: ProviderRowProps) => {
  const { t } = useI18n()
  const [editing, setEditing] = useState(false)
  const [destructiveAction, setDestructiveAction] = useState<'delete' | 'credential' | null>(null)
  const deleteTriggerRef = useRef<HTMLButtonElement>(null)
  const credentialTriggerRef = useRef<HTMLButtonElement>(null)
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

  const formMode =
    provider.kind === 'openai-compatible'
      ? isOllamaPreset(provider)
        ? 'ollama'
        : 'compatible'
      : 'cloud'

  return (
    <>
      <div className="border-t border-border/70 py-3 first:border-t-0 first:pt-0 last:pb-0">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <p className="text-sm font-medium">{provider.label}</p>
            <p className="mt-1 text-xs text-muted-foreground">{provider.model}</p>
            {provider.apiKeySource === 'stored' && (
              <p className="mt-1 text-xs text-muted-foreground">
                {t('settings.aiCredentialStored')}
              </p>
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
              ref={deleteTriggerRef}
              aria-label={`${t('settings.delete')} ${provider.label}`}
              variant="ghost"
              onClick={() => {
                onStartDelete()
                setDestructiveAction('delete')
              }}
              disabled={deletePending}
            >
              {t('settings.delete')}
            </SettingsActionButton>
            {provider.apiKeySource === 'stored' && (
              <SettingsActionButton
                ref={credentialTriggerRef}
                aria-label={`${t('settings.aiClearCredential')} ${provider.label}`}
                variant="ghost"
                onClick={() => {
                  onStartClearCredential()
                  setDestructiveAction('credential')
                }}
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
        {(deleteError || clearCredentialError) && (
          <p role="alert" className="mt-2 text-xs text-destructive">
            {deleteError ?? clearCredentialError}
          </p>
        )}
      </div>
      <AiProviderDialog
        mode={formMode}
        provider={provider}
        open={editing}
        pending={savePending}
        error={saveError}
        onOpenChange={setEditing}
        onSave={handleSave}
      />
      <ConfirmDestructiveActionDialog
        open={destructiveAction !== null}
        title={
          destructiveAction === 'credential'
            ? t('settings.aiClearCredentialTitle')
            : t('settings.aiDeleteProviderTitle')
        }
        description={
          destructiveAction === 'credential'
            ? t('settings.aiClearCredentialDescription')
            : t('settings.aiDeleteProviderDescription')
        }
        resourceName={provider.label}
        confirmLabel={
          destructiveAction === 'credential'
            ? t('settings.aiConfirmClearCredential')
            : t('settings.aiConfirmDeleteProvider')
        }
        pendingLabel={
          destructiveAction === 'credential'
            ? t('settings.aiClearingCredential')
            : t('settings.aiDeletingProvider')
        }
        cancelLabel={t('settings.cancel')}
        error={destructiveAction === 'credential' ? clearCredentialError : deleteError}
        returnFocusRef={
          destructiveAction === 'credential' ? credentialTriggerRef : deleteTriggerRef
        }
        fallbackFocusRef={fallbackFocusRef}
        onOpenChange={(open) => {
          if (!open) setDestructiveAction(null)
        }}
        onConfirm={() =>
          destructiveAction === 'credential' ? onClearCredential(provider) : onDelete(provider.id)
        }
      />
    </>
  )
}
