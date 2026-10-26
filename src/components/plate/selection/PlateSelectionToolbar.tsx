import { FloatingPortal } from '@platejs/floating'
import {
  Bold,
  Code2,
  Italic,
  Link,
  RemoveFormatting,
  Sparkles,
  Strikethrough,
  type LucideIcon,
} from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Separator } from '@/components/ui/separator'
import { ToggleGroup, ToggleGroupItem } from '@/components/ui/toggle-group'
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/AppTooltip'
import { PlateSelectionToolbarMoreMenu } from '@/components/plate/selection/PlateSelectionToolbarMoreMenu'
import type { PlateSelectionToolbarController } from '@/components/plate/usePlateSelectionToolbar'
import type { PlateSelectionToolbarAction } from '@/components/plate/selection/selectionToolbarActions'

export type PlateSelectionToolbarLabels = {
  ai?: string
  blockStyle: string
  bold: string
  bulletList: string
  clear: string
  code: string
  copyError: string
  copyMarkdown: string
  heading1: string
  heading2: string
  heading3: string
  italic: string
  link: string
  more: string
  orderedList: string
  paragraph: string
  quote: string
  strike: string
  toolbar: string
}

type PlateSelectionToolbarProps = PlateSelectionToolbarController & {
  labels: PlateSelectionToolbarLabels
  onAi?: () => void
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
  captureSelection,
  floatingStyle,
  labels,
  open,
  onAi,
  runAction,
  runMoreAction,
  setToolbarElement,
}: PlateSelectionToolbarProps) => {
  const activeValues = markItems
    .filter(({ action }) => activeMarks[action])
    .map(({ action }) => action)
  const handleValueChange = (nextValues: string[]) => {
    const changed = markItems.find(
      ({ action }) => activeValues.includes(action) !== nextValues.includes(action),
    )
    if (changed) runAction(changed.action)
  }
  if (!open) return null

  return (
    <FloatingPortal>
      <div
        className="z-50 w-auto rounded-md border bg-popover p-1 text-popover-foreground shadow-md outline-hidden"
        data-slot="popover-content"
        onMouseDownCapture={captureSelection}
        ref={setToolbarElement}
        style={floatingStyle ?? { left: anchor.left, position: 'fixed', top: anchor.top }}
      >
        <TooltipProvider>
          <div className="flex items-center gap-1">
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
            <PlateSelectionToolbarMoreMenu labels={labels} onAction={runMoreAction} />
            {onAi && (
              <Button
                aria-label={labels.ai ?? 'AI'}
                onClick={onAi}
                onMouseDown={(event) => event.preventDefault()}
                size="sm"
                type="button"
                variant="ghost"
              >
                <Sparkles aria-hidden="true" /> AI
              </Button>
            )}
          </div>
        </TooltipProvider>
      </div>
    </FloatingPortal>
  )
}
