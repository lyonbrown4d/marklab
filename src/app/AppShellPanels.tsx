import {
  Group as ResizableGroup,
  Panel as ResizablePanel,
  Separator as ResizableSeparator,
  type useDefaultLayout,
  type usePanelRef,
} from 'react-resizable-panels'
import { lazy, memo, Suspense, type ReactNode, type RefObject } from 'react'
import { Terminal as TerminalIcon } from 'lucide-react'
import type { ThemeMode } from '@/store/appTypes'
import { cn } from '@/lib/utils'
import { Button } from '@/components/ui/button'
import { useI18n } from '@/i18n/useI18n'

const TerminalPanel = lazy(() => import('@/components/TerminalPanel'))
const RESIZE_TARGET_MINIMUM_SIZE = { coarse: 28, fine: 8 }

type AppShellPanelsProps = {
  shellPanelLayout: ReturnType<typeof useDefaultLayout>
  shellGroupElementRef: RefObject<HTMLDivElement | null>
  terminalPanelRef: ReturnType<typeof usePanelRef>
  workspacePanels: ReactNode
  terminalOpen: boolean
  terminalInitialized: boolean
  terminalFocusRequest: number
  theme: ThemeMode
  onCloseTerminalArea: () => void
  onOpenTerminalArea: () => void
  terminalShortcutLabel: string
}

const AppShellPanelsView = ({
  shellPanelLayout,
  shellGroupElementRef,
  terminalPanelRef,
  workspacePanels,
  terminalOpen,
  terminalInitialized,
  terminalFocusRequest,
  theme,
  onCloseTerminalArea,
  onOpenTerminalArea,
  terminalShortcutLabel,
}: AppShellPanelsProps) => {
  const { t } = useI18n()

  return (
    <div className="terminal-dock relative flex min-h-0 flex-1">
      <ResizableGroup
        className="workspace-shell-panels motion-panel-group min-h-0 flex-1"
        defaultLayout={shellPanelLayout.defaultLayout}
        elementRef={shellGroupElementRef}
        id="marklab-shell-panels"
        onLayoutChanged={shellPanelLayout.onLayoutChanged}
        orientation="vertical"
        resizeTargetMinimumSize={RESIZE_TARGET_MINIMUM_SIZE}
      >
        <ResizablePanel
          className="motion-panel motion-shell-workspace min-h-0"
          id="workspace-area"
          minSize="260px"
        >
          {workspacePanels}
        </ResizablePanel>
        <ResizableSeparator
          className={cn(
            'resize-handle resize-handle-horizontal',
            !terminalOpen && 'pointer-events-none opacity-0',
          )}
          disabled={!terminalOpen}
          id="terminal-resize"
        />
        <ResizablePanel
          className={cn(
            'motion-panel motion-terminal-shell min-h-0',
            terminalOpen ? 'motion-panel-open' : 'motion-panel-collapsed',
          )}
          collapsedSize="0px"
          collapsible
          defaultSize="280px"
          groupResizeBehavior="preserve-pixel-size"
          id="terminal"
          maxSize="65vh"
          minSize="160px"
          panelRef={terminalPanelRef}
        >
          {terminalInitialized && (
            <Suspense fallback={null}>
              <TerminalPanel
                focusRequest={terminalFocusRequest}
                onClose={onCloseTerminalArea}
                theme={theme}
                visible={terminalOpen}
              />
            </Suspense>
          )}
        </ResizablePanel>
      </ResizableGroup>
      <Button
        type="button"
        aria-hidden={terminalOpen}
        aria-label={t('actions.openTerminal')}
        className={cn(
          'terminal-dock-trigger absolute bottom-2 left-1/2 z-30 h-7 -translate-x-1/2 gap-2 rounded-full border px-3 text-[11px] font-normal shadow-sm',
          terminalOpen && 'pointer-events-none opacity-0',
        )}
        tabIndex={terminalOpen ? -1 : 0}
        variant="secondary"
        onClick={onOpenTerminalArea}
      >
        <TerminalIcon aria-hidden="true" className="size-3.5" />
        <span>{t('terminal.title')}</span>
        <kbd className="terminal-dock-key rounded px-1.5 py-0.5 font-mono text-[10px]">
          {terminalShortcutLabel}
        </kbd>
      </Button>
    </div>
  )
}

AppShellPanelsView.displayName = 'AppShellPanels'

export const AppShellPanels = memo(AppShellPanelsView)
