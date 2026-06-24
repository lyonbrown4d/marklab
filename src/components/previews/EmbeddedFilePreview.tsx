import { ExternalLink, FileText, ImageIcon, Maximize2, Music, Video } from 'lucide-react'
import { useCallback, useEffect, useMemo, useRef, useState, type SyntheticEvent } from 'react'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { Spinner } from '@/components/ui/spinner'
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

const navigateToPreviewTab = (path: string) => {
  window.location.hash = pathToFileViewRoute(path, 'preview')
}

export const EmbeddedFilePreview = ({
  className,
  documentPath,
  target,
  title,
}: EmbeddedFilePreviewProps) => {
  const { t } = useI18n()
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
  const stopEditorChromeEvent = useCallback((event: SyntheticEvent) => {
    event.stopPropagation()
  }, [])
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

  const requestResolve = () => {
    setResolveRequested(true)
  }

  const openTab = () => {
    if (!resolved?.path) return
    navigateToPreviewTab(resolved.path)
  }

  const openInSystem = () => {
    if (!resolved?.path) return
    void fsApi.openPathInSystem(resolved.path)
  }

  const openEmbeddedPreview = () => {
    requestResolve()
    setExpanded(true)
  }

  return (
    <article
      ref={cardRef}
      className={cn(
        'embedded-preview-card rounded-lg border border-border/80 bg-background/85 p-3 text-foreground shadow-sm transition-colors [contain-intrinsic-size:0_128px] [content-visibility:auto] hover:border-primary/35 hover:bg-card/85',
        className,
      )}
      contentEditable={false}
      data-marklab-editor-chrome="embedded-preview"
      onClick={stopEditorChromeEvent}
      onDoubleClick={stopEditorChromeEvent}
      onPointerDown={stopEditorChromeEvent}
    >
      <div className="flex min-w-0 items-start gap-3">
        <button
          type="button"
          className="embedded-preview-trigger flex min-w-0 flex-1 cursor-pointer items-start gap-3 rounded-md text-left transition-colors"
          aria-label={`${t('preview.openEmbedded')}: ${displayTitle}`}
          disabled={failed}
          onClick={openEmbeddedPreview}
          onFocus={requestResolve}
          onPointerEnter={requestResolve}
        >
          <div className="rounded-md bg-secondary p-2 text-secondary-foreground ring-1 ring-border/60">
            <Icon className="size-4" aria-hidden="true" />
          </div>
          <div className="min-w-0 flex-1">
            <div className="flex min-w-0 items-center gap-2">
              <Badge variant="secondary" className="shrink-0">
                {t(previewKindLabelKey(kind))}
              </Badge>
              <span className="truncate text-sm font-medium">{displayTitle}</span>
            </div>
            <div className="mt-1 truncate text-xs text-muted-foreground" title={status}>
              {status}
            </div>
          </div>
        </button>
        <div className="flex shrink-0 flex-wrap items-center justify-end gap-1">
          {resolved?.path ? (
            <Button
              type="button"
              variant="ghost"
              size="sm"
              className="h-7 px-2"
              onClick={openInSystem}
            >
              <ExternalLink data-icon="inline-start" />
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
            <Maximize2 data-icon="inline-start" />
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
              <div className="flex h-full items-center justify-center gap-2 text-sm text-muted-foreground">
                {failed ? null : <Spinner />}
                <span>{failed ? t('preview.inlineFailed') : t('preview.inlineLoading')}</span>
              </div>
            )}
          </div>
        </DialogContent>
      </Dialog>
    </article>
  )
}

export default EmbeddedFilePreview
