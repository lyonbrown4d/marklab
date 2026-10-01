import { Cpu, Download, HardDrive, ShieldCheck } from 'lucide-react'
import { Alert, AlertDescription } from '@/components/ui/alert'
import { Badge } from '@/components/ui/badge'
import { Progress } from '@/components/ui/progress'
import { SettingsActionButton, SettingsEmptyState } from '@/components/settings/SettingsButtons'
import { SettingsSection } from '@/components/settings/SettingsRow'
import { useI18n } from '@/i18n/useI18n'
import { usePreferencesStore } from '@/store/usePreferencesStore'
import { MARKLAB_LOCAL_PROVIDER_ID, type LocalAiModel } from '@/components/settings/aiSettingsTypes'
import { useLocalAiSettings } from '@/components/settings/useLocalAiSettings'
import { LocalAiDirectorySettings } from '@/components/settings/LocalAiDirectorySettings'

const formatModelSize = (sizeBytes: number) => `${Math.round(sizeBytes / 1_000_000)} MB`

type ModelRowProps = {
  model: LocalAiModel
  actions: ReturnType<typeof useLocalAiSettings>
}

const LocalModelRow = ({ model, actions }: ModelRowProps) => {
  const { t } = useI18n()
  const defaultId = usePreferencesStore((state) => state.aiDefaultProviderId)
  const setDefaultId = usePreferencesStore((state) => state.setAiDefaultProviderId)
  const progress = actions.progressByModel[model.id]
  const anyDownloadActive = Object.values(actions.progressByModel).some((item) =>
    ['queued', 'downloading', 'verifying'].includes(item.state),
  )
  const directoryMigrationActive = Boolean(
    actions.statusQuery.data?.migration &&
    ['copying', 'verifying', 'switching'].includes(actions.statusQuery.data.migration.state),
  )
  const downloading =
    (actions.downloadMutation.isPending && actions.downloadMutation.variables === model.id) ||
    (progress && ['queued', 'downloading', 'verifying'].includes(progress.state))

  return (
    <div className="border-t border-border/70 py-4 first:border-t-0 first:pt-0 last:pb-0">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-2">
            <h3 className="text-sm font-medium">{model.label}</h3>
            {model.recommended && <Badge variant="secondary">{t('settings.aiRecommended')}</Badge>}
            {model.active && <Badge variant="outline">{t('settings.aiActive')}</Badge>}
            <Badge variant="outline">
              {model.installed ? t('settings.aiInstalled') : t('settings.aiNotInstalled')}
            </Badge>
          </div>
          {model.description && (
            <p className="mt-1 text-xs leading-5 text-muted-foreground">
              {model.id === 'qwen3-0.6b-q4'
                ? t('settings.aiQwenCompactDescription')
                : model.description}
            </p>
          )}
          <p className="mt-1 flex flex-wrap gap-x-3 text-xs text-muted-foreground">
            <span className="inline-flex items-center gap-1">
              <HardDrive className="size-3" aria-hidden="true" />
              {formatModelSize(model.sizeBytes)}
            </span>
            <span>{model.license}</span>
          </p>
        </div>
        <div className="flex flex-wrap justify-end gap-2">
          {!model.installed && (
            <SettingsActionButton
              aria-label={`${t('settings.aiDownload')} ${model.label}`}
              onClick={() => actions.downloadMutation.mutate(model.id)}
              disabled={
                Boolean(downloading) ||
                actions.downloadMutation.isPending ||
                anyDownloadActive ||
                directoryMigrationActive
              }
            >
              <Download aria-hidden="true" /> {t('settings.aiDownload')}
            </SettingsActionButton>
          )}
          {model.installed && !model.active && (
            <SettingsActionButton
              aria-label={`${t('settings.aiSetActive')} ${model.label}`}
              onClick={() => actions.activateMutation.mutate(model.id)}
              disabled={actions.activateMutation.isPending || directoryMigrationActive}
            >
              {t('settings.aiSetActive')}
            </SettingsActionButton>
          )}
          {model.installed && defaultId !== MARKLAB_LOCAL_PROVIDER_ID && (
            <SettingsActionButton
              aria-label={`${t('settings.aiMakeDefault')} ${model.label}`}
              onClick={() => setDefaultId(MARKLAB_LOCAL_PROVIDER_ID)}
            >
              {t('settings.aiMakeDefault')}
            </SettingsActionButton>
          )}
          {model.installed && (
            <SettingsActionButton
              variant="ghost"
              aria-label={`${t('settings.aiDeleteModel')} ${model.label}`}
              onClick={() => actions.deleteMutation.mutate(model.id)}
              disabled={actions.deleteMutation.isPending || directoryMigrationActive}
            >
              {t('settings.aiDeleteModel')}
            </SettingsActionButton>
          )}
        </div>
      </div>
      {progress && ['queued', 'downloading', 'verifying'].includes(progress.state) && (
        <div className="mt-3 flex items-center gap-3">
          <Progress
            value={progress.percent}
            aria-label={t('settings.aiDownloadProgress')}
            aria-valuenow={progress.percent}
            className="flex-1"
          />
          <span className="w-10 text-right text-xs tabular-nums">{progress.percent}%</span>
          <SettingsActionButton
            variant="ghost"
            aria-label={`${t('settings.aiCancelDownload')} ${model.label}`}
            onClick={() => actions.cancelMutation.mutate(progress.taskId)}
            disabled={actions.cancelMutation.isPending}
          >
            {t('settings.aiCancelDownload')}
          </SettingsActionButton>
        </div>
      )}
      {progress?.state === 'error' && progress.error && (
        <p role="alert" className="mt-2 text-xs text-destructive">
          {progress.error}
        </p>
      )}
      {defaultId === MARKLAB_LOCAL_PROVIDER_ID && (
        <p className="mt-2 text-xs text-muted-foreground">{t('settings.aiDefaultActive')}</p>
      )}
    </div>
  )
}

