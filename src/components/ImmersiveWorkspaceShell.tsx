import { useCallback, useEffect, useRef, type ReactNode } from 'react'
import { PanelLeftOpen } from 'lucide-react'
import { AppSheetContent } from '@/components/AppSheetContent'
import { Button } from '@/components/ui/button'
import { Sheet, SheetTitle } from '@/components/ui/sheet'
import { useSidebarHoverPreview } from '@/components/useSidebarHoverPreview'
import { useNativeSurfaceInsetsStore } from '@/app/nativeSurfaceInsets'

type ImmersiveWorkspaceShellProps = {
  children: ReactNode
  sidebar: ReactNode
  inspector: ReactNode
  sidebarOpen: boolean
  sidebarDismissRequest?: number
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
  sidebarDismissRequest = 0,
  inspectorOpen,
  sidebarLabel,
  inspectorLabel,
  onToggleSidebar,
  onSidebarOpenChange,
  onToggleInspector,
}: ImmersiveWorkspaceShellProps) => {
  const returnFocusRef = useRef<HTMLElement | null>(null)
  const wasSidebarOpenRef = useRef(sidebarOpen)
  const pinSidebarOpen = useCallback(() => onSidebarOpenChange(true), [onSidebarOpenChange])
  const { dismissPreview, enterDrawer, enterHoverZone, leaveHoverRegion, pinOpen, previewOpen } =
    useSidebarHoverPreview({
      pinnedOpen: sidebarOpen,
      onPinOpen: pinSidebarOpen,
      dismissRequest: sidebarDismissRequest,
    })
  const effectiveSidebarOpen = sidebarOpen || previewOpen
  const setNativeDrawers = useNativeSurfaceInsetsStore((state) => state.setDrawers)
  useEffect(() => {
    setNativeDrawers(effectiveSidebarOpen, inspectorOpen)
  }, [effectiveSidebarOpen, inspectorOpen, setNativeDrawers])
  useEffect(() => () => setNativeDrawers(false, false), [setNativeDrawers])
  const handleSidebarOpenChange = useCallback(
    (open: boolean) => {
      if (open) return
      if (previewOpen && !sidebarOpen) {
        dismissPreview()
        return
      }
      if (sidebarOpen) onSidebarOpenChange(false)
    },
    [dismissPreview, onSidebarOpenChange, previewOpen, sidebarOpen],
  )

  useEffect(() => {
    if (!wasSidebarOpenRef.current && effectiveSidebarOpen) {
      returnFocusRef.current =
        document.activeElement instanceof HTMLElement ? document.activeElement : null
    }
    wasSidebarOpenRef.current = effectiveSidebarOpen
  }, [effectiveSidebarOpen])

  return (
    <div className="immersive-workspace relative flex h-full min-h-0 min-w-0 flex-1 overflow-hidden">
      <div
        data-testid="sidebar-hover-zone"
        className="absolute inset-y-0 left-0 z-30 w-5"
        onPointerEnter={enterHoverZone}
        onPointerLeave={leaveHoverRegion}
      >
        <Button
          type="button"
          variant="ghost"
          size="icon"
          aria-label={sidebarLabel}
          className="immersive-edge-handle absolute left-0 top-1/2 h-14 w-5 -translate-y-1/2 rounded-l-none rounded-r-lg border border-l-0 border-border/60 bg-background/80 text-muted-foreground shadow-sm backdrop-blur hover:w-7 hover:bg-background hover:text-foreground"
          onClick={() => {
            dismissPreview()
            onToggleSidebar()
          }}
        >
          <PanelLeftOpen aria-hidden="true" className="size-3.5" />
        </Button>
      </div>

      <main className="min-h-0 min-w-0 flex-1 overflow-hidden" data-app-focus-zone="editor">
        {children}
      </main>

      <Sheet modal={false} open={effectiveSidebarOpen} onOpenChange={handleSidebarOpenChange}>
        <AppSheetContent
          data-app-focus-zone="sidebar"
          side="left"
          showOverlay={false}
          aria-describedby={undefined}
          aria-hidden={!effectiveSidebarOpen || undefined}
          inert={!effectiveSidebarOpen || undefined}
          className="immersive-drawer flex w-[min(22rem,88vw)] flex-col border-r border-border/60 bg-background/96 p-0 pt-10 shadow-2xl backdrop-blur-xl data-[state=closed]:pointer-events-none data-[state=closed]:invisible sm:max-w-[22rem]"
          onOpenAutoFocus={(event) => event.preventDefault()}
          onCloseAutoFocus={(event) => {
            event.preventDefault()
            const target = returnFocusRef.current
            if (!target?.isConnected) return

            const active = document.activeElement
            const closingDrawer = event.currentTarget
            if (
              active instanceof HTMLElement &&
              active !== document.body &&
              active !== document.documentElement &&
              !(closingDrawer instanceof HTMLElement && closingDrawer.contains(active))
            ) {
              return
            }
            target.focus({ preventScroll: true })
          }}
          onPointerEnter={enterDrawer}
          onPointerLeave={leaveHoverRegion}
          onPointerDownCapture={pinOpen}
        >
          <SheetTitle className="sr-only">{sidebarLabel}</SheetTitle>
          <div className="min-h-0 flex-1">{sidebar}</div>
        </AppSheetContent>
      </Sheet>

      <Sheet
        modal={false}
        open={inspectorOpen}
        onOpenChange={(open) => !open && onToggleInspector()}
      >
        <AppSheetContent
          data-app-focus-zone="inspector"
          side="right"
          showOverlay={false}
          aria-describedby={undefined}
          className="immersive-drawer flex w-[min(22rem,88vw)] flex-col border-l border-border/60 bg-background/96 p-0 pt-10 shadow-2xl backdrop-blur-xl sm:max-w-[22rem]"
        >
          <SheetTitle className="sr-only">{inspectorLabel}</SheetTitle>
          <div className="min-h-0 flex-1">{inspector}</div>
        </AppSheetContent>
      </Sheet>
    </div>
  )
}
