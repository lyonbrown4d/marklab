import { useMemo, useRef } from 'react'
import { useMutation, useQuery } from '@tanstack/react-query'
import { Button } from '@/components/ui/button'
import FilePreviewSurface from '@/components/previews/FilePreviewSurface'
import { PreviewLoadingFallback } from '@/components/previews/PreviewLoadingFallback'
import { GitQueryState } from '@/components/git/GitQueryState'
import { GitDiffUnavailable } from '@/components/git/GitDiffUnavailable'
import { getPreviewFileKind, isMarkdownFilePath } from '@/logic/fileTypes'
import { gitApiForWorkspace } from '@/services/gitApi'
import type { GitOpenFileRequest, GitPreviewUnavailableReason } from '@/types/gitPreview'
import { useI18n } from '@/i18n/useI18n'

type Props = {
  rootPath: string
  file: Omit<GitOpenFileRequest, 'action'>
  reason?: GitPreviewUnavailableReason
  conflict?: boolean
}

export const GitFilePreview = ({ rootPath, file, reason, conflict = false }: Props) => {
  const { t } = useI18n()
  const api = useMemo(() => gitApiForWorkspace(rootPath), [rootPath])
  const adapter = getPreviewFileKind(file.path)
  const kind =
    reason === 'binary' || reason === 'unsupported_encoding'
      ? adapter === 'source'
        ? null
        : adapter
      : (adapter ?? (isMarkdownFilePath(file.path) ? 'source' : null))
  const query = useQuery({
    queryKey: ['git-file-preview', rootPath, file],
    queryFn: async () => {
      const result = await api.openFile({ ...file, action: 'preview' })
      if (result.kind !== 'preview') throw new Error('File preview was not returned')
      return result
    },
    enabled: Boolean(kind),
    gcTime: 0,
    staleTime: 0,
    retry: false,
  })
  const open = useMutation({ mutationFn: () => api.openFile({ ...file, action: 'system' }) })
  const opening = useRef(false)
  const openInSystem = () => {
    if (opening.current) return
    opening.current = true
    open.mutate(undefined, {
      onSettled: () => {
        opening.current = false
      },
    })
  }
  return (
    <div className="flex h-full min-h-0 flex-col">
      <div className="flex shrink-0 flex-wrap items-center justify-between gap-2 border-b border-border px-3 py-2 text-xs">
        <span className="text-muted-foreground">
          {query.data
            ? `${query.data.label}${query.data.snapshot ? ` · ${t('scm.filePreview.snapshot')}` : ''}`
            : t('scm.filePreview.title')}
        </span>
        <Button size="sm" variant="outline" disabled={open.isPending} onClick={openInSystem}>
          {t('preview.openInSystem')}
        </Button>
      </div>
      <GitQueryState loading={false} error={open.error} />
      <div className="min-h-0 flex-1 overflow-auto">
        {!kind ? (
          <GitDiffUnavailable reason={reason ?? 'binary'} conflict={conflict} />
        ) : query.isLoading ? (
          <PreviewLoadingFallback label={t('preview.loading')} />
        ) : query.isError ? (
          <GitQueryState
            loading={false}
            error={query.error}
            onRetry={() => {
              void query.refetch()
            }}
          />
        ) : (
          query.data && (
            <FilePreviewSurface
              kind={kind}
              path={query.data.path}
              src={query.data.url}
              title={query.data.path}
              snapshot={query.data.snapshot}
              onOpenInSystem={openInSystem}
              readonly={query.data.readonly || conflict}
            />
          )
        )}
      </div>
    </div>
  )
}