export const LocalAiSettingsSection = () => {
  const { t } = useI18n()
  const actions = useLocalAiSettings()
  const query = actions.statusQuery
  const actionError =
    actions.downloadMutation.error ??
    actions.cancelMutation.error ??
    actions.deleteMutation.error ??
    actions.activateMutation.error
  const directoryError = actions.selectDirectoryMutation.error ?? actions.setDirectoryMutation.error

  return (
    <SettingsSection
      title={t('settings.aiBuiltIn')}
      description={t('settings.aiBuiltInDescription')}
      icon={Cpu}
    >
      <p className="mb-3 flex items-center gap-2 text-xs text-muted-foreground">
        <ShieldCheck className="size-4" aria-hidden="true" />
        {t('settings.aiBuiltInPrivacy')}
      </p>
      {query.data && (
        <p className="mb-3 text-xs text-muted-foreground">
          {t(`settings.aiRuntime.${query.data.runtime}`)}
        </p>
      )}
      {query.data?.modelDirectory && (
        <LocalAiDirectorySettings actions={actions} status={query.data} />
      )}
      {query.isPending && <p role="status">{t('settings.aiLoading')}</p>}
      {query.isError && (
        <Alert variant="destructive">
          <AlertDescription>{query.error.message}</AlertDescription>
          <SettingsActionButton className="mt-2" onClick={() => void query.refetch()}>
            {t('settings.aiRetryLocal')}
          </SettingsActionButton>
        </Alert>
      )}
      {query.data?.error && (
        <Alert variant="destructive">
          <AlertDescription>{query.data.error}</AlertDescription>
        </Alert>
      )}
      {actionError && (
        <Alert variant="destructive">
          <AlertDescription>{actionError.message}</AlertDescription>
        </Alert>
      )}
      {directoryError && (
        <Alert variant="destructive">
          <AlertDescription>{directoryError.message}</AlertDescription>
        </Alert>
      )}
      {query.data?.models.length === 0 && (
        <SettingsEmptyState>
          {query.data.runtime === 'unavailable'
            ? t('settings.aiCatalogUnavailable')
            : t('settings.aiNoLocalModels')}
        </SettingsEmptyState>
      )}
      {query.data?.runtime === 'unavailable' && (
        <SettingsActionButton className="mt-3 self-start" onClick={() => void query.refetch()}>
          {t('settings.aiRetryLocal')}
        </SettingsActionButton>
      )}
      {query.data?.models.map((model) => (
        <LocalModelRow key={model.id} model={model} actions={actions} />
      ))}
    </SettingsSection>
  )
}
