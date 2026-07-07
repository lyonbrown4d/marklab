import {
  Group as ResizableGroup,
  Panel as ResizablePanel,
  Separator as ResizableSeparator,
  type useDefaultLayout,
  type usePanelRef,
} from 'react-resizable-panels'
import { lazy, memo, Suspense, type ReactNode, type RefObject } from 'react'
import type { ThemeMode } from '@/store/appTypes'
import { cn } from '@/lib/utils'

const TerminalPanel = lazy(() => import('@/components/TerminalPanel'))

type AppShellPanelsProps = {
  shellPanelLayout: ReturnType<typeof useDefaultLayout>
  shellGroupElementRef: RefObject<HTMLDivElement | null>
  terminalPanelRef: ReturnType<typeof usePanelRef>
  workspacePanels: ReactNode
  terminalOpen: boolean
  terminalInitialized: boolean
  theme: ThemeMode
  onCloseTerminalArea: () => void
}

const AppShellPanelsView = ({
  shellPanelLayout,
  shellGroupElementRef,
  terminalPanelRef,
  workspacePanels,
  terminalOpen,
  terminalInitialized,
  theme,
  onCloseTerminalArea,
}: AppShellPanelsProps) => {
  return (
    <ResizableGroup
      className="motion-panel-group min-h-0 flex-1"
      defaultLayout={shellPanelLayout.defaultLayout}
      elementRef={shellGroupElementRef}
      id="marklab-shell-panels"
      onLayoutChanged={shellPanelLayout.onLayoutChanged}
      orientation="vertical"
      resizeTargetMinimumSize={{ coarse: 28, fine: 8 }}
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
            <TerminalPanel onClose={onCloseTerminalArea} theme={theme} visible={terminalOpen} />
          </Suspense>
        )}
      </ResizablePanel>
    </ResizableGroup>
  )
}

AppShellPanelsView.displayName = 'AppShellPanels'

export const AppShellPanels = memo(AppShellPanelsView)
