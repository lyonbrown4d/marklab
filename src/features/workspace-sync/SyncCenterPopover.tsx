import { AlertTriangle, Cloud, RefreshCw, X } from 'lucide-react'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover'
import { Progress } from '@/components/ui/progress'
import { Separator } from '@/components/ui/separator'
import { useI18n } from '@/i18n/useI18n'

type WebDavStatus =
  | { status: 'unbound' }
  | { status: 'idle'; label: string; conflictCount?: number }
  | { status: 'syncing'; label: string; progress: number; stage: string }
  | { status: 'error'; label: string; message?: string; messageKey?: string }

type SyncCenterPopoverProps = {
  webdav: WebDavStatus
  onStart: () => void
  onCancel: () => void
  loading?: boolean
  cancelPending?: boolean
  cancelError?: string | null
}

export const SyncCenterPopover = ({
  webdav,
  onStart,
  onCancel,
  loading = false,
  cancelPending = false,
  cancelError = null,
}: SyncCenterPopoverProps) => {
  const { t } = useI18n()
  const problem = webdav.status === 'error'
  const syncing = webdav.status === 'syncing'

  return (
    <Popover>
      <PopoverTrigger asChild>
        <Button
          type="button"
          variant="ghost"
          size="icon"
          className="size-6 rounded"
          aria-label={t('sync.center.open')}
        >
          {problem ? <AlertTriangle aria-hidden="true" /> : <Cloud aria-hidden="true" />}
        </Button>
      </PopoverTrigger>
      <PopoverContent align="start" side="top" className="w-80 p-2" sideOffset={8}>
        <div className="flex items-center justify-between gap-3 px-2 py-1.5">
          <div>
            <p className="text-sm font-medium">{t('sync.center.title')}</p>
            <p className="text-[11px] text-muted-foreground">{t('sync.center.description')}</p>
          </div>
          {syncing ? <Badge variant="secondary">{t('sync.center.syncing')}</Badge> : null}
        </div>
        <Separator className="my-1" />
        {loading ? (
          <p className="px-2 py-2 text-xs text-muted-foreground" role="status">
            {t('sync.center.loading')}
          </p>
        ) : null}
        <div className="flex items-start gap-2 rounded-md px-2 py-2">
          <Cloud aria-hidden="true" className="mt-0.5 size-4 shrink-0" />
          <div className="min-w-0 flex-1">
            <p className="text-xs font-medium">{t('sync.channel.webdav')}</p>
            <p className="truncate text-[11px] text-muted-foreground">
              {webdav.status === 'unbound' ? t('sync.webdav.notBound') : webdav.label}
            </p>
            {webdav.status === 'syncing' ? (
              <div className="mt-2 flex flex-col gap-1">
                <Progress
                  value={webdav.progress}
                  aria-label={t('sync.center.progress')}
                  aria-valuemin={0}
                  aria-valuemax={100}
                  aria-valuenow={webdav.progress}
                />
                <p className="text-[10px] text-muted-foreground">
                  {t(`sync.stage.${webdav.stage}`)} · {webdav.progress}%
                </p>
              </div>
            ) : null}
            {webdav.status === 'error' ? (
              <p className="mt-1 text-[11px] text-destructive" role="alert">
                {webdav.messageKey ? t(webdav.messageKey) : webdav.message}
              </p>
            ) : null}
            {cancelError ? (
              <p className="mt-1 text-[11px] text-destructive" role="alert">
                {cancelError}
              </p>
            ) : null}
            {webdav.status === 'idle' && webdav.conflictCount ? (
              <p className="mt-1 text-[11px] text-status-warning">
                {t('sync.center.conflicts', { count: String(webdav.conflictCount) })}
              </p>
            ) : null}
          </div>
          {webdav.status === 'syncing' ? (
            <Button
              type="button"
              size="icon"
              variant="ghost"
              aria-label={t('sync.center.cancel')}
              disabled={cancelPending}
              onClick={onCancel}
            >
              <X aria-hidden="true" />
            </Button>
          ) : webdav.status !== 'unbound' ? (
            <Button
              type="button"
              size="icon"
              variant="ghost"
              aria-label={t('sync.center.syncNow')}
              onClick={onStart}
            >
              <RefreshCw aria-hidden="true" />
            </Button>
          ) : null}
        </div>
      </PopoverContent>
    </Popover>
  )
}
