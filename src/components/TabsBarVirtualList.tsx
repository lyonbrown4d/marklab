import { useCallback, useEffect, useMemo, useRef, type KeyboardEvent, type WheelEvent } from 'react'
import { useVirtualizer } from '@tanstack/react-virtual'

import { getTabLabel, WorkspaceTabButton, type TabLabelText } from '@/components/TabsBarTab'
import type { SaveState } from '@/app/useEditorBuffer'
import { getWorkspaceTabId } from '@/logic/tabs'
import type { WorkspaceTab } from '@/store/appTypes'

const TAB_VIRTUAL_SIZE = 136
const TAB_VISUAL_WIDTH = 132

type TabsBarVirtualListProps = {
  activeTabId: string | null
  baseCloseLabel: string
  dirtyLabel: string
  dirtyPaths: Record<string, true>
  errorLabel: string
  labels: TabLabelText
  saveStates: Record<string, SaveState>
  silentSave: boolean
  tabs: WorkspaceTab[]
  tablistLabel: string
  onCloseTab: (id: string) => void
  onOpenTab: (id: string) => void
}

export const TabsBarVirtualList = ({
  activeTabId,
  baseCloseLabel,
  dirtyLabel,
  dirtyPaths,
  errorLabel,
  labels,
  saveStates,
  silentSave,
  tabs,
  tablistLabel,
  onCloseTab,
  onOpenTab,
}: TabsBarVirtualListProps) => {
  const viewportRef = useRef<HTMLDivElement | null>(null)
  const tabIds = useMemo(() => tabs.map(getWorkspaceTabId), [tabs])
  const activeIndex = activeTabId ? tabIds.indexOf(activeTabId) : -1
  // TanStack Virtual exposes imperative methods that React Compiler cannot memoize safely.
  // eslint-disable-next-line react-hooks/incompatible-library
  const virtualizer = useVirtualizer({
    count: tabs.length,
    horizontal: true,
    initialRect: { height: 32, width: 720 },
    getItemKey: (index) => tabIds[index] ?? index,
    getScrollElement: () => viewportRef.current,
    estimateSize: () => TAB_VIRTUAL_SIZE,
    overscan: 2,
  })

  useEffect(() => {
    if (activeIndex >= 0) virtualizer.scrollToIndex(activeIndex, { align: 'auto' })
  }, [activeIndex, virtualizer])

  const focusTab = useCallback((id: string) => {
    window.requestAnimationFrame(() => {
      const target = Array.from(
        viewportRef.current?.querySelectorAll<HTMLElement>('[role="tab"][data-tab-id]') ?? [],
      ).find((element) => element.dataset.tabId === id)
      target?.focus({ preventScroll: true })
    })
  }, [])

  const handleKeyDown = useCallback(
    (event: KeyboardEvent<HTMLDivElement>) => {
      if (!['ArrowLeft', 'ArrowRight', 'Home', 'End'].includes(event.key)) return
      const currentId = (event.target as HTMLElement).closest<HTMLElement>('[data-tab-id]')?.dataset
        .tabId
      const currentIndex = currentId ? tabIds.indexOf(currentId) : activeIndex
      if (currentIndex < 0) return
      const nextIndex =
        event.key === 'Home'
          ? 0
          : event.key === 'End'
            ? tabs.length - 1
            : event.key === 'ArrowLeft'
              ? (currentIndex - 1 + tabs.length) % tabs.length
              : (currentIndex + 1) % tabs.length
      const nextId = tabIds[nextIndex]
      if (!nextId) return
      event.preventDefault()
      virtualizer.scrollToIndex(nextIndex, { align: 'auto' })
      onOpenTab(nextId)
      focusTab(nextId)
    },
    [activeIndex, focusTab, onOpenTab, tabIds, tabs.length, virtualizer],
  )

  const handleWheel = useCallback((event: WheelEvent<HTMLDivElement>) => {
    const viewport = event.currentTarget
    if (viewport.scrollWidth <= viewport.clientWidth) return
    if (Math.abs(event.deltaY) <= Math.abs(event.deltaX)) return
    viewport.scrollLeft += event.deltaY
    event.preventDefault()
  }, [])

  return (
    <div
      ref={viewportRef}
      role="tablist"
      aria-label={tablistLabel}
      className="tabs-scrollbar min-w-0 flex-1 overflow-x-auto overflow-y-hidden"
      onKeyDown={handleKeyDown}
      onWheel={handleWheel}
    >
      <div
        data-testid="virtual-tabs-track"
        className="relative h-8"
        style={{ width: virtualizer.getTotalSize() }}
      >
        {virtualizer.getVirtualItems().map((virtualItem) => {
          const tab = tabs[virtualItem.index]
          const id = tabIds[virtualItem.index]
          if (!tab || !id) return null
          const label = getTabLabel(tab, labels)
          const saveState = tab.kind === 'file' ? saveStates[tab.path] : undefined
          const isDirty = tab.kind === 'file' && !silentSave && Boolean(dirtyPaths[tab.path])
          const hasError = saveState?.status === 'error'
          const isActive = id === activeTabId
          const tabAriaLabel = [label, isDirty ? dirtyLabel : null, hasError ? errorLabel : null]
            .filter(Boolean)
            .join(' - ')

          return (
            <div
              key={virtualItem.key}
              className="absolute left-0 top-0 h-8 pr-1"
              style={{ width: TAB_VIRTUAL_SIZE, transform: `translateX(${virtualItem.start}px)` }}
            >
              <WorkspaceTabButton
                id={id}
                tab={tab}
                width={TAB_VISUAL_WIDTH}
                position={virtualItem.index + 1}
                setSize={tabs.length}
                isActive={isActive}
                isDirty={isDirty}
                hasError={hasError}
                label={label}
                tabAriaLabel={tabAriaLabel}
                closeLabel={`${baseCloseLabel}: ${label}`}
                dirtyLabel={dirtyLabel}
                errorLabel={errorLabel}
                errorMessage={saveState?.message}
                onOpenTab={onOpenTab}
                onCloseTab={onCloseTab}
              />
            </div>
          )
        })}
      </div>
    </div>
  )
}
