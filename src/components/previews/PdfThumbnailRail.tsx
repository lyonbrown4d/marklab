import { useRef } from 'react'
import { useVirtualizer } from '@tanstack/react-virtual'
import { Page } from 'react-pdf'

type PdfThumbnailRailProps = {
  activePage: number
  label: string
  pageCount: number
  onSelectPage: (page: number) => void
}

const THUMBNAIL_ROW_HEIGHT = 156

export const PdfThumbnailRail = ({
  activePage,
  label,
  pageCount,
  onSelectPage,
}: PdfThumbnailRailProps) => {
  const viewportRef = useRef<HTMLElement | null>(null)
  // TanStack Virtual exposes imperative helpers that React Compiler cannot memoize safely.
  // eslint-disable-next-line react-hooks/incompatible-library
  const virtualizer = useVirtualizer({
    count: pageCount,
    estimateSize: () => THUMBNAIL_ROW_HEIGHT,
    getScrollElement: () => viewportRef.current,
    initialRect: { height: 620, width: 120 },
    overscan: 2,
  })

  return (
    <nav ref={viewportRef} className="marklab-pdf-viewer__thumbs" aria-label={label}>
      <div
        className="marklab-pdf-viewer__thumb-track"
        style={{ height: virtualizer.getTotalSize() }}
      >
        {virtualizer.getVirtualItems().map((virtualItem) => {
          const page = virtualItem.index + 1
          return (
            <button
              key={virtualItem.key}
              ref={virtualizer.measureElement}
              className="marklab-pdf-viewer__thumb"
              data-active={page === activePage}
              data-index={virtualItem.index}
              onClick={() => onSelectPage(page)}
              style={{
                transform: `translateY(${virtualItem.start}px)`,
              }}
              type="button"
            >
              <Page
                pageNumber={page}
                renderAnnotationLayer={false}
                renderTextLayer={false}
                width={92}
              />
              <span>{page}</span>
            </button>
          )
        })}
      </div>
    </nav>
  )
}
