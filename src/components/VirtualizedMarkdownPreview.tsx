import MarkdownIt from 'markdown-it'
import { memo, type KeyboardEvent } from 'react'
import { createVirtualizedMarkdownPreviewCache } from '@/components/virtualizedMarkdownPreviewCache'

type VirtualizedMarkdownPreviewProps = {
  activationLabel: string
  cacheKey: object
  markdown: string
  onActivate: () => void
}

const markdownRenderer = new MarkdownIt({
  breaks: false,
  html: false,
  linkify: true,
  typographer: false,
})
const markdownPreviewCache = createVirtualizedMarkdownPreviewCache((markdown) =>
  markdownRenderer.render(markdown),
)

export const VirtualizedMarkdownPreview = memo(
  ({ activationLabel, cacheKey, markdown, onActivate }: VirtualizedMarkdownPreviewProps) => {
    const html = markdownPreviewCache.render(cacheKey, markdown)

    const handleKeyDown = (event: KeyboardEvent<HTMLDivElement>) => {
      if (event.key !== 'Enter' && event.key !== ' ') return
      event.preventDefault()
      onActivate()
    }

    return (
      <div
        aria-label={activationLabel}
        className="crepe crepe-playground virtualized-markdown-preview"
        data-testid="virtual-markdown-segment-preview"
        onKeyDown={handleKeyDown}
        onPointerDown={onActivate}
        role="button"
        tabIndex={0}
      >
        <div className="milkdown">
          <div className="ProseMirror" dangerouslySetInnerHTML={{ __html: html }} />
        </div>
      </div>
    )
  },
)

VirtualizedMarkdownPreview.displayName = 'VirtualizedMarkdownPreview'
