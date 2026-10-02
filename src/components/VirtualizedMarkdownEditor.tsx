import {
  defaultRangeExtractor,
  useVirtualizer,
  type Range,
  type VirtualItem,
} from '@tanstack/react-virtual'
import {
  forwardRef,
  useCallback,
  useImperativeHandle,
  useLayoutEffect,
  useRef,
  useState,
} from 'react'
import MarkdownEditorSurface from '@/components/MarkdownEditorSurface'
import { VirtualizedMarkdownReadonlySurface } from '@/components/VirtualizedMarkdownReadonlySurface'
import type {
  MarkdownEditorHandle,
  MarkdownEditorProps,
} from '@/components/milkdown/markdownEditorTypes'
import {
  createVirtualizedMarkdownDocument,
  updateVirtualizedMarkdownSegment,
  type VirtualizedMarkdownSegment,
} from '@/components/milkdown/virtualizedMarkdownDocument'

type SegmentEditorProps = MarkdownEditorProps & {
  active: boolean
  index: number
  isFirst: boolean
  isLast: boolean
  onActivate: (index: number, segmentId: string) => void
  segment: VirtualizedMarkdownSegment
  setHandle: (segmentId: string, handle: MarkdownEditorHandle | null) => void
}

const VirtualizedSegmentEditor = ({
  active,
  index,
  isFirst,
  isLast,
  onActivate,
  segment,
  setHandle,
  ...editorProps
}: SegmentEditorProps) => {
  const setEditorHandle = useCallback(
    (handle: MarkdownEditorHandle | null) => {
      setHandle(segment.id, handle)
    },
    [segment.id, setHandle],
  )

  return (
    <div
      className="virtualized-markdown-segment"
      data-first-segment={isFirst ? 'true' : undefined}
      data-last-segment={isLast ? 'true' : undefined}
      onFocusCapture={() => onActivate(index, segment.id)}
    >
      {active ? (
        <MarkdownEditorSurface {...editorProps} value={segment.markdown} ref={setEditorHandle} />
      ) : (
        <VirtualizedMarkdownReadonlySurface
          activationLabel={editorProps.placeholder}
          cacheKey={segment}
          markdown={segment.markdown}
          onActivate={() => onActivate(index, segment.id)}
        />
      )}
    </div>
  )
}

const virtualItemStyle = () => ({
  left: 0,
  position: 'absolute' as const,
  top: 0,
  width: '100%',
})

const initialVirtualItems = (segments: readonly VirtualizedMarkdownSegment[]): VirtualItem[] => {
  const items: VirtualItem[] = []
  let start = 0
  for (let index = 0; index < Math.min(segments.length, 3); index += 1) {
    const segment = segments[index]
    if (!segment) break
    const size = segment.estimatedHeight
    items.push({ end: start + size, index, key: segment.id, lane: 0, size, start })
    start += size
  }
  return items
}

