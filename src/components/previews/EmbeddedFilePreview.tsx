import { ExternalLink, FileText, ImageIcon, Maximize2, Music, Video } from 'lucide-react'
import { useEffect, useMemo, useRef, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { Button } from '@/components/ui/button'
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import FilePreviewSurface from '@/components/previews/FilePreviewSurface'
import {
  embeddedPreviewKindForTarget,
  resolveEmbeddedPreviewTarget,
  type EmbeddedPreviewResolvedTarget,
} from '@/components/previews/embeddedPreviewSource'
import { useI18n } from '@/i18n/useI18n'
import type { PreviewFileKind } from '@/logic/fileTypes'
import { createFileLabel } from '@/logic/paths'
import { pathToFileViewRoute } from '@/logic/routing'
import { cn } from '@/lib/utils'
import { fsApi } from '@/services/fsApi'

type EmbeddedFilePreviewProps = {
  className?: string
  documentPath: string | null
  target: string
  title?: string
}

type ResolvedState = {
  failed: boolean
  key: string
  target: EmbeddedPreviewResolvedTarget | null
}

const previewIcons: Record<PreviewFileKind, typeof FileText> = {
  audio: Music,
  docx: FileText,
  drawio: FileText,
  excalidraw: FileText,
  image: ImageIcon,
  pdf: FileText,
  video: Video,
}

const sourceKey = (documentPath: string | null, target: string) =>
  `${documentPath ?? ''}\u0000${target}`

const previewKindLabelKey = (kind: PreviewFileKind) => `preview.kind.${kind}`

export const EmbeddedFilePreview = ({
  className,
  documentPath,
  target,
  title,
}: EmbeddedFilePreviewProps) => {
  const { t } = useI18n()
  const navigate = useNavigate()
  const cardRef = useRef<HTMLElement | null>(null)
  const [expanded, setExpanded] = useState(false)
  const [visible, setVisible] = useState(false)
  const [resolveRequested, setResolveRequested] = useState(false)
  const key = sourceKey(documentPath, target)
  const kind = embeddedPreviewKindForTarget(target)
  const Icon = kind ? previewIcons[kind] : FileText
  const displayTitle = title?.trim() || createFileLabel(target)
  const [resolvedState, setResolvedState] = useState<ResolvedState>({
    failed: false,
    key: '',
    target: null,
  })
  const resolved = resolvedState.key === key ? resolvedState.target : null
  const failed = resolvedState.key === key ? resolvedState.failed : false
  const shouldResolve = visible || resolveRequested || expanded
  const status = useMemo(() => {
    if (failed) return t('preview.inlineFailed')
    if (!shouldResolve) return t('preview.inlinePending')
    if (!resolved) return t('preview.inlineLoading')
    if (resolved.external) return t('preview.inlineExternal')
    if (resolved.readonly) return t('preview.inlineReadonly', { path: resolved.path ?? target })
    return t('preview.inlineReady', { path: resolved.path ?? target })
  }, [failed, resolved, shouldResolve, t, target])

  useEffect(() => {
    const card = cardRef.current
    if (!card) return
    if (visible) return
    if (typeof IntersectionObserver !== 'function') {
      const fallbackTimer = window.setTimeout(() => setVisible(true), 0)
      return () => {
        window.clearTimeout(fallbackTimer)
      }
    }

    const observer = new IntersectionObserver(
      (entries) => {
        if (!entries.some((entry) => entry.isIntersecting)) return
        setVisible(true)
        observer.disconnect()
      },
      { rootMargin: '180px' },
    )
    observer.observe(card)

    return () => {
      observer.disconnect()
    }
  }, [visible])

  useEffect(() => {
    if (!shouldResolve) return
    let cancelled = false

    void resolveEmbeddedPreviewTarget(documentPath, target)
      .then((nextTarget) => {
        if (!cancelled) {
          setResolvedState({ failed: !nextTarget, key, target: nextTarget })
        }
      })
      .catch(() => {
        if (!cancelled) {
          setResolvedState({ failed: true, key, target: null })
        }
      })

    return () => {
      cancelled = true
    }
  }, [documentPath, key, shouldResolve, target])

  if (!kind) return null

  const openTab = () => {
    if (!resolved?.path) return
    navigate(pathToFileViewRoute(resolved.path, 'preview'))
  }

  const openInSystem = () => {
    if (!resolved?.path) return
    void fsApi.openPathInSystem(resolved.path)
  }

  const openEmbeddedPreview = () => {
    setResolveRequested(true)
    setExpanded(true)
  }

  return (
    <article
      ref={cardRef}
      className={cn(
        'embedded-preview-card rounded-xl border border-border bg-card p-3 text-card-foreground shadow-sm transition-colors hover:border-primary/30 hover:bg-card/95',
        className,
      )}
      contentEditable={false}
    >
      <div className="flex min-w-0 items-start gap-3">
        <div className="rounded-lg bg-secondary p-2 text-secondary-foreground ring-1 ring-border/60">
          <Icon className="size-4" aria-hidden="true" />
        </div>
        <div className="min-w-0 flex-1">
          <div className="flex min-w-0 items-center gap-2">
            <span className="rounded-full bg-secondary px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-secondary-foreground ring-1 ring-border/60">
              {t(previewKindLabelKey(kind))}
            </span>
            <span className="truncate text-sm font-medium">{displayTitle}</span>
          </div>
          <div className="mt-1 truncate text-xs text-muted-foreground" title={status}>
            {status}
          </div>
        </div>
        <div className="flex shrink-0 flex-wrap items-center justify-end gap-1">
          {resolved?.path ? (
            <Button
              type="button"
              variant="ghost"
              size="sm"
              className="h-7 px-2"
              onClick={openInSystem}
            >
              <ExternalLink className="size-3.5" />
              {t('preview.openInSystem')}
            </Button>
          ) : null}
          {resolved?.path ? (
            <Button
              type="button"
              variant="outline"
              size="sm"
              className="h-7 px-2"
              onClick={openTab}
            >
              {t('preview.openInTab')}
            </Button>
          ) : null}
          <Button
            type="button"
            variant="secondary"
            size="sm"
            className="h-7 px-2"
            disabled={failed}
            onClick={openEmbeddedPreview}
          >
            <Maximize2 className="size-3.5" />
            {t('preview.openEmbedded')}
          </Button>
        </div>
      </div>

      <Dialog open={expanded} onOpenChange={setExpanded}>
        <DialogContent className="flex h-[92vh] max-w-[96vw] flex-col p-0">
          <DialogHeader className="border-b border-border px-4 py-3">
            <DialogTitle className="truncate text-sm">{displayTitle}</DialogTitle>
          </DialogHeader>
          <div className="min-h-0 flex-1 overflow-auto p-4">
            {resolved ? (
              <FilePreviewSurface
                kind={resolved.kind}
                path={resolved.path ?? target}
                readonly={resolved.readonly}
                src={resolved.src}
                title={displayTitle}
              />
            ) : (
              <div className="flex h-full items-center justify-center text-sm text-muted-foreground">
                {failed ? t('preview.inlineFailed') : t('preview.inlineLoading')}
              </div>
            )}
          </div>
        </DialogContent>
      </Dialog>
    </article>
  )
}

export default EmbeddedFilePreview
