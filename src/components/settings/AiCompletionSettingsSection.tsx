import { Sparkles } from 'lucide-react'
import {
  SettingsFieldGroup,
  SettingsSection,
  SettingsSelectField,
  SettingsSwitchField,
} from '@/components/settings/SettingsRow'
import { isAiProviderUsable } from '@/components/settings/aiProviderUtils'
import { useAiProviders } from '@/components/settings/useAiProviders'
import { useI18n } from '@/i18n/useI18n'
import type { AiCompletionLength, AiCompletionTriggerMode } from '@/store/aiCompletionPreferences'
import { usePreferencesStore } from '@/store/usePreferencesStore'

const FOLLOW_DEFAULT_PROVIDER = '__follow-default__'

export const AiCompletionSettingsSection = () => {
  const { t } = useI18n()
  const providers = useAiProviders().providersQuery.data ?? []
  const documentCompletionEnabled = usePreferencesStore((state) => state.documentCompletionEnabled)
  const completionEnabled = usePreferencesStore((state) => state.aiCompletionEnabled)
  const completionProviderId = usePreferencesStore((state) => state.aiCompletionProviderId)
  const defaultProviderId = usePreferencesStore((state) => state.aiDefaultProviderId)
  const triggerMode = usePreferencesStore((state) => state.aiCompletionTriggerMode)
  const completionLength = usePreferencesStore((state) => state.aiCompletionLength)
  const nearbyContextEnabled = usePreferencesStore(
    (state) => state.aiCompletionNearbyContextEnabled,
  )
  const cloudContextConsent = usePreferencesStore((state) => state.aiCompletionCloudContextConsent)
  const setCompletionEnabled = usePreferencesStore((state) => state.setAiCompletionEnabled)
  const setDocumentCompletionEnabled = usePreferencesStore(
    (state) => state.setDocumentCompletionEnabled,
  )
  const setCompletionProviderId = usePreferencesStore((state) => state.setAiCompletionProviderId)
  const setTriggerMode = usePreferencesStore((state) => state.setAiCompletionTriggerMode)
  const setCompletionLength = usePreferencesStore((state) => state.setAiCompletionLength)
  const setNearbyContextEnabled = usePreferencesStore(
    (state) => state.setAiCompletionNearbyContextEnabled,
  )
  const setCloudContextConsent = usePreferencesStore(
    (state) => state.setAiCompletionCloudContextConsent,
  )

  const usableProviders = providers.filter(isAiProviderUsable)
  const effectiveProviderId = completionProviderId ?? defaultProviderId
  const effectiveProvider = usableProviders.find((provider) => provider.id === effectiveProviderId)
  const hasEffectiveProvider = Boolean(effectiveProvider)
  const usesLocalProvider = effectiveProvider?.locality === 'local'
  const usesCloudProvider = hasEffectiveProvider && !usesLocalProvider
  const providerOptions = [
    { value: FOLLOW_DEFAULT_PROVIDER, label: t('settings.aiCompletionFollowDefault') },
    ...usableProviders.map((provider) => ({ value: provider.id, label: provider.label })),
  ]

  return (
    <SettingsSection
      targetId="settings-ai-completion"
      title={t('settings.aiCompletion')}
      description={t('settings.aiCompletionDescription')}
      icon={Sparkles}
    >
      <SettingsFieldGroup>
        <SettingsSwitchField
          title={t('settings.documentCompletionEnabled')}
          description={t('settings.documentCompletionEnabledDescription')}
          checked={documentCompletionEnabled}
          onCheckedChange={setDocumentCompletionEnabled}
        />
        <SettingsSwitchField
          title={t('settings.aiCompletionEnabled')}
          description={t('settings.aiCompletionEnabledDescription')}
          checked={completionEnabled}
          onCheckedChange={setCompletionEnabled}
        />
        <SettingsSelectField
          title={t('settings.aiCompletionProvider')}
          description={t('settings.aiCompletionProviderDescription')}
          value={completionProviderId ?? FOLLOW_DEFAULT_PROVIDER}
          onValueChange={(value) =>
            setCompletionProviderId(value === FOLLOW_DEFAULT_PROVIDER ? null : value)
          }
          options={providerOptions}
          disabled={!completionEnabled}
        />
        <SettingsSelectField
          title={t('settings.aiCompletionTriggerMode')}
          description={t('settings.aiCompletionTriggerModeDescription')}
          value={triggerMode}
          onValueChange={(value) => setTriggerMode(value as AiCompletionTriggerMode)}
          options={(['fast', 'balanced', 'battery-saver'] as const).map((value) => ({
            value,
            label: t(`settings.aiCompletionTrigger.${value}`),
          }))}
          disabled={!completionEnabled}
        />
        <SettingsSelectField
          title={t('settings.aiCompletionLength')}
          description={t('settings.aiCompletionLengthDescription')}
          value={completionLength}
          onValueChange={(value) => setCompletionLength(value as AiCompletionLength)}
          options={(['short', 'medium', 'long'] as const).map((value) => ({
            value,
            label: t(`settings.aiCompletionLength.${value}`),
          }))}
          disabled={!completionEnabled}
        />
        <SettingsSwitchField
          title={t('settings.aiCompletionNearbyContextEnabled')}
          description={t('settings.aiCompletionNearbyContextDescription')}
          checked={nearbyContextEnabled}
          onCheckedChange={setNearbyContextEnabled}
          disabled={!completionEnabled}
        />
        <SettingsSwitchField
          title={t('settings.aiCompletionCloudContextConsent')}
          description={t('settings.aiCompletionCloudContextConsentDescription')}
          checked={cloudContextConsent}
          onCheckedChange={setCloudContextConsent}
          disabled={!completionEnabled || !usesCloudProvider}
        />
      </SettingsFieldGroup>
      <p className="mt-2 text-xs leading-5 text-muted-foreground">
        {!hasEffectiveProvider
          ? t('settings.aiCompletionNoProviderPrivacy')
          : usesCloudProvider
            ? t('settings.aiCompletionCloudPrivacy')
            : t('settings.aiCompletionLocalPrivacy')}
      </p>
    </SettingsSection>
  )
}
