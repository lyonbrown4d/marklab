import { Files, Network } from 'lucide-react'
import { ToggleGroup, ToggleGroupItem } from '@/components/ui/toggle-group'
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip'
import type { WorkspaceView } from '@/app/useEditorRoutes'

type WorkspaceViewSwitcherProps = {
  activeView: WorkspaceView
  filesLabel: string
  groupLabel: string
  mapLabel: string
  onOpenFiles: () => void
  onOpenMap: () => void
}

export const WorkspaceViewSwitcher = ({
  activeView,
  filesLabel,
  groupLabel,
  mapLabel,
  onOpenFiles,
  onOpenMap,
}: WorkspaceViewSwitcherProps) => {
  const handleValueChange = (value: string) => {
    if (value === 'files') onOpenFiles()
    if (value === 'map') onOpenMap()
  }

  return (
    <TooltipProvider>
      <ToggleGroup
        type="single"
        value={activeView}
        aria-label={groupLabel}
        variant="default"
        size="sm"
        className="shrink-0 gap-0.5 rounded-md border border-border bg-background/70 p-0.5 shadow-sm"
        onValueChange={handleValueChange}
      >
        <Tooltip>
          <TooltipTrigger asChild>
            <span className="contents">
              <ToggleGroupItem
                value="files"
                aria-label={filesLabel}
                className="size-6 rounded"
                data-no-drag
              >
                <Files aria-hidden="true" />
              </ToggleGroupItem>
            </span>
          </TooltipTrigger>
          <TooltipContent>{filesLabel}</TooltipContent>
        </Tooltip>
        <Tooltip>
          <TooltipTrigger asChild>
            <span className="contents">
              <ToggleGroupItem
                value="map"
                aria-label={mapLabel}
                className="size-6 rounded"
                data-no-drag
              >
                <Network aria-hidden="true" />
              </ToggleGroupItem>
            </span>
          </TooltipTrigger>
          <TooltipContent>{mapLabel}</TooltipContent>
        </Tooltip>
      </ToggleGroup>
    </TooltipProvider>
  )
}
