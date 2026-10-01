import { FilePlus2, FolderPlus } from 'lucide-react'
import {
  ContextMenuContent,
  ContextMenuItem,
  ContextMenuSeparator,
} from '@/components/ui/context-menu'
import type { ContextLabels } from '@/components/file-tree/types'
import {
  menuItemStyles,
  menuSeparatorStyles,
  menuSurfaceStyles,
} from '@/components/overlay/overlayStyles'

type FileTreeBlankContextMenuProps = {
  labels: ContextLabels
  readonlyTree: boolean
  onRequestCreate: (kind: 'file' | 'folder') => void
}

export const FileTreeBlankContextMenu = ({
  labels,
  readonlyTree,
  onRequestCreate,
}: FileTreeBlankContextMenuProps) => {
  return (
    <ContextMenuContent alignOffset={-2} className={menuSurfaceStyles({ className: 'w-[14rem]' })}>
      <div className="px-2 py-1.5 text-[10px] uppercase tracking-wide text-muted-foreground">
        {labels.newFilePrompt}
      </div>
      <ContextMenuSeparator className={menuSeparatorStyles} />
      <ContextMenuItem
        disabled={readonlyTree}
        className={menuItemStyles({ className: 'group/file-tree-menu' })}
        onSelect={() => onRequestCreate('file')}
      >
        <FilePlus2 className="size-4 shrink-0 text-muted-foreground transition-colors group-hover/file-tree-menu:text-accent-foreground group-data-[highlighted]/file-tree-menu:text-accent-foreground" />
        <span className="min-w-0 flex-1 truncate">{labels.newFile}</span>
      </ContextMenuItem>
      <ContextMenuItem
        disabled={readonlyTree}
        className={menuItemStyles({ className: 'group/file-tree-menu' })}
        onSelect={() => onRequestCreate('folder')}
      >
        <FolderPlus className="size-4 shrink-0 text-muted-foreground transition-colors group-hover/file-tree-menu:text-accent-foreground group-data-[highlighted]/file-tree-menu:text-accent-foreground" />
        <span className="min-w-0 flex-1 truncate">{labels.newFolder}</span>
      </ContextMenuItem>
    </ContextMenuContent>
  )
}
