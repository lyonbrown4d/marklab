import { useLink } from '@platejs/link/react'
import type { TElement, TLinkElement } from 'platejs'
import { PlateElement, type PlateElementProps } from 'platejs/react'
import { useEffect, useState, type MouseEvent } from 'react'
import EmbeddedFilePreview from '@/components/previews/EmbeddedFilePreview'
import {
  isLocalEmbeddedPreviewTarget,
  platePreviewKindForTarget,
  resolvePlateImageSource,
  safeExternalLinkUrl,
  safePreviewUrl,
} from '@/components/plate/nodes/previewAdapters'
import { usePlateLinkPreviewPortal } from '@/components/plate/nodes/usePlateLinkPreviewPortal'
import { useI18n } from '@/i18n/useI18n'

type ImageElementNode = TElement & {
  caption?: Array<{ text?: string }>
  title?: string
  url?: string
}

export type PlatePreviewOptions = {
  getDocumentPath?: () => string | null
  onWorkspaceLink?: (target: string, documentPath: string | null) => void
}

type ResolvedPlateImageProps = {
  alt: string
  documentPath: string | null
  src: string
  title?: string
}

type ResolvedImageState = {
  key: string
  status: 'error' | 'loading' | 'ready'
  url: string
}

const imageAlt = (element: ImageElementNode) => {
  const caption = element.caption
    ?.map((part) => part.text ?? '')
    .join('')
    .trim()
  return caption || element.title?.trim() || ''
}

const elementText = (node: unknown): string => {
  if (!node || typeof node !== 'object') return ''
  if ('text' in node && typeof node.text === 'string') return node.text
  if (!('children' in node) || !Array.isArray(node.children)) return ''
  return node.children.map(elementText).join('')
}

const LINK_SCHEME = /^[a-z][a-z\d+.-]*:/i

const isWorkspaceLinkTarget = (target: string): boolean =>
  Boolean(target) &&
  !target.startsWith('#') &&
  !target.startsWith('//') &&
  !LINK_SCHEME.test(target)

export const ResolvedPlateImage = ({ alt, documentPath, src, title }: ResolvedPlateImageProps) => {
  const { t } = useI18n()
  const key = `${documentPath ?? ''}\u0000${src}`
  const [state, setState] = useState<ResolvedImageState>({ key: '', status: 'loading', url: '' })
  const directUrl = /^[a-z][a-z\d+.-]*:/i.test(src.trim()) ? safePreviewUrl(src) : ''
  const current =
    state.key === key
      ? state
      : directUrl
        ? { key, status: 'ready' as const, url: directUrl }
        : { key, status: 'loading' as const, url: '' }

  useEffect(() => {
    let active = true

    void resolvePlateImageSource(documentPath, src).then((url) => {
      if (!active) return
      setState({ key, status: url ? 'ready' : 'error', url })
    })

    return () => {
      active = false
    }
  }, [documentPath, key, src])

  if (current.status === 'loading') {
    return (
      <div
        className="rounded-lg border border-dashed border-border p-4 text-sm text-muted-foreground"
        role="status"
      >
        {t('preview.loading')}
      </div>
    )
  }

  if (current.status === 'error') {
    return (
      <div
        className="rounded-lg border border-dashed border-border p-4 text-sm text-muted-foreground"
        role="alert"
      >
        {t('preview.failed')}
      </div>
    )
  }

  return (
    <img
      alt={alt}
      className="max-h-[70vh] max-w-full rounded-lg border border-border object-contain"
      loading="lazy"
      onError={() => setState({ key, status: 'error', url: '' })}
      src={current.url}
      title={title}
    />
  )
}

export const createLinkElement = ({
  getDocumentPath,
  onWorkspaceLink,
}: PlatePreviewOptions = {}) => {
  const PlateLinkElement = (props: PlateElementProps<TLinkElement>) => {
    const { props: linkProps } = useLink({ element: props.element })
    const target = props.element.url?.trim() ?? ''
    const documentPath = getDocumentPath?.() ?? null
    const previewKind = platePreviewKindForTarget(target)
    const localPreview = Boolean(previewKind && isLocalEmbeddedPreviewTarget(target))
    const externalHref = safeExternalLinkUrl(target)
      ? safeExternalLinkUrl(linkProps.href ?? target)
      : undefined
    const workspaceTarget = isWorkspaceLinkTarget(target)
    const href = externalHref ?? (target.startsWith('#') ? target : undefined)
    const title = elementText(props.element).trim() || target
    const { anchorRef, preview } = usePlateLinkPreviewPortal({
      documentPath,
      externalUrl: externalHref,
      target,
      title,
    })
    const handleClick = workspaceTarget
      ? (event: MouseEvent<HTMLAnchorElement>) => {
          event.preventDefault()
          onWorkspaceLink?.(target, documentPath)
        }
      : undefined
    const attributes = {
      ...props.attributes,
      ...linkProps,
      href,
      onClick: handleClick,
      rel: externalHref ? 'noopener noreferrer' : undefined,
      role: 'link',
      target: externalHref ? '_blank' : undefined,
    }

    return (
      <>
        <PlateElement
          {...props}
          as="a"
          attributes={attributes}
          className="text-primary underline decoration-primary/40 underline-offset-4 hover:decoration-primary"
          ref={localPreview || externalHref ? anchorRef : undefined}
        />
        {localPreview || externalHref ? preview : null}
      </>
    )
  }

  return PlateLinkElement
}

export const LinkElement = createLinkElement()

export const createImageElement = ({ getDocumentPath }: PlatePreviewOptions = {}) => {
  const ImageElement = (props: PlateElementProps<ImageElementNode>) => {
    const target = props.element.url?.trim() ?? ''
    const kind = platePreviewKindForTarget(target)
    const title = imageAlt(props.element) || target

    if (kind && kind !== 'image') {
      return (
        <PlateElement {...props} as="div">
          <div contentEditable={false}>
            <EmbeddedFilePreview
              documentPath={getDocumentPath?.() ?? null}
              target={target}
              title={title}
            />
          </div>
          <span className="sr-only">{props.children}</span>
        </PlateElement>
      )
    }

    return (
      <PlateElement {...props} as="div" className="my-5">
        <figure contentEditable={false}>
          <ResolvedPlateImage
            alt={imageAlt(props.element)}
            documentPath={getDocumentPath?.() ?? null}
            src={target}
            title={props.element.title}
          />
          {imageAlt(props.element) ? (
            <figcaption className="mt-2 text-center text-sm text-muted-foreground">
              {imageAlt(props.element)}
            </figcaption>
          ) : null}
        </figure>
        <span className="sr-only">{props.children}</span>
      </PlateElement>
    )
  }

  return ImageElement
}
