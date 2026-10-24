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
}: AppShellPanelsProps) => {
  return (
    <div className="terminal-dock relative flex min-h-0 flex-1">
      <ResizableGroup
        className="workspace-shell-panels motion-panel-group min-h-0 flex-1 [:root[data-immersive-zen=true]_&]:p-0"
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
            'resize-handle resize-handle-horizontal relative z-[5] flex h-[7px] shrink-0 basis-auto -my-[3px] cursor-row-resize touch-none items-center justify-center bg-border/18 outline-none transition-[background-color,opacity] duration-[var(--motion-duration-fast)] ease-[ease] after:h-0.5 after:w-9 after:rounded-[999px] after:bg-transparent after:content-[""] after:transition-[background-color,transform] after:duration-[var(--motion-duration-fast)] after:ease-[ease] [&:hover]:bg-ring/12 focus-visible:bg-ring/12 data-[resize-handle-active]:bg-ring/12 [&:hover]:after:bg-ring/72 focus-visible:after:bg-ring/72 data-[resize-handle-active]:after:bg-ring/72 [&:hover]:after:[transform:scaleY(1.35)] focus-visible:after:[transform:scaleY(1.35)] data-[disabled]:cursor-default data-[disabled]:opacity-0 motion-reduce:transition-none motion-reduce:after:transition-none [:root[data-immersive-zen=true]_&]:!hidden',
            !terminalOpen && 'pointer-events-none opacity-0',
          )}
          disabled={!terminalOpen}
          id="terminal-resize"
        />
        <ResizablePanel
          data-app-focus-zone="terminal"
          aria-hidden={!terminalOpen || undefined}
          inert={!terminalOpen ? true : undefined}
          className={cn(
            'motion-panel motion-terminal-shell min-h-0',
            terminalOpen ? 'motion-panel-open' : 'motion-panel-collapsed',
          )}
          collapsedSize="0px"
          collapsible
          defaultSize={terminalOpen ? '280px' : '0px'}
          groupResizeBehavior="preserve-pixel-size"
          id="terminal"
          maxSize={terminalOpen ? '65vh' : '0px'}
          minSize={terminalOpen ? '160px' : '0px'}
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
    </div>
  )
}

AppShellPanelsView.displayName = 'AppShellPanels'

export const AppShellPanels = memo(AppShellPanelsView)
