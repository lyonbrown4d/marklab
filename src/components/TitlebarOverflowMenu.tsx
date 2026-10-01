import { useCallback, useRef } from 'react'
import {
  Code2,
  FileDown,
  FileText,
  GitGraph,
  ListTree,
  MoreHorizontal,
  PenLine,
  Search,
  Settings,
} from 'lucide-react'
import { Button } from '@/components/ui/button'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuPortal,
  DropdownMenuRadioGroup,
  DropdownMenuRadioItem,
  DropdownMenuSeparator,
  DropdownMenuSub,
  DropdownMenuSubContent,
  DropdownMenuSubTrigger,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
import type { ExportFormat } from '@/services/exportApi'
import type { ViewMode } from '@/store/appTypes'

type TitlebarOverflowMenuProps = {
  active: boolean
  exportDocxLabel: string
  exportLabel: string
  exportPdfLabel: string
  graphLabel: string
  moreLabel: string
  searchLabel: string
  settingsLabel: string
  sourceLabel: string
  toggleOutlineLabel: string
  viewMode: ViewMode
  wysiwygLabel: string
  onChangeView: (mode: ViewMode) => void
  onExport: (format: Extract<ExportFormat, 'pdf' | 'docx'>) => void
  onOpenSearch: () => void
  onOpenSettings: () => void
  onToggleOutline: () => void
}

const TitlebarOverflowMenu = ({
  active,
  exportDocxLabel,
  exportLabel,
  exportPdfLabel,
  graphLabel,
  moreLabel,
  searchLabel,
  settingsLabel,
  sourceLabel,
  toggleOutlineLabel,
  viewMode,
  wysiwygLabel,
  onChangeView,
  onExport,
  onOpenSearch,
  onOpenSettings,
  onToggleOutline,
}: TitlebarOverflowMenuProps) => {
  const pendingCloseActionRef = useRef<(() => void) | null>(null)
  const runAfterMenuClose = useCallback((action: () => void) => {
    pendingCloseActionRef.current = action
  }, [])
  const handleCloseAutoFocus = useCallback((event: Event) => {
    const action = pendingCloseActionRef.current
    if (!action) return

    event.preventDefault()
    pendingCloseActionRef.current = null
    queueMicrotask(action)
  }, [])

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button
          type="button"
          variant="ghost"
          size="icon"
          aria-label={moreLabel}
          className="chrome-button size-8 rounded-full"
          data-no-drag
        >
          <MoreHorizontal aria-hidden="true" />
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent
        align="end"
        className="w-56 rounded-xl p-2"
        collisionPadding={8}
        sideOffset={7}
        onCloseAutoFocus={handleCloseAutoFocus}
      >
        <DropdownMenuItem className="rounded-lg" onSelect={onOpenSearch}>
          <Search aria-hidden="true" />
          {searchLabel}
        </DropdownMenuItem>
        <DropdownMenuSub>
          <DropdownMenuSubTrigger className="rounded-lg" disabled={!active}>
            <PenLine aria-hidden="true" />
            {wysiwygLabel}
          </DropdownMenuSubTrigger>
          <DropdownMenuPortal>
            <DropdownMenuSubContent
              alignOffset={-4}
              className="w-48 rounded-xl p-2"
              collisionPadding={8}
              sideOffset={4}
            >
              <DropdownMenuRadioGroup
                value={viewMode}
                onValueChange={(value) => onChangeView(value as ViewMode)}
              >
                <DropdownMenuRadioItem value="wysiwyg" className="rounded-lg">
                  <PenLine aria-hidden="true" className="mr-2 size-4" />
                  {wysiwygLabel}
                </DropdownMenuRadioItem>
                <DropdownMenuRadioItem value="source" className="rounded-lg">
                  <Code2 aria-hidden="true" className="mr-2 size-4" />
                  {sourceLabel}
                </DropdownMenuRadioItem>
                <DropdownMenuRadioItem value="graph" className="rounded-lg">
                  <GitGraph aria-hidden="true" className="mr-2 size-4" />
                  {graphLabel}
                </DropdownMenuRadioItem>
              </DropdownMenuRadioGroup>
            </DropdownMenuSubContent>
          </DropdownMenuPortal>
        </DropdownMenuSub>
        <DropdownMenuSub>
          <DropdownMenuSubTrigger className="rounded-lg" disabled={!active}>
            <FileDown aria-hidden="true" />
            {exportLabel}
          </DropdownMenuSubTrigger>
          <DropdownMenuPortal>
            <DropdownMenuSubContent
              alignOffset={-4}
              className="w-48 rounded-xl p-2"
              collisionPadding={8}
              sideOffset={4}
            >
              <DropdownMenuItem className="rounded-lg" onSelect={() => onExport('pdf')}>
                <FileText aria-hidden="true" />
                {exportPdfLabel}
              </DropdownMenuItem>
              <DropdownMenuItem className="rounded-lg" onSelect={() => onExport('docx')}>
                <FileText aria-hidden="true" />
                {exportDocxLabel}
              </DropdownMenuItem>
            </DropdownMenuSubContent>
          </DropdownMenuPortal>
        </DropdownMenuSub>
        <DropdownMenuSeparator />
        <DropdownMenuItem
          className="rounded-lg"
          onSelect={() => runAfterMenuClose(onToggleOutline)}
        >
          <ListTree aria-hidden="true" />
          {toggleOutlineLabel}
        </DropdownMenuItem>
        <DropdownMenuItem className="rounded-lg" onSelect={onOpenSettings}>
          <Settings aria-hidden="true" />
          {settingsLabel}
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  )
}

export default TitlebarOverflowMenu
