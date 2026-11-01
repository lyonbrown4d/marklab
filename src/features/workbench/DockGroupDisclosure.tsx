import { useEffect, useRef } from 'react'
import type { IDockviewHeaderActionsProps } from 'dockview-react'
import { PanelTopClose, Pin } from 'lucide-react'
import { useNativeSurfaceOcclusion } from '@/app/nativeSurfaceOcclusion'
import { useTabsDockDisclosure } from '@/components/useTabsDockDisclosure'
import { Button } from '@/components/ui/button'
import { useI18n } from '@/i18n/useI18n'
import { panelTab } from '@/features/workbench/dockController'
import { DockTabIcon, getDockTabPresentation } from '@/features/workbench/dockTabPresentation'

/** Disclosure decorates Dockview's header; the SDK still owns its tabs and drag targets. */
export const DockGroupDisclosure = ({ activePanel, group }: IDockviewHeaderActionsProps) => {
  const { t } = useI18n()
  const disclosure = useTabsDockDisclosure()
  const tab = panelTab(activePanel)
  const { label } = getDockTabPresentation(tab, activePanel?.title ?? t('tabs.openFiles'), {
    source: t('editor.modeSource'),
    preview: t('editor.modePreview'),
    diff: t('scm.diffTitle'),
  })
  const actionRef = useRef<HTMLDivElement>(null)
  const triggerRef = useRef<HTMLButtonElement>(null)
  const { expanded, previewAfterDelay, closePreviewAfterDelay, keepPreviewOpen, collapse } =
    disclosure
  useNativeSurfaceOcclusion(`workbench-tabs-${group.id}`, expanded)

  useEffect(() => {
    // Header actions and native tabs are sibling portals. Listen on their shared
    // SDK header so moving between them preserves one hover/focus boundary.
    const header = actionRef.current?.closest('.dv-tabs-and-actions-container')
    if (!header) return
    const onFocus = () => {
      if (expanded) keepPreviewOpen()
    }
    const onBlur = (event: Event) => {
      if (event instanceof FocusEvent && header.contains(event.relatedTarget as Node | null)) return
      closePreviewAfterDelay()
    }
    const onKeyDown = (event: Event) => {
      if (!(event instanceof KeyboardEvent) || event.key !== 'Escape' || !expanded) return
      event.preventDefault()
      collapse()
      // Restore focus to the remaining control after hiding the native tabs.
      requestAnimationFrame(() => triggerRef.current?.focus())
    }
    header.addEventListener('pointerenter', previewAfterDelay)
    header.addEventListener('pointerleave', closePreviewAfterDelay)
    header.addEventListener('focusin', onFocus)
    header.addEventListener('focusout', onBlur)
    header.addEventListener('keydown', onKeyDown)
    return () => {
      header.removeEventListener('pointerenter', previewAfterDelay)
      header.removeEventListener('pointerleave', closePreviewAfterDelay)
      header.removeEventListener('focusin', onFocus)
      header.removeEventListener('focusout', onBlur)
      header.removeEventListener('keydown', onKeyDown)
    }
  }, [expanded, previewAfterDelay, closePreviewAfterDelay, keepPreviewOpen, collapse])

  return (
    <div
      ref={actionRef}
      data-dock-expanded={expanded}
      data-testid="dock-group-disclosure"
      className="flex h-8 w-8 shrink-0 items-center justify-center"
    >
      {expanded ? (
        <Button
          type="button"
          variant="ghost"
          size="icon"
          aria-label={t(disclosure.pinned ? 'tabs.collapse' : 'tabs.pinOpen')}
          className="relative z-10 size-8 rounded-lg text-muted-foreground hover:bg-muted hover:text-foreground"
          onPointerDown={(event) => event.stopPropagation()}
          onClick={disclosure.pinned ? collapse : disclosure.pinOpen}
        >
          {disclosure.pinned ? (
            <PanelTopClose aria-hidden="true" className="size-3.5" />
          ) : (
            <Pin aria-hidden="true" className="size-3.5" />
          )}
        </Button>
      ) : (
        <Button
          ref={triggerRef}
          type="button"
          variant="outline"
          size="sm"
          aria-label={`${t('tabs.showOpenFiles')}: ${label}`}
          aria-expanded={false}
          className="absolute left-1/2 top-1 z-10 h-7 w-max max-w-[min(16rem,calc(100%_-_1.5rem))] -translate-x-1/2 gap-1.5 rounded-full border-border/60 bg-background/88 px-3 text-xs font-normal text-muted-foreground shadow-sm backdrop-blur-xl transition-[background-color,color,box-shadow] duration-[180ms] ease-out hover:bg-background hover:text-foreground hover:shadow-md motion-reduce:transition-none"
          onPointerDown={(event) => event.stopPropagation()}
          onClick={disclosure.pinOpen}
        >
          <DockTabIcon tab={tab} />
          <span className="truncate">{label}</span>
          <span aria-hidden="true" className="size-1.5 shrink-0 rounded-full bg-primary/70" />
        </Button>
      )}
    </div>
  )
}
