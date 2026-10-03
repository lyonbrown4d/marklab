import { useCallback, useRef, useState, type RefCallback } from 'react'
import { createPortal } from 'react-dom'
import EmbeddedFilePreview from '@/components/previews/EmbeddedFilePreview'
import ExternalLinkPreview from '@/components/previews/ExternalLinkPreview'

type PlateLinkPreviewPortalOptions = {
  documentPath: string | null
  externalUrl?: string
  target: string
  title: string
}

const createPreviewHost = (anchor: HTMLElement) => {
  const block = anchor.closest<HTMLElement>('[data-slate-node="element"]:not([data-slate-inline])')
  if (!block) return null

  const host = document.createElement('div')
  host.contentEditable = 'false'
  host.dataset.plateLinkPreviewHost = 'true'
  host.dataset.slateIgnore = 'true'

  const contentContainer = block.closest<HTMLElement>('li, td, th')
  if (contentContainer) {
    contentContainer.append(host)
    return host
  }

  let insertionPoint = block
  while (insertionPoint.nextElementSibling?.hasAttribute('data-plate-link-preview-host')) {
    insertionPoint = insertionPoint.nextElementSibling as HTMLElement
  }
  insertionPoint.after(host)
  return host
}

export const usePlateLinkPreviewPortal = ({
  documentPath,
  externalUrl,
  target,
  title,
}: PlateLinkPreviewPortalOptions) => {
  const hostRef = useRef<HTMLElement | null>(null)
  const [host, setHost] = useState<HTMLElement | null>(null)
  const anchorRef: RefCallback<HTMLElement> = useCallback((anchor) => {
    if (!anchor) {
      const previousHost = hostRef.current
      previousHost?.remove()
      hostRef.current = null
      if (previousHost) setHost(null)
      return
    }
    if (hostRef.current?.isConnected) return

    const nextHost = createPreviewHost(anchor)
    hostRef.current = nextHost
    setHost(nextHost)
  }, [])

  return {
    anchorRef,
    preview: host
      ? createPortal(
          externalUrl ? (
            <ExternalLinkPreview title={title} url={externalUrl} />
          ) : (
            <EmbeddedFilePreview documentPath={documentPath} target={target} title={title} />
          ),
          host,
        )
      : null,
  }
}
