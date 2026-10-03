import { useMemo, useRef } from 'react'
import { useVirtualizer } from '@tanstack/react-virtual'
import { diffLines, type Change } from 'diff'
import { cn } from '@/lib/utils'

type DiffCell = { line: number | null; text: string; tone: 'added' | 'removed' | 'same' }
export type LocalHistoryDiffRow = { left: DiffCell; right: DiffCell }

type DiffSegment = {
  leftLines: string[]
  leftStart: number
  leftTone: DiffCell['tone']
  rightLines: string[]
  rightStart: number
  rightTone: DiffCell['tone']
  rowCount: number
  rowStart: number
}

export type LocalHistoryDiffModel = {
  rowCount: number
  rowAt: (index: number) => LocalHistoryDiffRow | undefined
  segmentCount: number
}

const linesOf = (change: Change) => {
  const lines = change.value.split('\n')
  if (lines.at(-1) === '') lines.pop()
  return lines
}

export const createLocalHistoryDiffModel = (
  original: string,
  modified: string,
): LocalHistoryDiffModel => {
  const changes = diffLines(original, modified)
  const segments: DiffSegment[] = []
  let leftLine = 1
  let rightLine = 1
  let rowCount = 0

  const addSegment = (
    leftLines: string[],
    rightLines: string[],
    leftTone: DiffCell['tone'],
    rightTone: DiffCell['tone'],
  ) => {
    const count = Math.max(leftLines.length, rightLines.length)
    segments.push({
      leftLines,
      leftStart: leftLine,
      leftTone,
      rightLines,
      rightStart: rightLine,
      rightTone,
      rowCount: count,
      rowStart: rowCount,
    })
    leftLine += leftLines.length
    rightLine += rightLines.length
    rowCount += count
  }

  for (let index = 0; index < changes.length; index += 1) {
    const change = changes[index]
    if (!change) continue
    if (change.removed) {
      const removed = linesOf(change)
      const addedChange = changes[index + 1]?.added ? changes[index + 1] : null
      const added = addedChange ? linesOf(addedChange) : []
      addSegment(removed, added, 'removed', 'added')
      if (addedChange) index += 1
      continue
    }

    const lines = linesOf(change)
    if (change.added) addSegment([], lines, 'same', 'added')
    else addSegment(lines, lines, 'same', 'same')
  }

  const rowAt = (index: number) => {
    if (index < 0 || index >= rowCount) return
    let low = 0
    let high = segments.length - 1
    while (low <= high) {
      const middle = Math.floor((low + high) / 2)
      const segment = segments[middle]
      if (!segment) return
      if (index < segment.rowStart) high = middle - 1
      else if (index >= segment.rowStart + segment.rowCount) low = middle + 1
      else {
        const offset = index - segment.rowStart
        const leftText = segment.leftLines[offset]
        const rightText = segment.rightLines[offset]
        return {
          left: {
            line: leftText === undefined ? null : segment.leftStart + offset,
            text: leftText ?? '',
            tone: segment.leftTone,
          },
          right: {
            line: rightText === undefined ? null : segment.rightStart + offset,
            text: rightText ?? '',
            tone: segment.rightTone,
          },
        }
      }
    }
  }

  return { rowAt, rowCount, segmentCount: segments.length }
}

export const createLocalHistoryDiffRows = (original: string, modified: string) => {
  const model = createLocalHistoryDiffModel(original, modified)
  return Array.from({ length: model.rowCount }, (_, index) => model.rowAt(index)!)
}

const DiffCellView = ({ cell }: { cell: DiffCell }) => (
  <div
    className={cn(
      'grid min-w-0 grid-cols-[3rem_minmax(0,1fr)] border-r border-border/50 font-mono text-[12px] leading-5',
      cell.tone === 'added' && 'bg-emerald-500/10',
      cell.tone === 'removed' && 'bg-destructive/10',
    )}
  >
    <span className="select-none border-r border-border/40 px-2 text-right text-muted-foreground/70">
      {cell.line ?? ''}
    </span>
    <span className="truncate px-2 whitespace-pre" title={cell.text}>
      {cell.text || '\u00a0'}
    </span>
  </div>
)

export const LocalHistoryLargeDiff = ({
  modified,
  original,
}: {
  modified: string
  original: string
}) => {
  const scrollRef = useRef<HTMLDivElement | null>(null)
  const model = useMemo(() => createLocalHistoryDiffModel(original, modified), [modified, original])
  // TanStack Virtual is intentionally scoped to this large-document surface.
  // eslint-disable-next-line react-hooks/incompatible-library
  const virtualizer = useVirtualizer({
    count: model.rowCount,
    estimateSize: () => 20,
    getScrollElement: () => scrollRef.current,
    initialRect: { height: 640, width: 1000 },
    overscan: 16,
  })

  return (
    <div className="h-full overflow-auto" data-testid="history-large-diff" ref={scrollRef}>
      <div className="relative" style={{ height: virtualizer.getTotalSize() }}>
        {virtualizer.getVirtualItems().map((item) => {
          const row = model.rowAt(item.index)
          if (!row) return null
          return (
            <div
              className="absolute inset-x-0 top-0 grid grid-cols-2"
              key={item.key}
              style={{ height: item.size, transform: `translateY(${item.start}px)` }}
            >
              <DiffCellView cell={row.left} />
              <DiffCellView cell={row.right} />
            </div>
          )
        })}
      </div>
    </div>
  )
}
