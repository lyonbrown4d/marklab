import { useCallback, useEffect, useRef, useState, type SyntheticEvent } from 'react'

import { ExternalWebPreviewSurface } from '@/components/previews/ExternalWebPreviewSurface'

type ExternalLinkPreviewProps = {
  className?: string
  title?: string
  url: string
}

export const ExternalLinkPreview = ({ className, title, url }: ExternalLinkPreviewProps) => {
  const cardRef = useRef<HTMLElement | null>(null)
  const [focused, setFocused] = useState(false)
  const [hovered, setHovered] = useState(false)
  const [requested, setRequested] = useState(false)
  const [visible, setVisible] = useState(false)
  const requestPreview = useCallback(() => setRequested(true), [])

  useEffect(() => {
    const card = cardRef.current
    if (!card || typeof IntersectionObserver !== 'function') return
    const observer = new IntersectionObserver(
      (entries) => {
        const nextVisible = entries.some((entry) => entry.isIntersecting)
        setVisible(nextVisible)
        if (nextVisible) requestPreview()
      },
      { rootMargin: '180px' },
    )
    observer.observe(card)
    return () => observer.disconnect()
  }, [requestPreview])

  const stopEditorEvent = useCallback((event: SyntheticEvent) => event.stopPropagation(), [])
  const fallbackTitle = title?.trim() || url

  return (
    <article
      ref={cardRef}
      aria-label={fallbackTitle}
      contentEditable={false}
      data-marklab-editor-chrome="external-link-preview"
      onClick={stopEditorEvent}
      onBlurCapture={() => setFocused(false)}
      onFocusCapture={() => {
        setFocused(true)
        requestPreview()
      }}
      onPointerDown={stopEditorEvent}
      onPointerEnter={() => {
        setHovered(true)
        requestPreview()
      }}
      onPointerLeave={() => setHovered(false)}
      role="article"
    >
      <ExternalWebPreviewSurface
        capturePriority={focused || hovered ? 'interactive' : 'background'}
        captureRequested={visible || focused || hovered}
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
