import { useCallback, useEffect, useRef, useState, type SyntheticEvent } from 'react'

import { ExternalWebPreviewSurface } from '@/components/previews/ExternalWebPreviewSurface'

type ExternalLinkPreviewProps = {
  className?: string
  title?: string
  url: string
}

export const ExternalLinkPreview = ({ className, title, url }: ExternalLinkPreviewProps) => {
  const cardRef = useRef<HTMLElement | null>(null)
  const [requested, setRequested] = useState(false)
  const requestPreview = useCallback(() => setRequested(true), [])

  useEffect(() => {
    const card = cardRef.current
    if (!card || requested || typeof IntersectionObserver !== 'function') return
    const observer = new IntersectionObserver(
      (entries) => {
        if (!entries.some((entry) => entry.isIntersecting)) return
        requestPreview()
        observer.disconnect()
      },
      { rootMargin: '180px' },
    )
    observer.observe(card)
    return () => observer.disconnect()
  }, [requestPreview, requested])

  const stopEditorEvent = useCallback((event: SyntheticEvent) => event.stopPropagation(), [])
  const fallbackTitle = title?.trim() || url

  return (
    <article
      ref={cardRef}
      aria-label={fallbackTitle}
      contentEditable={false}
      data-marklab-editor-chrome="external-link-preview"
      onClick={stopEditorEvent}
      onFocusCapture={requestPreview}
      onPointerDown={stopEditorEvent}
      onPointerEnter={requestPreview}
      role="article"
    >
      <ExternalWebPreviewSurface
        className={className}
        requested={requested}
        title={title}
        url={url}
        variant="editor"
      />
    </article>
  )
}

export default ExternalLinkPreview
