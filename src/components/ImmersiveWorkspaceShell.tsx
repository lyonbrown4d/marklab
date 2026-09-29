import { useEffect, useRef, type ReactNode } from 'react'
import { PanelLeftOpen } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Sheet, SheetContent, SheetTitle } from '@/components/ui/sheet'
import { useSidebarHoverPreview } from '@/components/useSidebarHoverPreview'

type ImmersiveWorkspaceShellProps = {
  children: ReactNode
  sidebar: ReactNode
  inspector: ReactNode
  sidebarOpen: boolean
  inspectorOpen: boolean
  sidebarLabel: string
  inspectorLabel: string
  onToggleSidebar: () => void
  onSidebarOpenChange: (open: boolean) => void
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
  onSidebarOpenChange,
  onToggleInspector,
}: ImmersiveWorkspaceShellProps) => {
  const returnFocusRef = useRef<HTMLElement | null>(null)
  const wasSidebarOpenRef = useRef(sidebarOpen)
  const hoverPreview = useSidebarHoverPreview({
    open: sidebarOpen,
    onOpenChange: onSidebarOpenChange,
  })

  useEffect(() => {
    if (!wasSidebarOpenRef.current && sidebarOpen) {
      returnFocusRef.current =
        document.activeElement instanceof HTMLElement ? document.activeElement : null
    }
    wasSidebarOpenRef.current = sidebarOpen
  }, [sidebarOpen])

  return (
    <div className="immersive-workspace relative flex h-full min-h-0 min-w-0 flex-1 overflow-hidden">
      <div
        data-testid="sidebar-hover-zone"
        className="absolute inset-y-0 left-0 z-30 w-5"
        onPointerEnter={hoverPreview.enterHoverZone}
        onPointerLeave={hoverPreview.leaveHoverRegion}
      >
        <Button
          type="button"
          variant="ghost"
          size="icon"
          aria-label={sidebarLabel}
          className="immersive-edge-handle absolute left-0 top-1/2 h-14 w-5 -translate-y-1/2 rounded-l-none rounded-r-lg border border-l-0 border-border/60 bg-background/80 text-muted-foreground shadow-sm backdrop-blur hover:w-7 hover:bg-background hover:text-foreground"
          onClick={() => {
            hoverPreview.pinOpen()
            onToggleSidebar()
          }}
        >
          <PanelLeftOpen aria-hidden="true" className="size-3.5" />
        </Button>
      </div>

      <main className="min-h-0 min-w-0 flex-1 overflow-hidden">{children}</main>

      <Sheet modal={false} open={sidebarOpen} onOpenChange={onSidebarOpenChange}>
        <SheetContent
          side="left"
          showOverlay={false}
          aria-describedby={undefined}
          className="immersive-drawer flex w-[min(22rem,88vw)] flex-col border-r border-border/60 bg-background/96 p-0 pt-10 shadow-2xl backdrop-blur-xl sm:max-w-[22rem]"
          onOpenAutoFocus={(event) => event.preventDefault()}
          onCloseAutoFocus={(event) => {
            event.preventDefault()
            returnFocusRef.current?.focus({ preventScroll: true })
          }}
          onPointerEnter={hoverPreview.enterDrawer}
          onPointerLeave={hoverPreview.leaveHoverRegion}
          onPointerDownCapture={hoverPreview.pinOpen}
        >
          <SheetTitle className="sr-only">{sidebarLabel}</SheetTitle>
          <div className="min-h-0 flex-1">{sidebar}</div>
        </SheetContent>
      </Sheet>

      <Sheet
        modal={false}
        open={inspectorOpen}
        onOpenChange={(open) => !open && onToggleInspector()}
      >
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
}
