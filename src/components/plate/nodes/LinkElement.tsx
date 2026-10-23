import { useLink } from '@platejs/link/react'
import type { TLinkElement } from 'platejs'
import { PlateElement, useEditorRef, type PlateElementProps } from 'platejs/react'
import type { MouseEvent } from 'react'
import { normalizeHeadingAnchor, splitLinkTarget } from '@/logic/paths'
import { focusPlateHeading } from '@/components/plate/plateHeadingNavigation'
import {
  isLocalEmbeddedPreviewTarget,
  platePreviewKindForTarget,
  safeExternalLinkUrl,
} from '@/components/plate/nodes/previewAdapters'
import { usePlateLinkPreviewPortal } from '@/components/plate/nodes/usePlateLinkPreviewPortal'

export type PlatePreviewOptions = {
  getDocumentPath?: () => string | null
  onWorkspaceLink?: (target: string, documentPath: string | null) => void
}

const elementText = (node: unknown): string => {
  if (!node || typeof node !== 'object') return ''
  if ('text' in node && typeof node.text === 'string') return node.text
  if (!('children' in node) || !Array.isArray(node.children)) return ''
  return node.children.map(elementText).join('')
}

const LINK_SCHEME = /^[a-z][a-z\d+.-]*:/i
const isWorkspaceLinkTarget = (target: string): boolean =>
  Boolean(target) && !target.startsWith('//') && !LINK_SCHEME.test(target)

export const createLinkElement = ({
  getDocumentPath,
  onWorkspaceLink,
}: PlatePreviewOptions = {}) => {
  const PlateLinkElement = (props: PlateElementProps<TLinkElement>) => {
    const editor = useEditorRef()
    const { props: linkProps } = useLink({ element: props.element })
    const target = props.element.url?.trim() ?? ''
    const documentPath = getDocumentPath?.() ?? null
    const previewKind = platePreviewKindForTarget(target)
    const localPreview = Boolean(previewKind && isLocalEmbeddedPreviewTarget(target))
    const externalHref = safeExternalLinkUrl(target)
      ? safeExternalLinkUrl(linkProps.href ?? target)
      : undefined
    const workspaceTarget = isWorkspaceLinkTarget(target)
    const title = elementText(props.element).trim() || target
    const { anchorRef, preview } = usePlateLinkPreviewPortal({
      documentPath,
      externalUrl: externalHref,
      target,
      title,
    })
    const handleClick = workspaceTarget
      ? (event: MouseEvent<HTMLAnchorElement>) => {
          // Local fragments must never replace the application's HashRouter URL.
          event.preventDefault()
          if (!event.ctrlKey && !event.metaKey) return
          if (target.startsWith('#')) {
            const slug = normalizeHeadingAnchor(splitLinkTarget(target).anchor ?? '')
            if (slug) focusPlateHeading(editor, slug)
          } else {
            onWorkspaceLink?.(target, documentPath)
          }
        }
      : undefined
    const attributes = {
      ...props.attributes,
      ...linkProps,
      href: externalHref,
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
