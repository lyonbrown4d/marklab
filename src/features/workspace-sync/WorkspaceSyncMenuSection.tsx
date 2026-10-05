import { Cloud, GitBranch, RotateCw, Settings2, Unlink } from 'lucide-react'
import { Badge } from '@/components/ui/badge'
import {
  DropdownMenuGroup,
  DropdownMenuItem,
  DropdownMenuLabel,
} from '@/components/ui/dropdown-menu'
import { Spinner } from '@/components/ui/spinner'
import { menuItemStyles } from '@/components/overlay/overlayStyles'
import {
  useGitSummary,
  useRemoveSyncChannel,
  useSyncChannels,
} from '@/features/workspace-sync/syncQueries'
import { useI18n } from '@/i18n/useI18n'

type WorkspaceSyncMenuSectionProps = {
  rootKind: 'internal' | 'external' | 'single'
  rootPath: string
  onConfigureWebDav: () => void
}

const itemClassName = menuItemStyles({ className: 'py-2' })

export const WorkspaceSyncMenuSection = ({
  rootKind,
  rootPath,
  onConfigureWebDav,
}: WorkspaceSyncMenuSectionProps) => {
  const { t } = useI18n()
  const enabled = rootKind !== 'single' && Boolean(rootPath)
  const channels = useSyncChannels(rootPath, enabled)
  const git = useGitSummary(rootPath, enabled)
  const removeChannel = useRemoveSyncChannel(rootPath)

  if (!enabled) {
    return (
      <>
        <DropdownMenuLabel>{t('sync.menu.title')}</DropdownMenuLabel>
        <DropdownMenuItem disabled>{t('sync.singleFileUnavailable')}</DropdownMenuItem>
      </>
    )
  }

  const busy = channels.isLoading || git.isLoading
  const gitSummary = git.data
  const webdavChannel = channels.data?.webdav
  const loadFailed = channels.isError || git.isError

  return (
    <>
      <DropdownMenuLabel className="px-2 py-1.5 text-[10px] font-medium uppercase tracking-[0.12em] text-muted-foreground">
        {t('sync.menu.title')}
      </DropdownMenuLabel>
      <DropdownMenuGroup>
        {busy ? (
          <DropdownMenuItem disabled className={itemClassName}>
            <Spinner aria-hidden="true" role="presentation" />
            {t('sync.menu.checking')}
          </DropdownMenuItem>
        ) : loadFailed ? (
          <DropdownMenuItem
            className={itemClassName}
            onSelect={(event) => {
              event.preventDefault()
              void Promise.all([channels.refetch(), git.refetch()])
            }}
          >
            <RotateCw aria-hidden="true" />
            <span className="min-w-0 flex-1">
              <span className="block text-xs font-medium">{t('sync.menu.loadFailed')}</span>
              <span className="block text-[11px] text-muted-foreground">
                {t('sync.menu.retry')}
              </span>
            </span>
          </DropdownMenuItem>
        ) : (
          <>
            {gitSummary?.status === 'error' ? (
              <DropdownMenuItem
                className={itemClassName}
                aria-label={t('sync.git.retry')}
                onSelect={(event) => {
                  event.preventDefault()
                  void git.refetch()
                }}
              >
                <GitBranch aria-hidden="true" />
                <span className="min-w-0 flex-1">
                  <span className="block text-xs font-medium">{t('sync.channel.git')}</span>
                  <span className="block truncate text-[11px] text-destructive">
                    {t('sync.git.detectionFailed')}
                  </span>
                </span>
                <RotateCw aria-hidden="true" />
              </DropdownMenuItem>
            ) : (
              <DropdownMenuItem disabled className={itemClassName}>
                <GitBranch aria-hidden="true" />
                <span className="min-w-0 flex-1">
                  <span className="block text-xs font-medium">{t('sync.channel.git')}</span>
                  <span className="block truncate text-[11px] text-muted-foreground">
                    {gitSummary?.status === 'ready'
                      ? (gitSummary.branch ?? t('scm.noBranch'))
                      : t('sync.git.notRepository')}
                  </span>
                </span>
                {gitSummary?.status === 'ready' ? (
                  <Badge variant="outline">{t('sync.git.detected')}</Badge>
                ) : null}
              </DropdownMenuItem>
            )}
            <DropdownMenuItem
              className={itemClassName}
              aria-label={`${t('sync.binding.configure')}: ${webdavChannel?.remoteRoot ?? t('sync.webdav.notBound')}`}
              onSelect={onConfigureWebDav}
            >
              <Cloud aria-hidden="true" />
              <span className="min-w-0 flex-1">
                <span className="block text-xs font-medium">{t('sync.channel.webdav')}</span>
                <span className="block truncate text-[11px] text-muted-foreground">
                  {webdavChannel?.remoteRoot ?? t('sync.webdav.notBound')}
                </span>
              </span>
              <Settings2 aria-hidden="true" />
            </DropdownMenuItem>
            {webdavChannel ? (
              <DropdownMenuItem
                className={menuItemStyles({ tone: 'destructive' })}
                disabled={removeChannel.isPending}
                onSelect={(event) => {
                  event.preventDefault()
                  removeChannel.mutate('webdav')
                }}
              >
                <Unlink aria-hidden="true" />
                {t('sync.binding.remove')}
              </DropdownMenuItem>
            ) : null}
          </>
        )}
      </DropdownMenuGroup>
      <DropdownMenuLabel className="px-2 py-1 text-[10px] font-normal leading-4 text-muted-foreground">
        {removeChannel.isError ? t('sync.menu.updateFailed') : t('sync.menu.independentChannels')}
      </DropdownMenuLabel>
    </>
  )
}
