import { Check, Save } from 'lucide-react'
import { useI18n } from '@/i18n/useI18n'
import { usePreferencesStore } from '@/store/usePreferencesStore'
import {
  SettingsChoiceButton,
  SettingsChoiceGrid,
  SettingsPageStack,
  SettingsSection,
} from '@/components/settings/SettingsRow'

const SavingSettingsPage = () => {
  const { t } = useI18n()
  const silentSave = usePreferencesStore((state) => state.silentSave)
  const setSilentSave = usePreferencesStore((state) => state.setSilentSave)

  return (
    <SettingsPageStack>
      <SettingsSection
        targetId="settings-save-behavior"
        title={t('settings.saveBehavior')}
        description={t('settings.detailedSaveDescription')}
        icon={Save}
      >
        <SettingsChoiceGrid columns={2} aria-label={t('settings.saveBehavior')}>
          <SettingsChoiceButton
            selected={silentSave}
            className="h-auto items-start gap-3 p-3 text-left"
            onClick={() => setSilentSave(true)}
          >
            <span className="min-w-0 flex-1">
              <span className="block text-sm font-medium">{t('settings.silentSave')}</span>
              <span className="mt-1 block whitespace-normal text-xs font-normal leading-5 text-muted-foreground">
                {t('settings.silentSaveDescription')}
              </span>
            </span>
            {silentSave ? <Check className="mt-0.5 size-4 shrink-0" aria-hidden="true" /> : null}
          </SettingsChoiceButton>
          <SettingsChoiceButton
            selected={!silentSave}
            className="h-auto items-start gap-3 p-3 text-left"
            onClick={() => setSilentSave(false)}
          >
            <span className="min-w-0 flex-1">
              <span className="block text-sm font-medium">{t('settings.detailedSave')}</span>
              <span className="mt-1 block whitespace-normal text-xs font-normal leading-5 text-muted-foreground">
                {t('settings.detailedSaveDescription')}
              </span>
            </span>
            {!silentSave ? <Check className="mt-0.5 size-4 shrink-0" aria-hidden="true" /> : null}
          </SettingsChoiceButton>
        </SettingsChoiceGrid>
      </SettingsSection>
    </SettingsPageStack>
  )
}

export default SavingSettingsPage
