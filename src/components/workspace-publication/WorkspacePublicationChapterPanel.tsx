import { useCallback, useMemo, useRef } from 'react'
import { CheckCircle2, ChevronDown, ChevronRight, GripVertical, Search } from 'lucide-react'
import { useDrag, useDrop } from 'react-dnd'
import { cn } from 'cn'
import { Button } from '@/components/ui/button'
import { Checkbox } from '@/components/ui/checkbox'
import { Input } from '@/components/ui/input'
import { ScrollArea } from '@/components/ui/scroll-area'
import { useI18n } from '@/i18n/useI18n'
import type { PublicationChapterSelection } from '@/components/workspace-publication/workspacePublicationModel'

type ChapterPanelProps = {
  chapters: PublicationChapterSelection[]
  onMove: (sourcePath: string, targetPath: string) => void
  onMoveBy: (path: string, offset: number) => void
  onQueryChange: (value: string) => void
  onSelect: (path: string) => void
  onToggle: (path: string, included: boolean) => void
  onToggleAll: (included: boolean) => void
  orphanCount: number
  query: string
  selectedPath: string | null
}

export const WorkspacePublicationChapterPanel = ({
  chapters,
  onMove,
  onMoveBy,
  onQueryChange,
  onSelect,
  onToggle,
  onToggleAll,
  orphanCount,
  query,
  selectedPath,
}: ChapterPanelProps) => {
  const { t } = useI18n()
  const filtered = useMemo(() => {
    const normalized = query.trim().toLocaleLowerCase()
    if (!normalized) return chapters
    return chapters.filter((chapter) =>
      `${chapter.title} ${chapter.path}`.toLocaleLowerCase().includes(normalized),
    )
  }, [chapters, query])
  const includedCount = chapters.filter((chapter) => chapter.included).length
  const allIncluded = includedCount === chapters.length && chapters.length > 0

  return (
    <aside className="flex min-h-0 flex-col border-r bg-muted/15">
      <div className="space-y-3 border-b px-4 py-4">
        <div className="flex items-center justify-between gap-3">
          <h2 className="text-sm font-semibold">{t('workspaceExport.chapters')}</h2>
          <span className="text-[11px] tabular-nums text-muted-foreground">
            {t('workspaceExport.selected', { selected: includedCount, total: chapters.length })}
          </span>
        </div>
        <div className="relative">
          <Search className="pointer-events-none absolute left-2.5 top-1/2 size-3.5 -translate-y-1/2 text-muted-foreground" />
          <Input
            aria-label={t('workspaceExport.search')}
            className="h-8 pl-8 text-xs"
            onChange={(event) => onQueryChange(event.target.value)}
            placeholder={t('workspaceExport.search')}
            value={query}
          />
        </div>
        <Button
          className="h-7 w-full justify-start px-2 text-xs"
          onClick={() => onToggleAll(!allIncluded)}
          type="button"
          variant="ghost"
        >
          <Checkbox checked={allIncluded} tabIndex={-1} />
          {allIncluded ? t('workspaceExport.excludeAll') : t('workspaceExport.includeAll')}
        </Button>
      </div>
      <ScrollArea className="min-h-0 flex-1">
        <div className="space-y-0.5 p-2">
          {filtered.map((chapter, index) => (
            <DraggableChapter
              chapter={chapter}
              first={index === 0}
              key={chapter.path}
              last={index === filtered.length - 1}
              position={chapters.findIndex((candidate) => candidate.path === chapter.path)}
              selected={chapter.path === selectedPath}
              onMove={onMove}
              onMoveBy={onMoveBy}
              onSelect={onSelect}
              onToggle={onToggle}
            />
          ))}
        </div>
      </ScrollArea>
      <div className="border-t px-4 py-3">
        <div className="flex items-center gap-2 text-xs font-medium text-emerald-600 dark:text-emerald-400">
          <CheckCircle2 className="size-4" />
          {t('workspaceExport.linkAnalysisComplete')}
        </div>
        {orphanCount > 0 ? (
          <p className="mt-1 text-[11px] leading-4 text-muted-foreground">
            {t('workspaceExport.unlinkedNotice', { count: orphanCount })}
          </p>
        ) : null}
      </div>
    </aside>
  )
}

