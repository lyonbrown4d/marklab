import { useRef } from 'react'
import { Progress } from '@/components/ui/progress'
import { SettingsActionButton } from '@/components/settings/SettingsButtons'
import { SettingsSwitchRow } from '@/components/settings/SettingsRow'
import type { LocalAiStatus } from '@/components/settings/aiSettingsTypes'
import { useLocalAiSettings } from '@/components/settings/useLocalAiSettings'
import { useI18n } from '@/i18n/useI18n'
import { usePreferencesStore } from '@/store/usePreferencesStore'

type LocalAiDirectorySettingsProps = {
  actions: ReturnType<typeof useLocalAiSettings>
  status: LocalAiStatus
}

const isMigrationActive = (status: LocalAiStatus) =>
  Boolean(
    status.migration && ['copying', 'verifying', 'switching'].includes(status.migration.state),
  )

export const LocalAiDirectorySettings = ({ actions, status }: LocalAiDirectorySettingsProps) => {
  const { t } = useI18n()
  const operationInFlight = useRef(false)
  const savedDirectory = usePreferencesStore((state) => state.aiModelDirectory)
  const migrationActive = isMigrationActive(status)
  const busy =
    migrationActive ||
    actions.selectDirectoryMutation.isPending ||
    actions.setDirectoryMutation.isPending

  const chooseDirectory = async () => {
    const selection = await actions.selectDirectoryMutation.mutateAsync()
    return selection.path
  }

  const runExclusive = async (operation: () => Promise<void>) => {
    if (busy || operationInFlight.current) return
    operationInFlight.current = true
    try {
      await operation()
    } catch {
      // The parent section renders mutation errors.
    } finally {
      operationInFlight.current = false
    }
  }

  const setEnabled = (enabled: boolean) =>
    runExclusive(async () => {
      if (!enabled) {
        await actions.setDirectoryMutation.mutateAsync({ enabled: false })
        return
      }
      const path = savedDirectory ?? (await chooseDirectory())
      if (path) await actions.setDirectoryMutation.mutateAsync({ enabled: true, path })
    })

  const chooseReplacement = () =>
    runExclusive(async () => {
      const path = await chooseDirectory()
      if (path) await actions.setDirectoryMutation.mutateAsync({ enabled: true, path })
    })

  const migration = status.migration

  return (
    <div className="mb-4 border-y border-border/70 py-1">
      <SettingsSwitchRow
        title={t('settings.aiCustomModelDirectory')}
        description={t('settings.aiCustomModelDirectoryDescription')}
        checked={status.customModelDirectoryEnabled}
        disabled={busy}
        onCheckedChange={(enabled) => void setEnabled(enabled)}
      />
      <div className="pb-3 text-xs text-muted-foreground">
        <p className="break-all">
          <span>{t('settings.aiCurrentModelDirectory')}:</span> <code>{status.modelDirectory}</code>
        </p>
        <p className="mt-1 break-all">
          <span>{t('settings.aiDefaultModelDirectory')}:</span>{' '}
          <code>{status.defaultModelDirectory}</code>
        </p>
        <p className="mt-2">{t('settings.aiModelDirectoryMigrationDescription')}</p>
        {!migrationActive && status.customModelDirectoryEnabled && (
          <div className="mt-3 flex flex-wrap gap-2">
            <SettingsActionButton onClick={() => void chooseReplacement()} disabled={busy}>
              {t('settings.aiChooseModelDirectory')}
            </SettingsActionButton>
            {status.customModelDirectoryEnabled && (
              <SettingsActionButton
                variant="ghost"
                onClick={() => void setEnabled(false)}
                disabled={busy}
              >
                {t('settings.aiRestoreDefaultModelDirectory')}
              </SettingsActionButton>
            )}
          </div>
        )}
        {migration && (
          <div className="mt-3 space-y-2" role="status">
            <p>{t(`settings.aiModelDirectoryMigration.${migration.state}`)}</p>
            <p className="break-all">
              {migration.from} → {migration.to}
            </p>
            <Progress
              value={migration.percent}
              aria-label={t('settings.aiModelDirectoryMigrationProgress')}
              aria-valuenow={migration.percent}
            />
            {migration.error && (
              <p role="alert" className="text-destructive">
                {migration.error}
              </p>
            )}
            {migration.warning && <p role="note">{migration.warning}</p>}
            {migration.state === 'error' && !status.customModelDirectoryEnabled && (
              <SettingsActionButton onClick={() => void setEnabled(true)} disabled={busy}>
                {t('settings.aiRetryModelDirectoryMigration')}
              </SettingsActionButton>
            )}
          </div>
        )}
      </div>
    </div>
  )
}
