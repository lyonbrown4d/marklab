import { useContext, useState } from 'react'
import type { IDockviewPanelHeaderProps } from 'dockview-react'
import { FileText, Network, X } from 'lucide-react'
import {
  ContextMenu,
  ContextMenuTrigger,
  ContextMenuContent,
  ContextMenuItem,
  ContextMenuSeparator,
  ContextMenuSub,
  ContextMenuSubTrigger,
  ContextMenuSubContent,
} from '@/components/ui/context-menu'
import { DockContext } from '@/features/workbench/dockTypes'
import { panelTab } from '@/features/workbench/dockController'
import { useNativeSurfaceOcclusion } from '@/app/nativeSurfaceOcclusion'

export const DockTabHeader = ({ api, containerApi }: IDockviewPanelHeaderProps) => {
  const context = useContext(DockContext)
  const [menuOpen, setMenuOpen] = useState(false)
  useNativeSurfaceOcclusion('workbench-tab-menu', menuOpen)
  if (!context) return null
  const {
    controller,
    props: { labels },
  } = context
  const panel = containerApi.getPanel(api.id)
  const tab = panelTab(panel)
  const groups = menuOpen ? containerApi.groups.filter((group) => group !== panel?.group) : []
  const Icon = tab?.kind === 'graph' ? Network : FileText
  return (
    <ContextMenu onOpenChange={setMenuOpen}>
      <ContextMenuTrigger asChild>
        <div
          className="group flex h-full max-w-64 min-w-0 items-center gap-2 px-3 text-xs"
          title={tab?.title ?? api.title}
          tabIndex={0}
          onKeyDown={(event) => {
            if (event.key !== 'ContextMenu' && !(event.shiftKey && event.key === 'F10')) return
            event.preventDefault()
            event.stopPropagation()
            const rect = event.currentTarget.getBoundingClientRect()
            event.currentTarget.dispatchEvent(
              new MouseEvent('contextmenu', {
                bubbles: true,
                clientX: rect.left,
                clientY: rect.bottom,
              }),
            )
          }}
          onAuxClick={(event) => {
            if (event.button === 1) {
              event.preventDefault()
              controller?.close(api.id)
            }
          }}
        >
          <Icon aria-hidden className="size-3.5 shrink-0 text-muted-foreground" />
          <span className="truncate">{tab?.title ?? api.title}</span>
          <button
            type="button"
            aria-label={`${labels.close} ${tab?.title ?? api.title ?? ''}`}
            className="ml-1 flex size-5 shrink-0 items-center justify-center rounded-sm text-muted-foreground hover:bg-accent hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none"
            onPointerDown={(event) => event.stopPropagation()}
            onClick={(event) => {
              event.stopPropagation()
              controller?.close(api.id)
            }}
          >
            <X aria-hidden className="size-3" />
          </button>
        </div>
      </ContextMenuTrigger>
      <ContextMenuContent>
        <ContextMenuItem onSelect={() => controller?.split(api.id, 'right')}>
          {labels.splitRight}
        </ContextMenuItem>
        <ContextMenuItem onSelect={() => controller?.split(api.id, 'below')}>
          {labels.splitDown}
        </ContextMenuItem>
        <ContextMenuSub>
          <ContextMenuSubTrigger disabled={!groups.length}>
            {labels.moveToGroup}
          </ContextMenuSubTrigger>
          <ContextMenuSubContent>
            {groups.map((group) => (
              <ContextMenuItem key={group.id} onSelect={() => controller?.move(api.id, group.id)}>
                {labels.group(containerApi.groups.indexOf(group) + 1)}
              </ContextMenuItem>
            ))}
          </ContextMenuSubContent>
        </ContextMenuSub>
        <ContextMenuSeparator />
        <ContextMenuItem onSelect={() => controller?.closeGroup(api.id, 'current')}>
          {labels.close}
        </ContextMenuItem>
        <ContextMenuItem onSelect={() => controller?.closeGroup(api.id, 'others')}>
          {labels.closeOthers}
        </ContextMenuItem>
        <ContextMenuItem onSelect={() => controller?.closeGroup(api.id, 'right')}>
          {labels.closeRight}
        </ContextMenuItem>
        <ContextMenuItem onSelect={() => controller?.closeGroup(api.id, 'all')}>
          {labels.closeAll}
        </ContextMenuItem>
      </ContextMenuContent>
    </ContextMenu>
  )
}
