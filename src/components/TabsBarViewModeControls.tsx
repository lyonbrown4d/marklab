import { Code2, GitGraph, PenLine } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip'
import { preloadGraphView, preloadSourceEditor, preloadWysiwygEditor } from '@/lib/preloadFeatures'
import type { ViewMode } from '@/store/appTypes'

type ViewModeControl = {
  label: string
  mode: ViewMode
  Icon: typeof PenLine
  onPreload: () => void
}

type TabsBarViewModeControlsProps = {
  active: boolean
  graphLabel: string
  sourceLabel: string
  viewMode: ViewMode
  wysiwygLabel: string
  onChangeView: (mode: ViewMode) => void
}

export const TabsBarViewModeControls = ({
  active,
  graphLabel,
  sourceLabel,
  viewMode,
  wysiwygLabel,
  onChangeView,
}: TabsBarViewModeControlsProps) => {
  const controls: ViewModeControl[] = [
    { label: wysiwygLabel, mode: 'wysiwyg', Icon: PenLine, onPreload: preloadWysiwygEditor },
    { label: sourceLabel, mode: 'source', Icon: Code2, onPreload: preloadSourceEditor },
    { label: graphLabel, mode: 'graph', Icon: GitGraph, onPreload: preloadGraphView },
  ]

  return (
    <div className="hidden shrink-0 items-center gap-2 md:flex">
      <TooltipProvider>
        <div className="flex items-center gap-0.5 rounded-md border border-border bg-background/70 p-0.5 shadow-sm">
          {controls.map(({ label, mode, Icon, onPreload }) => (
            <Tooltip key={mode}>
              <TooltipTrigger asChild>
                <Button
                  type="button"
                  variant={viewMode === mode ? 'secondary' : 'ghost'}
                  size="icon"
                  className="size-6 rounded"
                  aria-label={label}
                  aria-pressed={viewMode === mode}
                  disabled={!active}
                  onFocus={onPreload}
                  onMouseEnter={onPreload}
                  onClick={() => onChangeView(mode)}
                >
                  <Icon aria-hidden="true" data-icon="icon" />
                </Button>
              </TooltipTrigger>
              <TooltipContent>{label}</TooltipContent>
            </Tooltip>
          ))}
        </div>
      </TooltipProvider>
    </div>
  )
}
