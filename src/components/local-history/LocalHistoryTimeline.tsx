import { lazy, Suspense, useMemo, useState } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { ChevronDown, Clock3, History, Trash2 } from 'lucide-react'
import { toast } from 'sonner'
import AppEmptyState from '@/components/AppEmptyState'
import { Button } from '@/components/ui/button'
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog'
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from '@/components/ui/collapsible'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { Skeleton } from '@/components/ui/skeleton'
import LocalHistoryPreviewBoundary from '@/components/local-history/LocalHistoryPreviewBoundary'
import { useI18n } from '@/i18n/useI18n'
import { cn } from '@/lib/utils'
import { localHistoryApi, type LocalHistoryEntry } from '@/services/localHistoryApi'

const createLocalHistoryPreviewDialog = () =>
  lazy(() => import('@/components/local-history/LocalHistoryPreviewDialog'))

type ConfirmRequest = { kind: 'restore' | 'delete'; entry: LocalHistoryEntry } | { kind: 'clear' }

type LocalHistoryTimelineProps = {
  path: string
  onRestoreContent?: (content: string) => void
}

const afterDialogClosePaint = () =>
  new Promise<void>((resolve) => {
    requestAnimationFrame(() => requestAnimationFrame(() => resolve()))
  })

const LocalHistoryTimeline = ({ path, onRestoreContent }: LocalHistoryTimelineProps) => {
  const { locale, t } = useI18n()
  const queryClient = useQueryClient()
  const [open, setOpen] = useState(true)
  const [selectedEntry, setSelectedEntry] = useState<LocalHistoryEntry | null>(null)
  const [LocalHistoryPreviewDialog, setLocalHistoryPreviewDialog] = useState(
    createLocalHistoryPreviewDialog,
  )
  const [confirmRequest, setConfirmRequest] = useState<ConfirmRequest | null>(null)
  const listQuery = useQuery({
    queryKey: ['local-history', path],
    queryFn: () => localHistoryApi.list(path),
    enabled: Boolean(path),
  })
  const dateFormatter = useMemo(
    () => new Intl.DateTimeFormat(locale, { dateStyle: 'medium', timeStyle: 'short' }),
    [locale],
  )
  const mutation = useMutation({
    mutationFn: async (request: ConfirmRequest) => {
      if (request.kind === 'restore') {
        const snapshot = await localHistoryApi.restore(path, request.entry.id)
        return { content: snapshot.content, kind: request.kind }
      }
      if (request.kind === 'delete') {
        await localHistoryApi.delete(path, request.entry.id)
        return { kind: request.kind }
      }
      await localHistoryApi.clear(path)
      return { kind: request.kind }
    },
    onSuccess: async (result) => {
      setConfirmRequest(null)
      setSelectedEntry(null)
      if (result.kind === 'restore' && result.content !== undefined) {
        await afterDialogClosePaint()
        onRestoreContent?.(result.content)
      }
      await queryClient.invalidateQueries({ queryKey: ['local-history', path] })
      await queryClient.invalidateQueries({ queryKey: ['local-history-preview', path] })
      toast.success(t(`localHistory.${result.kind}Success`))
    },
    onError: (error) => toast.error(t('localHistory.actionFailed'), { description: String(error) }),
  })
  const entries = listQuery.data ?? []
  const confirmLabels = getConfirmLabels(confirmRequest, t)
  const closePreview = () => {
    setSelectedEntry(null)
    setLocalHistoryPreviewDialog(createLocalHistoryPreviewDialog)
  }

  return (
    <>
      <Collapsible
        open={open}
        onOpenChange={setOpen}
        className="shrink-0 border-t border-sidebar-border/80 pt-1"
      >
        <div className="flex h-8 items-center gap-1">
          <CollapsibleTrigger asChild>
            <Button
              type="button"
              variant="ghost"
              className="h-7 min-w-0 flex-1 justify-start gap-1.5 rounded-md px-1.5 text-[11px] font-medium uppercase tracking-wide"
            >
              <ChevronDown
                aria-hidden="true"
                className={cn('size-3.5 transition-transform', !open && '-rotate-90')}
              />
              <History aria-hidden="true" className="size-3.5" />
              <span>{t('localHistory.title')}</span>
              {entries.length > 0 ? (
                <span className="ml-auto text-[10px] tabular-nums text-muted-foreground">
                  {entries.length}
                </span>
              ) : null}
            </Button>
          </CollapsibleTrigger>
          {entries.length > 0 ? (
            <Button
              type="button"
              variant="ghost"
              size="icon"
              className="size-7 rounded-md text-muted-foreground"
              aria-label={t('localHistory.clear')}
              title={t('localHistory.clear')}
              onClick={() => setConfirmRequest({ kind: 'clear' })}
            >
              <Trash2 aria-hidden="true" />
            </Button>
          ) : null}
        </div>
        <CollapsibleContent>
          <div className="max-h-44 overflow-y-auto py-1 pr-1">
            {listQuery.isLoading ? (
              <div role="status" aria-label={t('localHistory.loading')} className="space-y-1 px-1">
                <Skeleton className="h-8 w-full" />
                <Skeleton className="h-8 w-10/12" />
              </div>
            ) : listQuery.isError ? (
              <p role="alert" className="px-2 py-2 text-[11px] text-destructive">
                {t('localHistory.loadFailed')}
              </p>
            ) : entries.length === 0 ? (
              <AppEmptyState
                compact
                className="min-h-16 border-0 bg-transparent px-2 py-2 md:p-2"
                icon={<Clock3 aria-hidden="true" />}
                mediaClassName="mb-0 size-7 bg-transparent [&_svg:not([class*='size-'])]:size-3.5"
                title={t('localHistory.empty')}
                titleClassName="text-[11px] font-normal text-muted-foreground"
                titleLevel={3}
              />
            ) : (
              <ul className="m-0 list-none space-y-0.5">
                {entries.map((entry) => {
                  const date = formatDate(entry.created_at, dateFormatter)
                  return (
                    <li key={entry.id}>
                      <button
                        type="button"
                        aria-label={t('localHistory.preview', { date })}
                        className="group flex h-9 w-full items-center gap-2 rounded-md px-2 text-left text-[11px] outline-none hover:bg-sidebar-accent hover:text-sidebar-accent-foreground focus-visible:ring-2 focus-visible:ring-sidebar-ring"
                        onClick={() => setSelectedEntry(entry)}
                      >
                        <Clock3
                          aria-hidden="true"
                          className="size-3.5 shrink-0 text-muted-foreground"
                        />
                        <span className="min-w-0 flex-1 truncate">{date}</span>
                        <span className="shrink-0 text-[10px] text-muted-foreground">
                          {t('localHistory.size', { size: String(entry.size_bytes) })}
                        </span>
                      </button>
                    </li>
                  )
                })}
              </ul>
            )}
          </div>
        </CollapsibleContent>
      </Collapsible>

      {selectedEntry ? (
        <LocalHistoryPreviewBoundary
          closeLabel={t('actions.close')}
          description={t('localHistory.previewDescription')}
          errorTitle={t('localHistory.previewFailed')}
          path={path}
          retryLabel={t('actions.retry')}
          onClose={closePreview}
          onRetry={() => setLocalHistoryPreviewDialog(createLocalHistoryPreviewDialog)}
        >
          <Suspense
            fallback={
              <LocalHistoryPreviewFallback
                path={path}
                onOpenChange={(nextOpen) => {
                  if (!nextOpen) closePreview()
                }}
                title={t('localHistory.previewTitle')}
                description={t('localHistory.previewDescription')}
                loadingLabel={t('localHistory.loading')}
              />
            }
          >
            <LocalHistoryPreviewDialog
              entry={selectedEntry}
              open
              path={path}
              onDelete={(entry) => setConfirmRequest({ kind: 'delete', entry })}
              onOpenChange={(nextOpen) => {
                if (!nextOpen) closePreview()
              }}
              onRestore={(entry) => setConfirmRequest({ kind: 'restore', entry })}
            />
          </Suspense>
        </LocalHistoryPreviewBoundary>
      ) : null}

      <AlertDialog
        open={Boolean(confirmRequest)}
        onOpenChange={(nextOpen) => {
          if (!nextOpen && !mutation.isPending) setConfirmRequest(null)
        }}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>{confirmLabels.title}</AlertDialogTitle>
            <AlertDialogDescription>{confirmLabels.description}</AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={mutation.isPending}>
              {t('localHistory.cancel')}
            </AlertDialogCancel>
            <AlertDialogAction
              disabled={!confirmRequest || mutation.isPending}
              className={
                confirmRequest?.kind === 'delete' || confirmRequest?.kind === 'clear'
                  ? 'bg-destructive text-destructive-foreground hover:bg-destructive/90'
                  : undefined
              }
              onClick={() => confirmRequest && mutation.mutate(confirmRequest)}
            >
              {confirmLabels.action}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  )
}

