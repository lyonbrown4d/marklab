import {
  memo,
  useCallback,
  useEffect,
  useMemo,
  useRef,
  type KeyboardEvent,
  type WheelEvent,
} from 'react'
import { getTabLabel, WorkspaceTabButton } from '@/components/TabsBarTab'
import { TabsBarViewModeControls } from '@/components/TabsBarViewModeControls'
import { useI18n } from '@/i18n/useI18n'
import type { ViewMode, WorkspaceTab } from '@/store/appTypes'
import type { SaveState } from '@/app/useEditorBuffer'
import { getWorkspaceTabId } from '@/logic/tabs'

type TabsBarProps = {
  tabs: WorkspaceTab[]
  dirtyPaths: Record<string, true>
  saveStates: Record<string, SaveState>
  activeTabId: string | null
  onOpenTab: (id: string) => void
  onCloseTab: (id: string) => void
  viewMode: ViewMode
  onChangeView: (mode: ViewMode) => void
  silentSave: boolean
}

const TabsBarComponent = ({
  tabs,
  dirtyPaths,
  saveStates,
  activeTabId,
  onOpenTab,
  onCloseTab,
  viewMode,
  onChangeView,
  silentSave,
}: TabsBarProps) => {
  const { t } = useI18n()
  const tabsViewportRef = useRef<HTMLDivElement | null>(null)
  const compact = tabs.length >= 8
  const activeTab = tabs.find((tab) => getWorkspaceTabId(tab) === activeTabId) ?? null
  const fileTabActive = activeTab?.kind === 'file' && activeTab.view !== 'preview'
  const tabLabels = useMemo(
    () => ({
      workspaceGraph: t('tabs.workspaceGraph'),
      source: t('editor.modeSource'),
      graph: t('tabs.graph'),
      preview: t('editor.modePreview'),
      diff: t('scm.diffTitle'),
    }),
    [t],
  )
  const dirtyLabel = t('save.unsaved')
  const errorLabel = t('save.error')
  const baseCloseLabel = t('actions.closeTab')

  const handleTabsWheel = useCallback((event: WheelEvent<HTMLDivElement>) => {
    const viewport = event.currentTarget
    if (viewport.scrollWidth <= viewport.clientWidth) return
    if (Math.abs(event.deltaY) <= Math.abs(event.deltaX)) return
    viewport.scrollLeft += event.deltaY
    event.preventDefault()
  }, [])

  const handleTabListKeyDown = useCallback(
    (event: KeyboardEvent<HTMLDivElement>) => {
      if (
        event.key !== 'ArrowLeft' &&
        event.key !== 'ArrowRight' &&
        event.key !== 'Home' &&
        event.key !== 'End'
      ) {
        return
      }

      const tabElements = Array.from(
        event.currentTarget.querySelectorAll<HTMLElement>('[role="tab"][data-tab-id]'),
      )
      const currentTab = (event.target as HTMLElement).closest<HTMLElement>('[role="tab"]')
      const currentIndex = currentTab ? tabElements.indexOf(currentTab) : -1
      if (currentIndex < 0 || tabElements.length === 0) return

      const nextIndex =
        event.key === 'Home'
          ? 0
          : event.key === 'End'
            ? tabElements.length - 1
            : event.key === 'ArrowLeft'
              ? (currentIndex - 1 + tabElements.length) % tabElements.length
              : (currentIndex + 1) % tabElements.length
      const nextTab = tabElements[nextIndex]
      const nextId = nextTab.dataset.tabId
      if (!nextId) return

      event.preventDefault()
      nextTab.focus()
      onOpenTab(nextId)
    },
    [onOpenTab],
  )

  useEffect(() => {
    if (!activeTabId) return
    const viewport = tabsViewportRef.current
    const activeTrigger = Array.from(
      viewport?.querySelectorAll<HTMLElement>('[data-tab-id]') ?? [],
    ).find((trigger) => trigger.dataset.tabId === activeTabId)
    activeTrigger?.scrollIntoView({ block: 'nearest', inline: 'nearest' })
  }, [activeTabId])

  return (
    <div className="tab-strip flex h-10 items-center gap-2 border-b border-border/80 px-2">
      <div className="min-w-0 flex-1">
        <div
          ref={tabsViewportRef}
          className="tabs-scrollbar w-full overflow-x-auto overflow-y-hidden whitespace-nowrap"
          onWheel={handleTabsWheel}
        >
          <div
            role="tablist"
            aria-label={t('tabs.openFiles')}
            className="inline-flex h-8 w-max min-w-full justify-start"
            onKeyDown={handleTabListKeyDown}
          >
            {tabs.map((tab) => {
              const id = getWorkspaceTabId(tab)
              const label = getTabLabel(tab, tabLabels)
              const saveState = tab.kind === 'file' ? saveStates[tab.path] : undefined
              const isDirty = tab.kind === 'file' && !silentSave && Boolean(dirtyPaths[tab.path])
              const hasError = saveState?.status === 'error'
              const isActive = id === activeTabId
              const tabAriaLabel = [
                label,
                isDirty ? dirtyLabel : null,
                hasError ? errorLabel : null,
              ]
                .filter(Boolean)
                .join(' - ')
              const closeLabel = `${baseCloseLabel}: ${label}`

              return (
                <WorkspaceTabButton
                  key={id}
                  id={id}
                  tab={tab}
                  compact={compact}
                  isActive={isActive}
                  isDirty={isDirty}
                  hasError={hasError}
                  label={label}
                  tabAriaLabel={tabAriaLabel}
                  closeLabel={closeLabel}
                  dirtyLabel={dirtyLabel}
                  errorLabel={errorLabel}
                  errorMessage={saveState?.message}
                  onOpenTab={onOpenTab}
                  onCloseTab={onCloseTab}
                />
              )
            })}
          </div>
        </div>
      </div>
      <TabsBarViewModeControls
        active={fileTabActive}
        graphLabel={tabLabels.graph}
        sourceLabel={tabLabels.source}
        viewMode={viewMode}
        wysiwygLabel={t('editor.modeWysiwyg')}
        onChangeView={onChangeView}
      />
    </div>
  )
}

export default memo(TabsBarComponent)
