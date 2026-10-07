import { type KeyboardEvent, type ReactNode } from 'react'
import { ChevronRight, FileText } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from '@/components/ui/collapsible'
import { cn } from '@/lib/utils'
import type {
  SearchHighlight,
  WorkspaceSearchGroup,
  WorkspaceSearchMatch,
} from '@/components/sidebar-search/searchModel'

type SearchResultGroupsProps = {
  collapsedPaths: ReadonlySet<string>
  groups: WorkspaceSearchGroup[]
  lineLabel: (line: number) => string
  matchesLabel: (count: number) => string
  noSnippetLabel: string
  onKeyDown: (key: string) => boolean
  onOpen: (match: WorkspaceSearchMatch) => void
  onSelect: (id: string) => void
  onToggleGroup: (path: string) => void
  selectedId: string | null
}

const HighlightText = ({ text, ranges }: { text: string; ranges: SearchHighlight[] }) => {
  if (!text || ranges.length === 0) return <>{text}</>
  const parts: ReactNode[] = []
  let cursor = 0
  ranges.forEach((range, index) => {
    const start = Math.max(cursor, Math.min(range.start, text.length))
    const end = Math.max(start, Math.min(range.end, text.length))
    if (start > cursor) parts.push(<span key={`text-${index}`}>{text.slice(cursor, start)}</span>)
    if (end > start) {
      parts.push(
        <mark
          key={`mark-${index}`}
          className="rounded-sm bg-amber-300/55 px-0.5 text-foreground dark:bg-amber-400/25"
        >
          {text.slice(start, end)}
        </mark>,
      )
    }
    cursor = end
  })
  if (cursor < text.length) parts.push(<span key="tail">{text.slice(cursor)}</span>)
  return <>{parts}</>
}

const fileName = (path: string): string => path.split(/[\\/]/).at(-1) ?? path

const parentPath = (path: string): string => {
  const parts = path.split(/[\\/]/)
  return parts.length > 1 ? parts.slice(0, -1).join('/') : ''
}

const SearchResultRow = ({
  match,
  lineLabel,
  noSnippetLabel,
  onKeyDown,
  onOpen,
  onSelect,
  selected,
}: {
  match: WorkspaceSearchMatch
  lineLabel: (line: number) => string
  noSnippetLabel: string
  onKeyDown: (key: string) => boolean
  onOpen: () => void
  onSelect: () => void
  selected: boolean
}) => {
  const { result } = match
  const label = `${fileName(result.path)}, ${lineLabel(result.line)}: ${result.snippet || noSnippetLabel}`
  const handleKeyDown = (event: KeyboardEvent<HTMLButtonElement>) => {
    if (onKeyDown(event.key)) event.preventDefault()
  }
  return (
    <Button
      aria-current={selected ? 'true' : undefined}
      aria-label={label}
      data-search-result-id={match.id}
      onClick={onOpen}
      onFocus={onSelect}
      onKeyDown={handleKeyDown}
      onMouseMove={onSelect}
      size="sm"
      type="button"
      variant="ghost"
      className={cn(
        'h-auto min-h-11 w-full items-start justify-start gap-2 rounded-md px-1.5 py-1.5 text-left',
        'hover:bg-sidebar-accent/70 focus-visible:ring-1 focus-visible:ring-sidebar-ring',
        selected && 'bg-sidebar-accent text-sidebar-accent-foreground',
      )}
    >
      <span className="w-7 shrink-0 pt-0.5 text-right font-mono text-[10px] tabular-nums text-muted-foreground">
        {result.line}
      </span>
      <span className="min-w-0 flex-1">
        <span className="block truncate text-[11px] leading-4 text-foreground/90">
          <HighlightText text={result.snippet || noSnippetLabel} ranges={match.highlights} />
        </span>
        <span className="block truncate text-[10px] text-muted-foreground">
          {result.path}:{result.line}
        </span>
      </span>
    </Button>
  )
}

const SearchResultGroup = ({
  collapsed,
  group,
  ...props
}: Omit<SearchResultGroupsProps, 'collapsedPaths' | 'groups'> & {
  collapsed: boolean
  group: WorkspaceSearchGroup
}) => (
  <Collapsible open={!collapsed} onOpenChange={() => props.onToggleGroup(group.path)}>
    <CollapsibleTrigger asChild>
      <Button
        type="button"
        variant="ghost"
        className="group h-auto min-h-10 w-full justify-start gap-1.5 rounded-md px-1.5 py-1 text-left"
        aria-label={`${fileName(group.path)}, ${props.matchesLabel(group.matchCount)}`}
      >
        <ChevronRight className="size-3.5 text-muted-foreground transition-transform group-data-[state=open]:rotate-90" />
        <FileText className="size-3.5 text-muted-foreground" />
        <span className="min-w-0 flex-1">
          <span className="block truncate text-xs font-medium">{fileName(group.path)}</span>
          {parentPath(group.path) ? (
            <span className="block truncate text-[10px] font-normal text-muted-foreground">
              {parentPath(group.path)}
            </span>
          ) : null}
        </span>
        <span className="text-[10px] tabular-nums text-muted-foreground">{group.matchCount}</span>
      </Button>
    </CollapsibleTrigger>
    <CollapsibleContent className="space-y-0.5 pb-1 pl-1">
      {group.matches.map((match) => (
        <SearchResultRow
          key={match.id}
          match={match}
          lineLabel={props.lineLabel}
          noSnippetLabel={props.noSnippetLabel}
          onKeyDown={props.onKeyDown}
          onOpen={() => props.onOpen(match)}
          onSelect={() => props.onSelect(match.id)}
          selected={match.id === props.selectedId}
        />
      ))}
    </CollapsibleContent>
  </Collapsible>
)

const SearchResultGroups = ({ collapsedPaths, groups, ...props }: SearchResultGroupsProps) => (
  <div className="space-y-0.5 pb-2">
    {groups.map((group) => (
      <SearchResultGroup
        key={group.path}
        {...props}
        collapsed={collapsedPaths.has(group.path)}
        group={group}
      />
    ))}
  </div>
)

export default SearchResultGroups
