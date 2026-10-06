import { useLink } from '@platejs/link/react'
import { Maximize2 } from 'lucide-react'
import type { TElement, TLinkElement } from 'platejs'
import { PlateElement, type PlateElementProps } from 'platejs/react'
import { useEffect, useRef, useState, type MouseEvent, type SyntheticEvent } from 'react'
import EmbeddedFilePreview from '@/components/previews/EmbeddedFilePreview'
import { DiagramPreviewDialog } from '@/components/previews/DiagramPreviewDialog'
import { Button } from '@/components/ui/button'
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

type ImageInteractionState = {
  expanded: boolean
  key: string
  naturalSize: { height: number; width: number } | null
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
  const expandButtonRef = useRef<HTMLButtonElement | null>(null)
  const key = `${documentPath ?? ''}\u0000${src}`
  const [interaction, setInteraction] = useState<ImageInteractionState>({
    expanded: false,
    key,
    naturalSize: null,
  })
  const [state, setState] = useState<ResolvedImageState>({ key: '', status: 'loading', url: '' })
  const directUrl = /^[a-z][a-z\d+.-]*:/i.test(src.trim()) ? safePreviewUrl(src) : ''
  const current =
    state.key === key
      ? state
      : directUrl
        ? { key, status: 'ready' as const, url: directUrl }
        : { key, status: 'loading' as const, url: '' }
  const currentInteraction =
    interaction.key === key ? interaction : { expanded: false, key, naturalSize: null }

  if (interaction.key !== key) setInteraction(currentInteraction)

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

  const dialogTitle = alt || title || t('preview.kind.image')
  const stopEditorEvent = (event: SyntheticEvent) => event.stopPropagation()

  return (
    <div className="group/image relative mx-auto w-fit max-w-full" contentEditable={false}>
      <img
        alt={alt}
        className="max-h-[70vh] max-w-full rounded-lg border border-border object-contain"
        loading="lazy"
        onError={() => setState({ key, status: 'error', url: '' })}
        onLoad={(event) => {
          const { naturalHeight, naturalWidth } = event.currentTarget
          if (naturalHeight > 0 && naturalWidth > 0) {
            setInteraction((current) =>
              current.key === key
                ? { ...current, naturalSize: { height: naturalHeight, width: naturalWidth } }
                : current,
            )
          }
        }}
        src={current.url}
        title={title}
      />
      <Button
        ref={expandButtonRef}
        aria-label={t('preview.imageExpand')}
        className="absolute right-2 top-2 opacity-0 shadow-sm transition-opacity group-focus-within/image:opacity-100 group-hover/image:opacity-100 focus:opacity-100"
        onClick={(event) => {
          event.stopPropagation()
          setInteraction((current) =>
            current.key === key ? { ...current, expanded: true } : current,
          )
        }}
        onMouseDown={stopEditorEvent}
        onPointerDown={stopEditorEvent}
        size="icon"
        title={t('preview.imageExpand')}
        type="button"
        variant="secondary"
      >
        <Maximize2 />
      </Button>
      <DiagramPreviewDialog
        labels={{
          resetZoom: t('preview.visualResetZoom'),
          title: dialogTitle,
          zoomIn: t('preview.visualZoomIn'),
          zoomLevel: t('preview.visualZoomLevel'),
          zoomOut: t('preview.visualZoomOut'),
        }}
        onOpenChange={(open) =>
          setInteraction((current) =>
            current.key === key ? { ...current, expanded: open } : current,
          )
        }
        open={currentInteraction.expanded}
        returnFocusRef={expandButtonRef}
        visual={{
          alt,
          kind: 'image',
          naturalHeight: currentInteraction.naturalSize?.height,
          naturalWidth: currentInteraction.naturalSize?.width,
          src: current.url,
        }}
      />
    </div>
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
          if (!event.ctrlKey && !event.metaKey) return
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
