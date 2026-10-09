import { Download, RefreshCw, RotateCcw } from 'lucide-react'
import { Alert, AlertDescription } from '@/components/ui/alert'
import { Badge } from '@/components/ui/badge'
import { Progress } from '@/components/ui/progress'
import { SettingsActionButton } from '@/components/settings/SettingsButtons'
import { SettingsField, SettingsSection } from '@/components/settings/SettingsRow'
import { useSoftwareUpdate } from '@/components/settings/useSoftwareUpdate'
import { useI18n } from '@/i18n/useI18n'

const SoftwareUpdateSettingsSection = () => {
  const { t } = useI18n()
  const controller = useSoftwareUpdate()
  const { state } = controller

  if (controller.initialRequestState === 'loading') {
    return (
      <SettingsSection title={t('settings.softwareUpdate')} icon={RefreshCw}>
        <p className="py-3 text-xs text-muted-foreground">{t('settings.softwareUpdateLoading')}</p>
      </SettingsSection>
    )
  }

  if (controller.initialRequestState === 'error') {
    return (
      <SettingsSection title={t('settings.softwareUpdate')} icon={RefreshCw}>
        <Alert variant="destructive">
          <AlertDescription>{controller.initialError}</AlertDescription>
        </Alert>
      </SettingsSection>
    )
  }

  if (!state) return null
  const busy = controller.pendingAction !== null
  const error = controller.actionError ?? state.error?.message
  const showAvailableVersion =
    state.status === 'available' || state.status === 'downloading' || state.status === 'downloaded'

  return (
    <SettingsSection
      targetId="settings-software-update"
      title={t('settings.softwareUpdate')}
      description={t('settings.softwareUpdateDescription')}
      icon={RefreshCw}
    >
      <SettingsField
        title={t('settings.softwareUpdateCurrentVersion')}
        description={t('settings.softwareUpdateCurrentVersionDescription')}
        control={
          <span className="font-mono text-xs">
            {t('settings.softwareUpdateCurrentVersionValue', { version: state.currentVersion })}
          </span>
        }
      />
      <div className="flex flex-col gap-3 border-t py-3.5">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <Badge variant={state.status === 'error' ? 'destructive' : 'outline'}>
            {t(`settings.softwareUpdateStatus.${state.status}`)}
          </Badge>
          <UpdateActions
            status={state.status}
            busy={busy}
            onCheck={controller.check}
            onDownload={controller.download}
            onInstall={controller.install}
            installOnQuit={state.installOnQuit}
            onSetInstallOnQuit={controller.setInstallOnQuit}
          />
        </div>
        {showAvailableVersion && state.info?.version && (
          <p className="text-xs text-muted-foreground">
            {t('settings.softwareUpdateAvailableVersion', { version: state.info.version })}
          </p>
        )}
        {(state.status === 'available' || state.status === 'downloaded') &&
          state.info?.releaseNotes && (
            <div className="flex flex-col gap-1.5 rounded-md bg-muted/40 p-3">
              <h3 className="text-xs font-medium">{t('settings.softwareUpdateReleaseNotes')}</h3>
              <p className="whitespace-pre-wrap break-words text-xs leading-5 text-muted-foreground">
                {state.info.releaseNotes}
              </p>
            </div>
          )}
        {state.status === 'downloading' && state.progress && (
          <div className="flex flex-col gap-1.5">
            <Progress
              aria-label={t('settings.softwareUpdateProgress')}
              aria-valuenow={Math.round(state.progress.percent)}
              value={state.progress.percent}
            />
            <span className="text-xs text-muted-foreground">
              {Math.round(state.progress.percent)}%
            </span>
          </div>
        )}
        {state.status === 'downloaded' && (
          <p className="text-xs leading-5 text-muted-foreground">
            {state.installOnQuit
              ? t('settings.softwareUpdateInstallOnQuitScheduled')
              : t('settings.softwareUpdateInstallOnQuitDescription')}
          </p>
        )}
        {error && state.status !== 'unavailable' && (
          <Alert variant="destructive">
            <AlertDescription>{error}</AlertDescription>
          </Alert>
        )}
        {state.status === 'unavailable' && error && (
          <p className="text-xs text-muted-foreground">{error}</p>
        )}
      </div>
    </SettingsSection>
  )
}

type UpdateActionsProps = {
  busy: boolean
  onCheck: () => Promise<void>
  onDownload: () => Promise<void>
  onInstall: () => Promise<void>
  installOnQuit: boolean
  onSetInstallOnQuit: (enabled: boolean) => Promise<void>
  status: import('@/runtime/electron').ElectronUpdateStatus
}

const UpdateActions = ({
  busy,
  onCheck,
  onDownload,
  onInstall,
  installOnQuit,
  onSetInstallOnQuit,
  status,
}: UpdateActionsProps) => {
  const { t } = useI18n()
  if (status === 'available') {
    return (
      <SettingsActionButton disabled={busy} onClick={() => void onDownload()}>
        <Download aria-hidden="true" />
        {t('settings.softwareUpdateDownload')}
      </SettingsActionButton>
    )
  }
  if (status === 'downloaded') {
    return (
      <div className="flex flex-wrap gap-2">
        {!installOnQuit && (
          <SettingsActionButton
            disabled={busy}
            variant="ghost"
            onClick={() => void onSetInstallOnQuit(true)}
          >
            {t('settings.softwareUpdateInstallOnQuit')}
          </SettingsActionButton>
        )}
        <SettingsActionButton disabled={busy} onClick={() => void onInstall()}>
          <RotateCcw aria-hidden="true" />
          {t('settings.softwareUpdateInstall')}
        </SettingsActionButton>
      </div>
    )
  }
  return (
    <SettingsActionButton
      disabled={
        busy ||
        status === 'checking' ||
        status === 'downloading' ||
        status === 'installing' ||
        status === 'unavailable'
      }
      onClick={() => void onCheck()}
    >
      <RefreshCw aria-hidden="true" />
      {t('settings.softwareUpdateCheck')}
    </SettingsActionButton>
  )
}

export default SoftwareUpdateSettingsSection
