import { EditorState } from '@milkdown/kit/prose/state'
import { EditorView } from '@milkdown/kit/prose/view'
import { memo, useEffect, useRef, type KeyboardEvent } from 'react'
import { parseReadonlyMarkdown } from '@/components/milkdown/readonlyMarkdownParser'
import { createVirtualizedMarkdownReadonlyCache } from '@/components/virtualizedMarkdownReadonlyCache'

type VirtualizedMarkdownReadonlySurfaceProps = {
  activationLabel: string
  cacheKey: object
  markdown: string
  onActivate: () => void
}

const markdownDocumentCache = createVirtualizedMarkdownReadonlyCache(parseReadonlyMarkdown)

export const VirtualizedMarkdownReadonlySurface = memo(
  ({
    activationLabel,
    cacheKey,
    markdown,
    onActivate,
  }: VirtualizedMarkdownReadonlySurfaceProps) => {
    const editorRootRef = useRef<HTMLDivElement | null>(null)

    useEffect(() => {
      const editorRoot = editorRootRef.current
      if (!editorRoot) return

      let disposed = false
      let editorView: EditorView | null = null
      editorRoot.dataset.state = 'loading'

      void markdownDocumentCache
        .parse(cacheKey, markdown)
        .then((document) => {
          if (disposed) return
          editorView = new EditorView(editorRoot, {
            attributes: {
              'aria-readonly': 'true',
              'data-marklab-readonly': 'true',
            },
            dispatchTransaction: () => undefined,
            editable: () => false,
            state: EditorState.create({ doc: document }),
          })
          editorRoot.dataset.state = 'ready'
        })
        .catch((error: unknown) => {
          if (disposed) return
          editorRoot.dataset.state = 'error'
          editorRoot.textContent = error instanceof Error ? error.message : String(error)
        })

      return () => {
        disposed = true
        editorView?.destroy()
        editorRoot.replaceChildren()
      }
    }, [cacheKey, markdown])

    const handleKeyDown = (event: KeyboardEvent<HTMLDivElement>) => {
      if (event.key !== 'Enter' && event.key !== ' ') return
      event.preventDefault()
      onActivate()
    }

    return (
      <div
        aria-label={activationLabel}
        className="crepe crepe-playground virtualized-markdown-readonly"
        data-testid="virtual-markdown-segment-readonly"
        onKeyDown={handleKeyDown}
        onPointerDown={onActivate}
        role="button"
        tabIndex={0}
      >
        <div className="milkdown" ref={editorRootRef} />
      </div>
    )
  },
)

VirtualizedMarkdownReadonlySurface.displayName = 'VirtualizedMarkdownReadonlySurface'
