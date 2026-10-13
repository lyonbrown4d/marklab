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
      className="nodrag nopan workspace-map-node__disclosure size-7 shrink-0 border border-[color-mix(in_srgb,hsl(var(--border))_78%,transparent)] bg-[color-mix(in_srgb,hsl(var(--card))_90%,transparent)] text-muted-foreground shadow-[0_5px_14px_-11px_hsl(var(--foreground)/45%)] backdrop-blur-[8px] hover:bg-[color-mix(in_srgb,hsl(var(--card))_90%,transparent)] dark:hover:bg-[color-mix(in_srgb,hsl(var(--card))_90%,transparent)] hover:border-[color-mix(in_srgb,hsl(var(--primary))_44%,hsl(var(--border)))] hover:text-foreground focus-visible:border-[color-mix(in_srgb,hsl(var(--primary))_44%,hsl(var(--border)))] focus-visible:text-foreground"
      size="icon"
      variant="ghost"
      onClick={handleClick}
      onDoubleClick={(event) => event.stopPropagation()}
      onMouseDown={(event) => event.stopPropagation()}
      onPointerDown={stopPointerEvent}
    >
      {collapsed ? (
        <ChevronRight aria-hidden="true" className="size-3.5" />
      ) : (
        <ChevronDown aria-hidden="true" className="size-3.5" />
      )}
    </Button>
  )
}
