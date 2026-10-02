import { Code2, PenLine } from 'lucide-react'
import { ToggleGroup, ToggleGroupItem } from '@/components/ui/toggle-group'
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip'
import { preloadSourceEditor, preloadWysiwygEditor } from '@/lib/preloadFeatures'
import type { ViewMode } from '@/store/appTypes'

type EditorViewMode = Extract<ViewMode, 'wysiwyg' | 'source'>

type ViewModeControl = {
  label: string
  mode: EditorViewMode
  Icon: typeof PenLine
  onPreload: () => void
}

type TabsBarViewModeControlsProps = {
  active: boolean
  groupLabel: string
  sourceLabel: string
  viewMode: ViewMode
  wysiwygLabel: string
  onChangeView: (mode: ViewMode) => void
}

export const TabsBarViewModeControls = ({
  active,
  groupLabel,
  sourceLabel,
  viewMode,
  wysiwygLabel,
  onChangeView,
}: TabsBarViewModeControlsProps) => {
  const controls: ViewModeControl[] = [
    { label: wysiwygLabel, mode: 'wysiwyg', Icon: PenLine, onPreload: preloadWysiwygEditor },
    { label: sourceLabel, mode: 'source', Icon: Code2, onPreload: preloadSourceEditor },
  ]

  const selectedMode = viewMode === 'wysiwyg' || viewMode === 'source' ? viewMode : ''
  const handleValueChange = (value: string) => {
    if (value === 'wysiwyg' || value === 'source') onChangeView(value)
  }

  return (
    <div className="flex shrink-0 items-center gap-2">
      <TooltipProvider>
        <ToggleGroup
          type="single"
          value={selectedMode}
          aria-label={groupLabel}
          size="sm"
          className="gap-0.5 rounded-md border border-border bg-background/70 p-0.5 shadow-sm"
          disabled={!active}
          onValueChange={handleValueChange}
        >
          {controls.map(({ label, mode, Icon, onPreload }) => (
            <Tooltip key={mode}>
              <TooltipTrigger asChild>
                <span className="contents">
                  <ToggleGroupItem
                    value={mode}
                    className="size-6 rounded"
                    aria-label={label}
                    onFocus={onPreload}
                    onMouseEnter={onPreload}
                  >
                    <Icon aria-hidden="true" />
                  </ToggleGroupItem>
                </span>
              </TooltipTrigger>
              <TooltipContent>{label}</TooltipContent>
            </Tooltip>
          ))}
        </ToggleGroup>
      </TooltipProvider>
    </div>
  )
}
