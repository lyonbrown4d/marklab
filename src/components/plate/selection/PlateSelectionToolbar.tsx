import {
  Bold,
  Code2,
  Italic,
  Link,
  RemoveFormatting,
  Strikethrough,
  type LucideIcon,
} from 'lucide-react'
import { useMemo } from 'react'
import { Button } from '@/components/ui/button'
import { Popover, PopoverAnchor, PopoverContent } from '@/components/ui/popover'
import { Separator } from '@/components/ui/separator'
import { ToggleGroup, ToggleGroupItem } from '@/components/ui/toggle-group'
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/AppTooltip'
import type { PlateSelectionToolbarController } from '@/components/plate/usePlateSelectionToolbar'
import type { PlateSelectionToolbarAction } from '@/components/plate/selection/selectionToolbarActions'

export type PlateSelectionToolbarLabels = {
  bold: string
  clear: string
  code: string
  italic: string
  link: string
  strike: string
  toolbar: string
}

type PlateSelectionToolbarProps = PlateSelectionToolbarController & {
  labels: PlateSelectionToolbarLabels
}

const markItems: readonly {
  action: Exclude<PlateSelectionToolbarAction, 'clear'>
  icon: LucideIcon
  label: keyof PlateSelectionToolbarLabels
}[] = [
  { action: 'bold', icon: Bold, label: 'bold' },
  { action: 'italic', icon: Italic, label: 'italic' },
  { action: 'strike', icon: Strikethrough, label: 'strike' },
  { action: 'code', icon: Code2, label: 'code' },
  { action: 'link', icon: Link, label: 'link' },
]

export const PlateSelectionToolbar = ({
  activeMarks,
  anchor,
  labels,
  open,
  runAction,
  setToolbarElement,
}: PlateSelectionToolbarProps) => {
  const virtualAnchorRef = useMemo(
    () => ({
      current: {
        getBoundingClientRect: () => new DOMRect(anchor.left, anchor.top),
      },
    }),
    [anchor.left, anchor.top],
  )
  const activeValues = markItems
    .filter(({ action }) => activeMarks[action])
    .map(({ action }) => action)
  const handleValueChange = (nextValues: string[]) => {
    const changed = markItems.find(
      ({ action }) => activeValues.includes(action) !== nextValues.includes(action),
    )
    if (changed) runAction(changed.action)
  }

  return (
    <Popover open={open}>
      <PopoverAnchor virtualRef={virtualAnchorRef} />
      <PopoverContent
        align="center"
        className="w-auto p-1"
        onCloseAutoFocus={(event) => event.preventDefault()}
        onOpenAutoFocus={(event) => event.preventDefault()}
        side="top"
        sideOffset={8}
      >
        <TooltipProvider>
          <div className="flex items-center gap-1" ref={setToolbarElement}>
            <ToggleGroup
              aria-label={labels.toolbar}
              onValueChange={handleValueChange}
              size="sm"
              type="multiple"
              value={activeValues}
            >
              {markItems.map(({ action, icon: Icon, label }) => (
                <Tooltip key={action}>
                  <TooltipTrigger asChild>
                    <ToggleGroupItem
                      aria-label={labels[label]}
                      onMouseDown={(event) => event.preventDefault()}
                      value={action}
                    >
                      <Icon aria-hidden="true" />
                    </ToggleGroupItem>
                  </TooltipTrigger>
                  <TooltipContent>{labels[label]}</TooltipContent>
                </Tooltip>
              ))}
            </ToggleGroup>
            <Separator className="mx-0.5 h-5" orientation="vertical" />
            <Tooltip>
              <TooltipTrigger asChild>
                <Button
                  aria-label={labels.clear}
                  onClick={() => runAction('clear')}
                  onMouseDown={(event) => event.preventDefault()}
                  size="icon"
                  type="button"
                  variant="ghost"
                >
                  <RemoveFormatting aria-hidden="true" />
                </Button>
              </TooltipTrigger>
              <TooltipContent>{labels.clear}</TooltipContent>
            </Tooltip>
          </div>
        </TooltipProvider>
      </PopoverContent>
    </Popover>
  )
}
