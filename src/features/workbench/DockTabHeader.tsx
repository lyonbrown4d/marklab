import { useContext, useState } from 'react'
import type { IDockviewPanelHeaderProps } from 'dockview-react'
import { X } from 'lucide-react'
import { Button } from '@/components/ui/button'
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
import { DockTabIcon, getDockTabPresentation } from '@/features/workbench/dockTabPresentation'
import { useI18n } from '@/i18n/useI18n'
import { useNativeSurfaceOcclusion } from '@/app/nativeSurfaceOcclusion'

export const DockTabHeader = ({ api, containerApi }: IDockviewPanelHeaderProps) => {
  const { t } = useI18n()
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
  const { label } = getDockTabPresentation(tab, api.title ?? '', {
    source: t('editor.modeSource'),
    preview: t('editor.modePreview'),
    diff: t('scm.diffTitle'),
  })
  return (
    <ContextMenu onOpenChange={setMenuOpen}>
      <ContextMenuTrigger asChild>
        <div
          className="group flex h-full max-w-64 min-w-0 items-center gap-1.5 px-2 text-xs"
          title={tab?.title ?? api.title}
          aria-label={label}
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
          <DockTabIcon tab={tab} />
          <span className="truncate">{label}</span>
          <Button
            type="button"
            variant="ghost"
            size="icon"
            aria-label={`${labels.close} ${tab?.title ?? api.title ?? ''}`}
            className="ml-1 flex size-5 shrink-0 items-center justify-center rounded-sm text-muted-foreground hover:bg-accent hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none"
            onPointerDown={(event) => event.stopPropagation()}
            onClick={(event) => {
              event.stopPropagation()
              controller?.close(api.id)
            }}
          >
            <X aria-hidden className="size-3" />
          </Button>
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
