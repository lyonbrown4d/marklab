import { useId, useState } from 'react'
import { Badge } from '@/components/ui/badge'
import { useI18n } from '@/i18n/useI18n'

export type MarkdownMediaPreviewKind = 'audio' | 'video'

export type MarkdownMediaPreviewProps = {
  kind: MarkdownMediaPreviewKind
  title: string
  src: string
  href: string
}

type MediaLoadState = 'loading' | 'ready' | 'error'
type MediaLoadSnapshot = {
  src: string
  state: MediaLoadState
}

const mediaBadges: Record<MarkdownMediaPreviewKind, string> = {
  audio: 'AUDIO',
  video: 'VIDEO',
}

type Translate = (key: string, options?: Record<string, unknown>) => string

const statusText = (kind: MarkdownMediaPreviewKind, state: MediaLoadState, t: Translate) => {
  const label = t(`preview.kind.${kind}`)

  if (state === 'error') return t('preview.mediaFailed', { kind: label })
  if (state === 'loading') return t('preview.mediaLoading', { kind: label })

  return t('preview.mediaReady', { kind: label })
}

export const MarkdownMediaPreview = ({ href, kind, src, title }: MarkdownMediaPreviewProps) => {
  const { t } = useI18n()
  const statusId = useId()
  const displayTitle = title.trim() || href
  const [loadSnapshot, setLoadSnapshot] = useState<MediaLoadSnapshot>(() => ({
    src,
    state: src ? 'loading' : 'error',
  }))
  const loadState = loadSnapshot.src === src ? loadSnapshot.state : src ? 'loading' : 'error'
  const isVideo = kind === 'video'
  const isLoading = loadState === 'loading'
  const isError = loadState === 'error'
  const visibleStatus = isLoading || isError

  const handleReady = () => {
    setLoadSnapshot({ src, state: 'ready' })
  }

  const handleError = () => {
    setLoadSnapshot({ src, state: 'error' })
  }

  return (
    <article
      className="rounded-xl border border-border bg-card p-3 text-card-foreground shadow-sm"
      contentEditable={false}
    >
      <div className="flex min-w-0 items-start justify-between gap-3">
        <div className="min-w-0">
          <div className="flex min-w-0 items-center gap-2">
            <Badge variant="secondary" className="shrink-0 rounded px-2 py-0.5 text-[10px]">
              {mediaBadges[kind]}
            </Badge>
            <span className="truncate text-sm font-medium">{displayTitle}</span>
          </div>
          <div className="mt-1 truncate text-xs text-muted-foreground" title={href}>
            {href}
          </div>
        </div>
      </div>

      <div className="mt-3">
        {isVideo ? (
          <div className="relative overflow-hidden rounded-lg border border-border bg-black">
            <video
              aria-describedby={statusId}
              className="aspect-video w-full bg-black"
              controls
              onCanPlay={handleReady}
              onError={handleError}
              onLoadedMetadata={handleReady}
              preload="metadata"
              src={src}
            />
            {visibleStatus ? (
              <div className="pointer-events-none absolute inset-x-0 bottom-0 bg-background/90 px-3 py-2 text-xs text-muted-foreground backdrop-blur">
                {statusText(kind, loadState, t)}
              </div>
            ) : null}
          </div>
        ) : (
          <div className="rounded-lg border border-border bg-muted/30 p-3">
            <audio
              aria-describedby={statusId}
              className="w-full"
              controls
              onCanPlay={handleReady}
              onError={handleError}
              onLoadedMetadata={handleReady}
              preload="metadata"
              src={src}
            />
            {visibleStatus ? (
              <div className="mt-2 text-xs text-muted-foreground">
                {statusText(kind, loadState, t)}
              </div>
            ) : null}
          </div>
        )}
      </div>

      <div className="sr-only" id={statusId} role="status">
        {statusText(kind, loadState, t)}
      </div>
    </article>
  )
}

export default MarkdownMediaPreview
