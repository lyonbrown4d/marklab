import type { ReactNode } from 'react'
import { PanelLeftOpen } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Sheet, SheetContent, SheetTitle } from '@/components/ui/sheet'

type ImmersiveWorkspaceShellProps = {
  children: ReactNode
  sidebar: ReactNode
  inspector: ReactNode
  sidebarOpen: boolean
  inspectorOpen: boolean
  sidebarLabel: string
  inspectorLabel: string
  onToggleSidebar: () => void
  onToggleInspector: () => void
}

export const ImmersiveWorkspaceShell = ({
  children,
  sidebar,
  inspector,
  sidebarOpen,
  inspectorOpen,
  sidebarLabel,
  inspectorLabel,
  onToggleSidebar,
  onToggleInspector,
}: ImmersiveWorkspaceShellProps) => (
  <div className="immersive-workspace relative flex h-full min-h-0 min-w-0 flex-1 overflow-hidden">
    <Button
      type="button"
      variant="ghost"
      size="icon"
      aria-label={sidebarLabel}
      className="immersive-edge-handle absolute left-0 top-1/2 z-30 h-14 w-5 -translate-y-1/2 rounded-l-none rounded-r-lg border border-l-0 border-border/60 bg-background/80 text-muted-foreground shadow-sm backdrop-blur hover:w-7 hover:bg-background hover:text-foreground"
      onClick={onToggleSidebar}
    >
      <PanelLeftOpen aria-hidden="true" className="size-3.5" />
    </Button>

    <main className="min-h-0 min-w-0 flex-1 overflow-hidden">{children}</main>

    <Sheet modal={false} open={sidebarOpen} onOpenChange={(open) => !open && onToggleSidebar()}>
      <SheetContent
        side="left"
        showOverlay={false}
        aria-describedby={undefined}
        className="immersive-drawer flex w-[min(22rem,88vw)] flex-col border-r border-border/60 bg-background/96 p-0 pt-10 shadow-2xl backdrop-blur-xl sm:max-w-[22rem]"
      >
        <SheetTitle className="sr-only">{sidebarLabel}</SheetTitle>
        <div className="min-h-0 flex-1">{sidebar}</div>
      </SheetContent>
    </Sheet>

    <Sheet modal={false} open={inspectorOpen} onOpenChange={(open) => !open && onToggleInspector()}>
      <SheetContent
        side="right"
        showOverlay={false}
        aria-describedby={undefined}
        className="immersive-drawer flex w-[min(22rem,88vw)] flex-col border-l border-border/60 bg-background/96 p-0 pt-10 shadow-2xl backdrop-blur-xl sm:max-w-[22rem]"
      >
        <SheetTitle className="sr-only">{inspectorLabel}</SheetTitle>
        <div className="min-h-0 flex-1">{inspector}</div>
      </SheetContent>
    </Sheet>
  </div>
)
