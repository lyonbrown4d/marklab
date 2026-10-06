import { memo, useMemo, type FocusEvent, type KeyboardEvent } from 'react'
import { Files, PanelTopClose, Pin } from 'lucide-react'

import type { SaveState } from '@/app/useEditorBuffer'
import { TabsBarVirtualList } from '@/components/TabsBarVirtualList'
import { getTabLabel, type TabLabelText } from '@/components/TabsBarTab'
import { useTabsDockDisclosure } from '@/components/useTabsDockDisclosure'
import { Button } from '@/components/ui/button'
import { Collapsible, CollapsibleContent } from '@/components/ui/collapsible'
import { useI18n } from '@/i18n/useI18n'
import { getWorkspaceTabId } from '@/logic/tabs'
import type { WorkspaceTab } from '@/store/appTypes'

type TabsBarProps = {
  tabs: WorkspaceTab[]
  dirtyPaths: Record<string, true>
  saveStates: Record<string, SaveState>
  activeTabId: string | null
  onOpenTab: (id: string) => void
  onCloseTab: (id: string) => void
  silentSave: boolean
}

const TabsBarComponent = ({
  tabs,
  dirtyPaths,
  saveStates,
  activeTabId,
  onOpenTab,
  onCloseTab,
  silentSave,
}: TabsBarProps) => {
  const { t } = useI18n()
  const disclosure = useTabsDockDisclosure()
  const labels = useMemo<TabLabelText>(
    () => ({
      source: t('editor.modeSource'),
      preview: t('editor.modePreview'),
      diff: t('scm.diffTitle'),
    }),
    [t],
  )
  const activeTab = tabs.find((tab) => getWorkspaceTabId(tab) === activeTabId) ?? tabs[0]
  const activeLabel = activeTab ? getTabLabel(activeTab, labels) : t('tabs.openFiles')

  if (tabs.length === 0) return null

  const handleBlur = (event: FocusEvent<HTMLDivElement>) => {
    if (event.currentTarget.contains(event.relatedTarget)) return
    disclosure.closePreviewAfterDelay()
  }
  const handleKeyDown = (event: KeyboardEvent<HTMLDivElement>) => {
    if (event.key !== 'Escape' || !disclosure.expanded) return
    event.preventDefault()
    disclosure.collapse()
  }

  return (
    <div
      data-testid="tabs-dock"
      className="pointer-events-none absolute inset-x-0 top-1 z-30 flex justify-center px-3"
      onPointerEnter={disclosure.previewAfterDelay}
      onPointerLeave={disclosure.closePreviewAfterDelay}
      onFocusCapture={disclosure.expanded ? disclosure.keepPreviewOpen : undefined}
      onBlurCapture={handleBlur}
      onKeyDown={handleKeyDown}
    >
      <Collapsible
        open={disclosure.expanded}
        className="pointer-events-auto relative flex min-h-11 w-full max-w-[min(56rem,calc(100vw-3rem))] justify-center"
      >
        {!disclosure.expanded ? (
          <Button
            type="button"
            variant="outline"
            size="sm"
            aria-label={`${t('tabs.showOpenFiles')}: ${activeLabel}`}
            aria-expanded="false"
            className="absolute left-1/2 top-0 z-0 h-7 max-w-64 -translate-x-1/2 gap-1.5 rounded-full border-border/60 bg-background/88 px-3 text-xs font-normal text-muted-foreground shadow-sm backdrop-blur-xl transition-[background-color,color,box-shadow] duration-[180ms] ease-out hover:bg-background hover:text-foreground hover:shadow-md motion-reduce:transition-none"
            onClick={disclosure.pinOpen}
          >
            <Files aria-hidden="true" className="size-3.5 shrink-0" />
            <span className="truncate">{activeLabel}</span>
            <span aria-hidden="true" className="size-1.5 shrink-0 rounded-full bg-primary/70" />
          </Button>
        ) : null}
        <CollapsibleContent className="relative z-10 w-full overflow-hidden data-[state=open]:animate-in data-[state=closed]:animate-out data-[state=open]:fade-in-0 data-[state=closed]:fade-out-0 data-[state=open]:slide-in-from-top-1 data-[state=closed]:slide-out-to-top-1 data-[state=open]:duration-[180ms] data-[state=closed]:duration-100 motion-reduce:animate-none">
          <div className="flex h-11 w-full items-center gap-1.5 rounded-xl border border-border/65 bg-background/92 p-1.5 shadow-lg shadow-foreground/10 backdrop-blur-xl">
            <TabsBarVirtualList
              activeTabId={activeTabId}
              baseCloseLabel={t('actions.closeTab')}
              dirtyLabel={t('save.unsaved')}
              dirtyPaths={dirtyPaths}
              errorLabel={t('save.error')}
              labels={labels}
              saveStates={saveStates}
              silentSave={silentSave}
              tabs={tabs}
              tablistLabel={t('tabs.openFiles')}
              onCloseTab={onCloseTab}
              onOpenTab={onOpenTab}
            />
            <Button
              type="button"
              variant="ghost"
              size="icon"
              aria-label={t(disclosure.pinned ? 'tabs.collapse' : 'tabs.pinOpen')}
              className="size-8 shrink-0 rounded-lg text-muted-foreground hover:bg-muted hover:text-foreground"
              onClick={disclosure.pinned ? disclosure.collapse : disclosure.pinOpen}
            >
              {disclosure.pinned ? (
                <PanelTopClose aria-hidden="true" className="size-3.5" />
              ) : (
                <Pin aria-hidden="true" className="size-3.5" />
              )}
            </Button>
          </div>
        </CollapsibleContent>
      </Collapsible>
    </div>
  )
}

export default memo(TabsBarComponent)
