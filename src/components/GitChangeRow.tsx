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

export const GitChangeRow = ({
  change,
  section,
  onOpenDiff,
  diffLabel,
  renamedFromLabel,
}: GitChangeRowProps) => {
  const openDiff = () => {
    onOpenDiff({ path: change.path, status: change.status, section })
  }
  const detail = change.old_path
    ? `${renamedFromLabel}: ${change.old_path}`
    : change.detail || change.status

  return (
    <div className="flex min-w-0 items-center gap-1 rounded-md border border-transparent px-1 py-1 text-xs hover:border-sidebar-border/70 hover:bg-sidebar-accent/70">
      <button
        type="button"
        className="flex min-w-0 flex-1 items-center gap-2 rounded px-1 text-left text-sidebar-foreground/90"
        onClick={openDiff}
      >
        <Badge variant="secondary" className="h-4 min-w-4 rounded px-1 text-[10px]">
          {statusLabels[change.status]}
        </Badge>
        <span className="min-w-0 flex-1">
          <span className="block truncate">{change.path}</span>
          <span className="block truncate text-[11px] text-muted-foreground">{detail}</span>
        </span>
      </button>
      <Button
        type="button"
        variant="ghost"
        size="icon"
        className="h-6 w-6 shrink-0 rounded"
        aria-label={`${diffLabel}: ${change.path}`}
        title={diffLabel}
        onClick={openDiff}
      >
        <FileDiff className="h-3.5 w-3.5" />
      </Button>
    </div>
  )
}
