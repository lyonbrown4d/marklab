import { WebDavBindingDialog } from '@/features/workspace-sync/WebDavBindingDialog'
import {
  useSetSyncChannel,
  useSyncChannels,
  useWebDavProfiles,
} from '@/features/workspace-sync/syncQueries'
import { useI18n } from '@/i18n/useI18n'

type WorkspaceSyncBindingDialogProps = {
  open: boolean
  rootPath: string
  onOpenChange: (open: boolean) => void
}

export const WorkspaceSyncBindingDialog = ({
  open,
  rootPath,
  onOpenChange,
}: WorkspaceSyncBindingDialogProps) => {
  const { t } = useI18n()
  const channels = useSyncChannels(rootPath, open)
  const profiles = useWebDavProfiles(open)
  const setChannel = useSetSyncChannel(rootPath)
  const webdavChannel = channels.data?.webdav
  const handleOpenChange = (nextOpen: boolean) => {
    if (!nextOpen) setChannel.reset()
    onOpenChange(nextOpen)
  }

  if (!open) return null
  const error =
    channels.isError || profiles.isError
      ? t('sync.menu.loadFailed')
      : setChannel.isError
        ? t('sync.menu.updateFailed')
        : undefined

  return (
    <WebDavBindingDialog
      key={`${webdavChannel?.profileId ?? profiles.data?.[0]?.id ?? 'loading'}:${webdavChannel?.remoteRoot ?? '/'}`}
      open
      profiles={profiles.data ?? []}
      pending={channels.isLoading || profiles.isLoading || setChannel.isPending}
      error={error}
      initialProfileId={webdavChannel?.profileId}
      initialRemoteRoot={webdavChannel?.remoteRoot}
      onOpenChange={handleOpenChange}
      onSubmit={(value) => {
        setChannel.mutate(
          { provider: 'webdav', ...value, autoSync: false },
          { onSuccess: () => handleOpenChange(false) },
        )
      }}
    />
  )
}
