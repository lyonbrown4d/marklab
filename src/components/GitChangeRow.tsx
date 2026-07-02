import { useId } from 'react'
import { FileDiff } from 'lucide-react'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import type { GitDiffRequest, GitFileChange } from '@/services/gitApi'

type GitChangeRowProps = {
  change: GitFileChange
  section: GitDiffRequest['section']
  onOpenDiff: (request: GitDiffRequest) => void
  diffLabel: string
  renamedFromLabel: string
}

const statusLabels: Record<GitFileChange['status'], string> = {
  added: 'A',
  modified: 'M',
  deleted: 'D',
  renamed: 'R',
  copied: 'C',
  conflicted: '!',
  untracked: 'U',
  ignored: 'I',
  tracked: 'T',
  pruned: '-',
}

const statusDescriptions: Record<GitFileChange['status'], string> = {
  added: 'Added',
  modified: 'Modified',
  deleted: 'Deleted',
  renamed: 'Renamed',
  copied: 'Copied',
  conflicted: 'Conflicted',
  untracked: 'Untracked',
  ignored: 'Ignored',
  tracked: 'Tracked',
  pruned: 'Pruned',
}

export const GitChangeRow = ({
  change,
  section,
  onOpenDiff,
  diffLabel,
  renamedFromLabel,
}: GitChangeRowProps) => {
  const detailId = useId()
  const statusDescription = statusDescriptions[change.status]
  const rowLabel = `${diffLabel}: ${change.path} (${statusDescription})`
  const detail = change.old_path
    ? `${renamedFromLabel}: ${change.old_path}`
    : change.detail || statusDescription

  const openDiff = () => {
    onOpenDiff({ path: change.path, status: change.status, section })
  }

  return (
    <div className="flex min-w-0 items-center gap-1 rounded-md border border-transparent px-1 py-1 text-xs transition-colors hover:border-sidebar-border/70 hover:bg-sidebar-accent/70 focus-within:border-ring focus-within:bg-sidebar-accent/70 focus-within:ring-1 focus-within:ring-ring/30">
      <button
        type="button"
        aria-describedby={detailId}
        aria-label={rowLabel}
        title={rowLabel}
        className="flex min-w-0 flex-1 items-center gap-2 rounded px-1 text-left text-sidebar-foreground/90 outline-none transition-colors hover:text-sidebar-foreground focus-visible:text-sidebar-foreground"
        onClick={openDiff}
      >
        <Badge
          variant="secondary"
          className="h-4 min-w-4 rounded px-1 text-[10px]"
          title={statusDescription}
        >
          <span aria-hidden="true">{statusLabels[change.status]}</span>
          <span className="sr-only">{statusDescription}</span>
        </Badge>
        <span className="min-w-0 flex-1">
          <span className="block truncate">{change.path}</span>
          <span id={detailId} className="block truncate text-[11px] text-muted-foreground">
            {detail}
          </span>
        </span>
      </button>
      <Button
        type="button"
        variant="ghost"
        size="icon"
        className="size-6 shrink-0 rounded"
        aria-label={`${diffLabel}: ${change.path}`}
        title={`${diffLabel}: ${change.path}`}
        onClick={openDiff}
      >
        <FileDiff aria-hidden="true" />
      </Button>
    </div>
  )
}
