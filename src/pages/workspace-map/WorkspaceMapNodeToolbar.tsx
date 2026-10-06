import type { SyntheticEvent } from 'react'
import { NodeToolbar, Position } from '@xyflow/react'
import { ExternalLink, Link2, MoreHorizontal, Pin, PinOff, X } from 'lucide-react'
import { Button } from '@/components/ui/button'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
import { useI18n } from '@/i18n/useI18n'

type WorkspaceMapNodeToolbarProps = {
  onClose?: () => void
  onFocusRelations: () => void
  onOpenFull?: () => void
  onTogglePin: () => void
  pinned: boolean
  visible: boolean
}

const stopGraphEvent = (event: SyntheticEvent) => event.stopPropagation()

export const WorkspaceMapNodeToolbar = ({
  onClose,
  onFocusRelations,
  onOpenFull,
  onTogglePin,
  pinned,
  visible,
}: WorkspaceMapNodeToolbarProps) => {
  const { t } = useI18n()
  return (
    <NodeToolbar
      align="end"
      className="nodrag nopan flex items-center gap-0.5 rounded-lg border bg-popover p-1 text-popover-foreground shadow-md"
      isVisible={visible}
      offset={8}
      position={Position.Top}
    >
      <Button
        type="button"
        aria-label={t('workspaceMap.focusRelations')}
        onClick={onFocusRelations}
        onPointerDown={stopGraphEvent}
        size="icon"
        title={t('workspaceMap.focusRelations')}
        variant="ghost"
      >
        <Link2 aria-hidden="true" />
      </Button>
      <Button
        type="button"
        aria-label={t(pinned ? 'workspaceMap.unpinNode' : 'workspaceMap.pinNode')}
        aria-pressed={pinned}
        onClick={onTogglePin}
        onPointerDown={stopGraphEvent}
        size="icon"
        title={t(pinned ? 'workspaceMap.unpinNode' : 'workspaceMap.pinNode')}
        variant="ghost"
      >
        {pinned ? <PinOff aria-hidden="true" /> : <Pin aria-hidden="true" />}
      </Button>
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button
            type="button"
            aria-label={t('workspaceMap.moreActions')}
            onPointerDown={stopGraphEvent}
            size="icon"
            variant="ghost"
          >
            <MoreHorizontal aria-hidden="true" />
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end" onPointerDown={stopGraphEvent}>
          {onOpenFull ? (
            <DropdownMenuItem onSelect={onOpenFull}>
              <ExternalLink aria-hidden="true" />
              {t('workspaceMap.openFullDocument')}
            </DropdownMenuItem>
          ) : null}
          {onClose ? (
            <DropdownMenuItem onSelect={onClose}>
              <X aria-hidden="true" />
              {t('workspaceMap.closeEditor')}
            </DropdownMenuItem>
          ) : null}
        </DropdownMenuContent>
      </DropdownMenu>
    </NodeToolbar>
  )
}
