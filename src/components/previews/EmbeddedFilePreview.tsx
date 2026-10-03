import { useCallback, useEffect, useMemo, useRef, useState, type SyntheticEvent } from 'react'
import {
  EmbeddedPreviewBody,
  type EmbeddedPreviewVariant,
} from '@/components/previews/EmbeddedPreviewBody'
import { EmbeddedPreviewDialog } from '@/components/previews/EmbeddedPreviewDialog'
import { EmbeddedPreviewHeader } from '@/components/previews/EmbeddedPreviewHeader'
import {
  embeddedPreviewKindForTarget,
  resolveEmbeddedPreviewTarget,
  type EmbeddedPreviewResolvedTarget,
} from '@/components/previews/embeddedPreviewSource'
import { useI18n } from '@/i18n/useI18n'
import { useDeferredOpenContent } from '@/hooks/useDeferredOpenContent'
import { createFileLabel } from '@/logic/paths'
import { pathToFileViewRoute } from '@/logic/routing'
import { cn } from '@/lib/utils'
import { fsApi } from '@/services/fsApi'

type EmbeddedFilePreviewProps = {
  className?: string
  documentPath: string | null
  target: string
  title?: string
  variant?: EmbeddedPreviewVariant
}

type ResolvedState = {
  failed: boolean
  key: string
  target: EmbeddedPreviewResolvedTarget | null
}

const sourceKey = (documentPath: string | null, target: string) =>
  `${documentPath ?? ''}\u0000${target}`

const previewKindLabelKey = (kind: string) => `preview.kind.${kind}`

const navigateToPreviewTab = (path: string) => {
  window.location.hash = pathToFileViewRoute(path, 'preview')
}

export const EmbeddedFilePreview = ({
  className,
  documentPath,
  target,
  title,
  variant = 'document',
}: EmbeddedFilePreviewProps) => {
  const { t } = useI18n()
  const cardRef = useRef<HTMLElement | null>(null)
  const [expanded, setExpanded] = useState(false)
  const [visible, setVisible] = useState(false)
  const [resolveRequested, setResolveRequested] = useState(false)
  const expandedContentReady = useDeferredOpenContent(expanded)
  const key = sourceKey(documentPath, target)
  const kind = embeddedPreviewKindForTarget(target)
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

  const stopEditorChromeEvent = useCallback((event: SyntheticEvent) => {
    event.stopPropagation()
  }, [])
  const handlePointerDown = useCallback(
    (event: SyntheticEvent) => {
      const targetElement = event.target instanceof Element ? event.target : null
      const graphDragHandle = targetElement?.closest('.embedded-preview-drag-handle')
      const interactiveControl = targetElement?.closest('.nodrag')
      if (variant === 'graph' && graphDragHandle && !interactiveControl) return
      event.stopPropagation()
    },
    [variant],
  )
  const requestResolve = useCallback(() => setResolveRequested(true), [])

  const refreshTarget = useCallback(async () => {
    try {
      const nextTarget = await resolveEmbeddedPreviewTarget(documentPath, target)
      setResolvedState({ failed: !nextTarget, key, target: nextTarget })
      return nextTarget
    } catch {
      setResolvedState({ failed: true, key, target: null })
      return null
    }
  }, [documentPath, key, target])

  useEffect(() => {
    const card = cardRef.current
    if (!card || visible) return
    if (typeof IntersectionObserver !== 'function') {
      const fallbackTimer = window.setTimeout(() => setVisible(true), 0)
      return () => window.clearTimeout(fallbackTimer)
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
    return () => observer.disconnect()
  }, [visible])

  useEffect(() => {
    if (!shouldResolve) return
    let cancelled = false

    void resolveEmbeddedPreviewTarget(documentPath, target).then(
      (nextTarget) => {
        if (!cancelled) setResolvedState({ failed: !nextTarget, key, target: nextTarget })
      },
      () => {
        if (!cancelled) setResolvedState({ failed: true, key, target: null })
      },
    )
    return () => {
      cancelled = true
    }
  }, [documentPath, key, shouldResolve, target])

  if (!kind) return null

  const openTab = () => {
    if (resolved?.path) navigateToPreviewTab(resolved.path)
  }
  const openInSystem = () => {
    if (resolved?.path) void fsApi.openPathInSystem(resolved.path)
  }
  const openExpanded = () => {
    requestResolve()
    setExpanded(true)
    void refreshTarget()
  }

  return (
    <article
      ref={cardRef}
      className={cn(
        'embedded-preview-card group overflow-hidden rounded-lg border border-border/80 bg-background/85 text-foreground shadow-sm transition-colors [contain-intrinsic-size:0_320px] [content-visibility:auto] hover:border-primary/35',
        variant === 'graph' && 'h-full min-h-0',
        className,
      )}
      contentEditable={false}
      data-marklab-editor-chrome="embedded-preview"
      data-preview-variant={variant}
      onClick={stopEditorChromeEvent}
      onDoubleClick={stopEditorChromeEvent}
      onFocusCapture={requestResolve}
      onPointerDown={handlePointerDown}
      onPointerEnter={requestResolve}
    >
      <EmbeddedPreviewHeader
        dragHandle={variant === 'graph'}
        failed={failed}
        kind={kind}
        labels={{
          expand: `${t('preview.openEmbedded')}: ${displayTitle}`,
          kind: t(previewKindLabelKey(kind)),
          openInSystem: t('preview.openInSystem'),
          openInTab: t('preview.openInTab'),
        }}
        onExpand={openExpanded}
        onOpenInSystem={openInSystem}
        onOpenInTab={openTab}
        pathAvailable={Boolean(resolved?.path)}
        title={displayTitle}
      />
      {!expanded ? (
        <EmbeddedPreviewBody
          displayTitle={displayTitle}
          failed={failed}
          failedLabel={t('preview.inlineFailed')}
          graphPdfLoadLabel={t('preview.graphPdfLoad')}
          loadingLabel={t('preview.inlineLoading')}
          pendingLabel={t('preview.inlinePending')}
          refreshTarget={refreshTarget}
          resolved={resolved}
          shouldResolve={shouldResolve}
          status={status}
          target={target}
          variant={variant}
        />
      ) : null}
      <EmbeddedPreviewDialog
        failed={failed}
        failedLabel={t('preview.inlineFailed')}
        loadingLabel={t('preview.inlineLoading')}
        onOpenChange={setExpanded}
        open={expanded}
        ready={expandedContentReady}
        resolved={resolved}
        target={target}
        title={displayTitle}
      />
    </article>
  )
}

export default EmbeddedFilePreview