const VirtualizedMarkdownEditor = forwardRef<MarkdownEditorHandle, MarkdownEditorProps>(
  (props, ref) => {
    const { onChange } = props
    const [document, setDocument] = useState(() => createVirtualizedMarkdownDocument(props.value))
    const [activeIndex, setActiveIndex] = useState(0)
    const scrollRef = useRef<HTMLDivElement | null>(null)
    const documentRef = useRef(document)
    const editorHandlesRef = useRef(new Map<string, MarkdownEditorHandle>())
    const lastEmittedValueRef = useRef<string | null>(null)
    const documentPathRef = useRef(props.activePath)
    const pendingFocusSegmentRef = useRef<string | null>(null)

    useLayoutEffect(() => {
      if (
        props.activePath === documentPathRef.current &&
        props.value === lastEmittedValueRef.current
      ) {
        lastEmittedValueRef.current = null
        return
      }
      const currentValue = documentRef.current.toMarkdown()
      if (props.activePath === documentPathRef.current && props.value === currentValue) return
      const nextDocument = createVirtualizedMarkdownDocument(props.value)
      documentPathRef.current = props.activePath
      documentRef.current = nextDocument
      lastEmittedValueRef.current = null
      editorHandlesRef.current.clear()
      pendingFocusSegmentRef.current = null
      setActiveIndex(0)
      setDocument(nextDocument)
    }, [props.activePath, props.value])

    const setHandle = useCallback((segmentId: string, handle: MarkdownEditorHandle | null) => {
      if (!handle) {
        editorHandlesRef.current.delete(segmentId)
        return
      }
      editorHandlesRef.current.set(segmentId, handle)
      if (pendingFocusSegmentRef.current !== segmentId) return
      pendingFocusSegmentRef.current = null
      queueMicrotask(() => handle.focus())
    }, [])

    const commitSegment = useCallback(
      (segmentId: string, markdown: string) => {
        const nextDocument = updateVirtualizedMarkdownSegment(
          documentRef.current,
          segmentId,
          markdown,
        )
        if (nextDocument === documentRef.current) return
        documentRef.current = nextDocument
        setDocument(nextDocument)
        const nextValue = nextDocument.toMarkdown()
        lastEmittedValueRef.current = nextValue
        onChange(nextValue)
      },
      [onChange],
    )

    const activateSegment = useCallback(
      (index: number, segmentId: string) => {
        if (index === activeIndex) return
        const activeSegment = documentRef.current.segments[activeIndex]
        const activeHandle = activeSegment
          ? editorHandlesRef.current.get(activeSegment.id)
          : undefined
        if (activeSegment && activeHandle) {
          commitSegment(activeSegment.id, activeHandle.getMarkdown())
        }
        pendingFocusSegmentRef.current = segmentId
        setActiveIndex(index)
      },
      [activeIndex, commitSegment],
    )

    const rangeExtractor = useCallback(
      (range: Range) => {
        const indexes = defaultRangeExtractor(range)
        return indexes.includes(activeIndex)
          ? indexes
          : [...indexes, activeIndex].sort((a, b) => a - b)
      },
      [activeIndex],
    )

    // TanStack Virtual owns imperative measurement state locally; it never enters shared app state.
    // eslint-disable-next-line react-hooks/incompatible-library -- The virtualizer remains local and is not passed to memoized children.
    const virtualizer = useVirtualizer({
      count: document.segments.length,
      directDomUpdates: true,
      estimateSize: (index) => document.segments[index]?.estimatedHeight ?? 400,
      getItemKey: (index) => document.segments[index]?.id ?? index,
      getScrollElement: () => scrollRef.current,
      initialRect: { height: 900, width: 900 },
      overscan: 2,
      rangeExtractor,
      useFlushSync: false,
    })

    useImperativeHandle(ref, () => ({
      focus: () => {
        const active = documentRef.current.segments[activeIndex]
        const handle = active ? editorHandlesRef.current.get(active.id) : undefined
        ;(handle ?? editorHandlesRef.current.values().next().value)?.focus()
      },
      getMarkdown: () => {
        let current = documentRef.current
        for (const [segmentId, handle] of editorHandlesRef.current) {
          current = updateVirtualizedMarkdownSegment(current, segmentId, handle.getMarkdown())
        }
        documentRef.current = current
        return current.toMarkdown()
      },
    }))

    const measuredItems = virtualizer.getVirtualItems()
    const virtualItems =
      measuredItems.length > 0 ? measuredItems : initialVirtualItems(document.segments)

    return (
      <div className="virtualized-markdown-editor h-full overflow-y-auto" ref={scrollRef}>
        <div className="relative w-full" ref={virtualizer.containerRef}>
          {virtualItems.map((item) => {
            const segment = document.segments[item.index]
            if (!segment) return null
            return (
              <div
                data-index={item.index}
                key={segment.id}
                ref={virtualizer.measureElement}
                style={virtualItemStyle()}
              >
                <VirtualizedSegmentEditor
                  {...props}
                  active={item.index === activeIndex}
                  index={item.index}
                  isFirst={item.index === 0}
                  isLast={item.index === document.segments.length - 1}
                  onActivate={activateSegment}
                  onChange={(markdown) => commitSegment(segment.id, markdown)}
                  segment={segment}
                  setHandle={setHandle}
                />
              </div>
            )
          })}
        </div>
      </div>
    )
  },
)

export default VirtualizedMarkdownEditor
