import { FilePlus2, FolderPlus } from 'lucide-react'
import {
  ContextMenuContent,
  ContextMenuItem,
  ContextMenuSeparator,
} from '@/components/ui/context-menu'
import type { ContextLabels } from '@/components/file-tree/types'
import { cn } from '@/lib/utils'

type FileTreeBlankContextMenuProps = {
  labels: ContextLabels
  readonlyTree: boolean
  onRequestCreate: (kind: 'file' | 'folder') => void
}

const itemClassName = cn(
  'group/file-tree-menu relative gap-2 rounded-md px-2 py-1.5 text-xs transition-colors',
  'before:absolute before:left-0 before:top-1 before:h-5 before:w-0.5 before:rounded-full before:bg-transparent before:transition-colors',
  'hover:bg-accent hover:text-accent-foreground hover:before:bg-primary',
  'data-[highlighted]:bg-accent data-[highlighted]:text-accent-foreground data-[highlighted]:before:bg-primary',
)

export const FileTreeBlankContextMenu = ({
  labels,
  readonlyTree,
  onRequestCreate,
}: FileTreeBlankContextMenuProps) => {
  return (
    <ContextMenuContent
      alignOffset={-2}
      className="w-[14rem] rounded-lg border border-border/90 bg-popover p-1.5 shadow-xl"
    >
      <div className="px-2 py-1.5 text-[10px] uppercase tracking-wide text-muted-foreground">
        {labels.newFilePrompt}
      </div>
      <ContextMenuSeparator />
      <ContextMenuItem
        disabled={readonlyTree}
        className={itemClassName}
        onSelect={() => onRequestCreate('file')}
      >
        <FilePlus2 className="size-4 shrink-0 text-muted-foreground transition-colors group-hover/file-tree-menu:text-accent-foreground group-data-[highlighted]/file-tree-menu:text-accent-foreground" />
        <span className="min-w-0 flex-1 truncate">{labels.newFile}</span>
      </ContextMenuItem>
      <ContextMenuItem
        disabled={readonlyTree}
        className={itemClassName}
        onSelect={() => onRequestCreate('folder')}
      >
        <FolderPlus className="size-4 shrink-0 text-muted-foreground transition-colors group-hover/file-tree-menu:text-accent-foreground group-data-[highlighted]/file-tree-menu:text-accent-foreground" />
        <span className="min-w-0 flex-1 truncate">{labels.newFolder}</span>
      </ContextMenuItem>
    </ContextMenuContent>
  )
}