type LocalHistoryPreviewFallbackProps = {
  description: string
  loadingLabel: string
  path: string
  title: string
  onOpenChange: (open: boolean) => void
}

const LocalHistoryPreviewFallback = ({
  description,
  loadingLabel,
  path,
  title,
  onOpenChange,
}: LocalHistoryPreviewFallbackProps) => (
  <Dialog open onOpenChange={onOpenChange}>
    <DialogContent className="flex h-[min(78vh,760px)] max-w-[min(94vw,1120px)] flex-col gap-0 overflow-hidden p-0">
      <DialogHeader className="shrink-0 border-b border-border/70 px-5 py-4 pr-12">
        <DialogTitle className="text-base">{title}</DialogTitle>
        <DialogDescription className="truncate">
          {description} · {path}
        </DialogDescription>
      </DialogHeader>
      <div role="status" aria-label={loadingLabel} className="min-h-0 flex-1 space-y-3 p-6">
        <Skeleton className="h-4 w-2/3" />
        <Skeleton className="h-4 w-1/2" />
        <Skeleton className="h-4 w-3/4" />
      </div>
    </DialogContent>
  </Dialog>
)

const formatDate = (value: string, formatter: Intl.DateTimeFormat) => {
  const date = new Date(value)
  return Number.isNaN(date.getTime()) ? value : formatter.format(date)
}

const getConfirmLabels = (request: ConfirmRequest | null, t: (key: string) => string) => {
  const kind = request?.kind ?? 'restore'
  return {
    action: t(`localHistory.${kind === 'clear' ? 'clear' : kind}`),
    title: t(`localHistory.${kind}ConfirmTitle`),
    description: t(`localHistory.${kind}ConfirmDescription`),
  }
}

export default LocalHistoryTimeline
