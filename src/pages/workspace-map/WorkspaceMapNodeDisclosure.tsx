import type { MouseEvent, PointerEvent } from 'react'
import { ChevronDown, ChevronRight } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { useI18n } from '@/i18n/useI18n'

type WorkspaceMapNodeDisclosureProps = {
  collapsed: boolean
  nodeId: string
  onToggle: (nodeId: string) => void
}

export const WorkspaceMapNodeDisclosure = ({
  collapsed,
  nodeId,
  onToggle,
}: WorkspaceMapNodeDisclosureProps) => {
  const { t } = useI18n()
  const label = t(collapsed ? 'workspaceMap.expandNode' : 'workspaceMap.collapseNode')
  const stopPointerEvent = (event: PointerEvent<HTMLButtonElement>) => event.stopPropagation()
  const handleClick = (event: MouseEvent<HTMLButtonElement>) => {
    event.stopPropagation()
    onToggle(nodeId)
  }

  return (
    <Button
      type="button"
      aria-expanded={!collapsed}
      aria-label={label}
      title={label}
      className="nodrag nopan workspace-map-node__disclosure size-7 shrink-0"
      size="icon"
      variant="ghost"
      onClick={handleClick}
      onDoubleClick={(event) => event.stopPropagation()}
      onMouseDown={(event) => event.stopPropagation()}
      onPointerDown={stopPointerEvent}
    >
      {collapsed ? <ChevronRight aria-hidden="true" /> : <ChevronDown aria-hidden="true" />}
    </Button>
  )
}