type DraggableChapterProps = {
  chapter: PublicationChapterSelection
  first: boolean
  last: boolean
  onMove: ChapterPanelProps['onMove']
  onMoveBy: ChapterPanelProps['onMoveBy']
  onSelect: ChapterPanelProps['onSelect']
  onToggle: ChapterPanelProps['onToggle']
  position: number
  selected: boolean
}

const DraggableChapter = ({
  chapter,
  first,
  last,
  onMove,
  onMoveBy,
  onSelect,
  onToggle,
  position,
  selected,
}: DraggableChapterProps) => {
  const { t } = useI18n()
  const rowRef = useRef<HTMLDivElement | null>(null)
  const handleRef = useRef<HTMLButtonElement | null>(null)
  const [{ isDragging }, drag] = useDrag(
    () => ({
      collect: (monitor) => ({ isDragging: monitor.isDragging() }),
      item: { index: position, path: chapter.path },
      type: 'workspace-publication-chapter',
    }),
    [chapter.path, position],
  )
  const [, drop] = useDrop(
    () => ({
      accept: 'workspace-publication-chapter',
      hover: (item: { index: number; path: string }) => {
        if (item.index === position) return
        onMove(item.path, chapter.path)
        item.index = position
      },
    }),
    [chapter.path, onMove, position],
  )
  const setRowRef = useCallback(
    (node: HTMLDivElement | null) => {
      rowRef.current = node
      drop(node)
    },
    [drop],
  )
  const setHandleRef = useCallback(
    (node: HTMLButtonElement | null) => {
      handleRef.current = node
      drag(node)
    },
    [drag],
  )

  return (
    <div
      className={cn(
        'group flex h-9 items-center gap-1 rounded-md pr-1 text-xs transition-colors',
        selected ? 'bg-primary/12 text-foreground' : 'hover:bg-accent/70',
        !chapter.included && 'opacity-55',
        isDragging && 'opacity-30',
        depthPadding(chapter.depth),
      )}
      onClick={() => onSelect(chapter.path)}
      ref={setRowRef}
    >
      <button
        aria-label={t('workspaceExport.move', { title: chapter.title })}
        className="flex size-6 shrink-0 cursor-grab items-center justify-center rounded text-muted-foreground opacity-55 outline-none hover:bg-accent focus-visible:ring-2 focus-visible:ring-ring active:cursor-grabbing"
        ref={setHandleRef}
        type="button"
      >
        <GripVertical className="size-3.5" />
      </button>
      {chapter.depth === 0 ? (
        <ChevronDown className="size-3 shrink-0 text-muted-foreground" />
      ) : (
        <ChevronRight className="size-3 shrink-0 text-muted-foreground/60" />
      )}
      <Checkbox
        aria-label={chapter.title}
        checked={chapter.included}
        onCheckedChange={(checked) => onToggle(chapter.path, checked === true)}
        onClick={(event) => event.stopPropagation()}
      />
      <span className="ml-1 min-w-0 flex-1 truncate" title={chapter.path}>
        {chapter.title}
      </span>
      <button
        aria-label={t('workspaceExport.moveUp')}
        className="sr-only focus:not-sr-only"
        disabled={first}
        onClick={(event) => {
          event.stopPropagation()
          onMoveBy(chapter.path, -1)
        }}
        type="button"
      >
        {t('workspaceExport.moveUp')}
      </button>
      <button
        aria-label={t('workspaceExport.moveDown')}
        className="sr-only focus:not-sr-only"
        disabled={last}
        onClick={(event) => {
          event.stopPropagation()
          onMoveBy(chapter.path, 1)
        }}
        type="button"
      >
        {t('workspaceExport.moveDown')}
      </button>
    </div>
  )
}

const depthPadding = (depth: number): string => {
  if (depth >= 2) return 'pl-8'
  if (depth === 1) return 'pl-4'
  return 'pl-1'
}
