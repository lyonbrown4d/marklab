import { useEffect, useState } from 'react'
import { DiffEditor } from '@monaco-editor/react'
import { useQuery } from '@tanstack/react-query'
import { AlertTriangle, History } from 'lucide-react'
import AppAlert from '@/components/AppAlert'
import { Button } from '@/components/ui/button'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { Skeleton } from '@/components/ui/skeleton'
import { Spinner } from '@/components/ui/spinner'
import { useDarkMode } from '@/hooks/useDarkMode'
import { useI18n } from '@/i18n/useI18n'
import { configureMonaco } from '@/lib/monaco'
import { fsApi } from '@/services/fsApi'
import { localHistoryApi, type LocalHistoryEntry } from '@/services/localHistoryApi'
import { usePreferencesStore } from '@/store/usePreferencesStore'

type LocalHistoryPreviewDialogProps = {
  entry: LocalHistoryEntry | null
  open: boolean
  path: string
  onDelete: (entry: LocalHistoryEntry) => void
  onOpenChange: (open: boolean) => void
  onRestore: (entry: LocalHistoryEntry) => void
}

const languageForPath = (path: string) => {
  const extension = path.split('.').pop()?.toLowerCase()
  if (extension === 'md' || extension === 'markdown') return 'markdown'
  if (extension === 'json') return 'json'
  if (extension === 'ts' || extension === 'tsx') return 'typescript'
  if (extension === 'js' || extension === 'jsx') return 'javascript'
  if (extension === 'css') return 'css'
  if (extension === 'html') return 'html'
  if (extension === 'yml' || extension === 'yaml') return 'yaml'
  return 'plaintext'
}

const LocalHistoryPreviewDialog = ({
  entry,
  open,
  path,
  onDelete,
  onOpenChange,
  onRestore,
}: LocalHistoryPreviewDialogProps) => {
  const { t } = useI18n()
  const darkMode = useDarkMode()
  const [monacoReady, setMonacoReady] = useState(false)
  const [monacoError, setMonacoError] = useState<unknown>(null)
  const motionSmoothScrolling = usePreferencesStore((state) => state.motionSmoothScrolling)
  const previewQuery = useQuery({
    queryKey: ['local-history-preview', path, entry?.id],
    queryFn: async () => {
      if (!entry) throw new Error('Missing local history entry')
      const [snapshot, current] = await Promise.all([
        localHistoryApi.read(path, entry.id),
        fsApi.readFile(path),
      ])
      return { snapshot, current }
    },
    enabled: open && Boolean(entry),
  })

  useEffect(() => {
    if (!open || monacoReady || monacoError) return
    let cancelled = false
    void configureMonaco().then(
      () => {
        if (!cancelled) setMonacoReady(true)
      },
      (error: unknown) => {
        if (!cancelled) setMonacoError(error)
      },
    )
    return () => {
      cancelled = true
    }
  }, [monacoError, monacoReady, open])

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="flex h-[min(78vh,760px)] max-w-[min(94vw,1120px)] flex-col gap-0 overflow-hidden p-0">
        <DialogHeader className="shrink-0 border-b border-border/70 px-5 py-4 pr-12">
          <DialogTitle className="flex items-center gap-2 text-base">
            <History aria-hidden="true" className="size-4 text-primary" />
            {t('localHistory.previewTitle')}
          </DialogTitle>
          <DialogDescription className="truncate">
            {t('localHistory.previewDescription')} · {path}
          </DialogDescription>
        </DialogHeader>
        <div className="grid min-h-0 flex-1 grid-rows-[auto_minmax(0,1fr)]">
          <div className="grid grid-cols-2 border-b border-border/70 bg-muted/25 text-[11px] font-medium text-muted-foreground">
            <span className="border-r border-border/70 px-4 py-2">
              {t('localHistory.savedVersion')}
            </span>
            <span className="px-4 py-2">{t('localHistory.current')}</span>
          </div>
          {previewQuery.isLoading ? (
            <div role="status" aria-label={t('localHistory.loading')} className="space-y-3 p-6">
              <Skeleton className="h-4 w-2/3" />
              <Skeleton className="h-4 w-1/2" />
              <Skeleton className="h-4 w-3/4" />
            </div>
          ) : previewQuery.isError || monacoError ? (
            <div className="flex h-full items-center justify-center p-6">
              <AppAlert
                role="alert"
                tone="destructive"
                title={t('localHistory.previewFailed')}
                icon={<AlertTriangle aria-hidden="true" />}
              >
                {String(previewQuery.error ?? monacoError)}
              </AppAlert>
            </div>
          ) : !monacoReady ? (
            <div className="flex h-full items-center justify-center gap-2 text-sm text-muted-foreground">
              <Spinner aria-hidden="true" role="presentation" />
              {t('localHistory.loading')}
            </div>
          ) : (
            <DiffEditor
              height="100%"
              language={languageForPath(path)}
              theme={darkMode ? 'vs-dark' : 'vs'}
              original={previewQuery.data?.snapshot.content ?? ''}
              modified={previewQuery.data?.current ?? ''}
              originalModelPath={`local-history://snapshot/${entry?.id}/${path}`}
              modifiedModelPath={`local-history://current/${path}`}
              options={{
                readOnly: true,
                originalEditable: false,
                renderSideBySide: true,
                minimap: { enabled: false },
                automaticLayout: true,
                scrollBeyondLastLine: false,
                smoothScrolling: motionSmoothScrolling,
                fontSize: 13,
              }}
            />
          )}
        </div>
        <DialogFooter className="shrink-0 border-t border-border/70 px-5 py-3">
          <Button
            type="button"
            variant="destructive"
            disabled={!entry}
            onClick={() => entry && onDelete(entry)}
          >
            {t('localHistory.delete')}
          </Button>
          <Button type="button" disabled={!entry} onClick={() => entry && onRestore(entry)}>
            {t('localHistory.restore')}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}

export default LocalHistoryPreviewDialog
