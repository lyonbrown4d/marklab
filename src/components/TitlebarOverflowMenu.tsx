import { useCallback, useRef } from 'react'
import {
  Code2,
  FileDown,
  FileText,
  ListTree,
  MoreHorizontal,
  PenLine,
  Search,
  Settings,
} from 'lucide-react'
import { Button } from '@/components/ui/button'
import {
  menuItemStyles,
  menuSeparatorStyles,
  menuSurfaceStyles,
} from '@/components/overlay/overlayStyles'
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
  documentActionsVisible: boolean
  exportDocxLabel: string
  exportLabel: string
  exportPdfLabel: string
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
  documentActionsVisible,
  exportDocxLabel,
  exportLabel,
  exportPdfLabel,
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
  const handleViewChange = (value: string) => {
    if (value === 'wysiwyg' || value === 'source') onChangeView(value)
  }

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
        className={menuSurfaceStyles({ className: 'w-56' })}
        collisionPadding={8}
        sideOffset={7}
        onCloseAutoFocus={handleCloseAutoFocus}
      >
        <DropdownMenuItem className={menuItemStyles()} onSelect={onOpenSearch}>
          <Search aria-hidden="true" />
          {searchLabel}
        </DropdownMenuItem>
        {documentActionsVisible ? (
          <>
            <DropdownMenuSub>
              <DropdownMenuSubTrigger className={menuItemStyles()} disabled={!active}>
                <PenLine aria-hidden="true" />
                {wysiwygLabel}
              </DropdownMenuSubTrigger>
              <DropdownMenuPortal>
                <DropdownMenuSubContent
                  alignOffset={-4}
                  className={menuSurfaceStyles({ className: 'w-48' })}
                  collisionPadding={8}
                  sideOffset={4}
                >
                  <DropdownMenuRadioGroup value={viewMode} onValueChange={handleViewChange}>
                    <DropdownMenuRadioItem
                      value="wysiwyg"
                      className={menuItemStyles({ inset: true })}
                    >
                      <PenLine aria-hidden="true" />
                      {wysiwygLabel}
                    </DropdownMenuRadioItem>
                    <DropdownMenuRadioItem
                      value="source"
                      className={menuItemStyles({ inset: true })}
                    >
                      <Code2 aria-hidden="true" />
                      {sourceLabel}
                    </DropdownMenuRadioItem>
                  </DropdownMenuRadioGroup>
                </DropdownMenuSubContent>
              </DropdownMenuPortal>
            </DropdownMenuSub>
            <DropdownMenuSub>
              <DropdownMenuSubTrigger className={menuItemStyles()} disabled={!active}>
                <FileDown aria-hidden="true" />
                {exportLabel}
              </DropdownMenuSubTrigger>
              <DropdownMenuPortal>
                <DropdownMenuSubContent
                  alignOffset={-4}
                  className={menuSurfaceStyles({ className: 'w-48' })}
                  collisionPadding={8}
                  sideOffset={4}
                >
                  <DropdownMenuItem className={menuItemStyles()} onSelect={() => onExport('pdf')}>
                    <FileText aria-hidden="true" />
                    {exportPdfLabel}
                  </DropdownMenuItem>
                  <DropdownMenuItem className={menuItemStyles()} onSelect={() => onExport('docx')}>
                    <FileText aria-hidden="true" />
                    {exportDocxLabel}
                  </DropdownMenuItem>
                </DropdownMenuSubContent>
              </DropdownMenuPortal>
            </DropdownMenuSub>
            <DropdownMenuSeparator className={menuSeparatorStyles} />
            <DropdownMenuItem
              className={menuItemStyles()}
              onSelect={() => runAfterMenuClose(onToggleOutline)}
            >
              <ListTree aria-hidden="true" />
              {toggleOutlineLabel}
            </DropdownMenuItem>
          </>
        ) : null}
        <DropdownMenuItem className={menuItemStyles()} onSelect={onOpenSettings}>
          <Settings aria-hidden="true" />
          {settingsLabel}
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  )
}

export default TitlebarOverflowMenu
