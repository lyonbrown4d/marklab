import {
  memo,
  useCallback,
  useEffect,
  useMemo,
  useRef,
  type KeyboardEvent,
  type MouseEvent,
  type WheelEvent,
} from 'react'
import { Code2, Eye, FileText, GitGraph, PenLine, X } from 'lucide-react'
import { DocumentAdapterIconView } from '@/components/documentAdapterIcons'
import { Button } from '@/components/ui/button'
import { createFileLabel } from '@/logic/paths'
import { useI18n } from '@/i18n/useI18n'
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip'
import type { ViewMode, WorkspaceTab } from '@/store/appTypes'
import type { SaveState } from '@/app/useEditorBuffer'
import { getWorkspaceTabId } from '@/logic/tabs'
import { preloadGraphView, preloadSourceEditor, preloadWysiwygEditor } from '@/lib/preloadFeatures'
import { cn } from '@/lib/utils'

type TabLabelText = {
  workspaceGraph: string
  source: string
  graph: string
  preview: string
  diff: string
}

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

const getTabLabel = (tab: WorkspaceTab, labels: TabLabelText) => {
  if (tab.kind === 'workspace-graph') return labels.workspaceGraph
  const label = createFileLabel(tab.path)
  if (tab.kind === 'file') {
    if (tab.view === 'source') return `${label} · ${labels.source}`
    if (tab.view === 'graph') return `${label} · ${labels.graph}`
    if (tab.view === 'preview') return `${label} · ${labels.preview}`
    return label
  }
  return `${label} · ${labels.diff}`
}

const renderTabIcon = (tab: WorkspaceTab) => {
  const iconClassName = 'size-3.5 shrink-0'

  if (tab.kind === 'workspace-graph') {
    return <GitGraph aria-hidden="true" className={iconClassName} />
  }
  if (tab.kind === 'git-diff') {
    return <GitGraph aria-hidden="true" className={iconClassName} />
  }
  if (tab.view === 'source') {
    return <Code2 aria-hidden="true" className={iconClassName} />
  }
  if (tab.view === 'graph') {
    return <GitGraph aria-hidden="true" className={iconClassName} />
  }
  if (tab.view === 'preview') {
    return (
      <span aria-hidden="true" className="inline-flex shrink-0">
        <DocumentAdapterIconView path={tab.path} fallback={Eye} className={iconClassName} />
      </span>
    )
  }
  return <FileText aria-hidden="true" className={iconClassName} />
}

type WorkspaceTabButtonProps = {
  id: string
  tab: WorkspaceTab
  compact: boolean
  isActive: boolean
  isDirty: boolean
  hasError: boolean
  label: string
  tabAriaLabel: string
  closeLabel: string
  dirtyLabel: string
  errorLabel: string
  errorMessage?: string
  onOpenTab: (id: string) => void
  onCloseTab: (id: string) => void
}

const WorkspaceTabButton = memo(
  ({
    id,
    tab,
    compact,
    isActive,
    isDirty,
    hasError,
    label,
    tabAriaLabel,
    closeLabel,
    dirtyLabel,
    errorLabel,
    errorMessage,
    onOpenTab,
    onCloseTab,
  }: WorkspaceTabButtonProps) => {
    const openTab = useCallback(() => {
      onOpenTab(id)
    }, [id, onOpenTab])

    const handleTabKeyDown = useCallback(
      (event: KeyboardEvent<HTMLDivElement>) => {
        if (event.key !== 'Enter' && event.key !== ' ') return
        event.preventDefault()
        onOpenTab(id)
      },
      [id, onOpenTab],
    )

    const closeTab = useCallback(
      (event: MouseEvent<HTMLSpanElement> | KeyboardEvent<HTMLSpanElement>) => {
        event.stopPropagation()
        onCloseTab(id)
      },
      [id, onCloseTab],
    )

    const handleCloseKeyDown = useCallback(
      (event: KeyboardEvent<HTMLSpanElement>) => {
        if (event.key !== 'Enter' && event.key !== ' ') return
        event.preventDefault()
        closeTab(event)
      },
      [closeTab],
    )

    return (
      <div
        role="tab"
        tabIndex={0}
        aria-label={tabAriaLabel}
        aria-selected={isActive}
        data-state={isActive ? 'active' : 'inactive'}
        data-tab-id={id}
        className="tab-item group relative inline-flex h-8 shrink-0 cursor-default select-none items-center gap-1.5 rounded-md px-2 text-xs text-muted-foreground outline-none transition-colors hover:bg-muted/70 hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring data-[state=active]:bg-background data-[state=active]:text-foreground data-[state=active]:shadow-sm after:absolute after:bottom-0 after:left-2 after:right-2 after:hidden after:h-0.5 after:rounded-full after:bg-primary data-[state=active]:after:block"
        title={tab.kind === 'workspace-graph' ? label : tab.path}
        onClick={openTab}
        onKeyDown={handleTabKeyDown}
      >
        {renderTabIcon(tab)}
        <span className={cn('truncate', compact ? 'max-w-[86px]' : 'max-w-[160px]')}>
          {compact && label.length > 12 ? `${label.slice(0, 11)}…` : label}
        </span>
        {isDirty && (
          <span
            aria-label={dirtyLabel}
            className="size-1.5 rounded-full bg-status-warning"
            title={dirtyLabel}
          />
        )}
        {hasError && (
          <span
            aria-label={errorLabel}
            className="size-1.5 rounded-full bg-destructive"
            title={errorMessage ?? errorLabel}
          />
        )}
        <span
          role="button"
          tabIndex={0}
          className={cn(
            'ml-0.5 rounded p-0.5 opacity-70 outline-none transition-opacity duration-150 hover:bg-muted hover:opacity-100 focus-visible:opacity-100 focus-visible:ring-2 focus-visible:ring-ring md:opacity-0 md:group-focus-within:opacity-100 md:group-hover:opacity-100',
            isActive && 'opacity-100 md:opacity-100',
          )}
          onClick={closeTab}
          onKeyDown={handleCloseKeyDown}
          aria-label={closeLabel}
          title={closeLabel}
        >
          <X aria-hidden="true" className="size-3.5" />
        </span>
      </div>
    )
  },
  (prev, next) =>
    prev.id === next.id &&
    prev.tab === next.tab &&
    prev.compact === next.compact &&
    prev.isActive === next.isActive &&
    prev.isDirty === next.isDirty &&
    prev.hasError === next.hasError &&
    prev.label === next.label &&
    prev.tabAriaLabel === next.tabAriaLabel &&
    prev.closeLabel === next.closeLabel &&
    prev.dirtyLabel === next.dirtyLabel &&
    prev.errorLabel === next.errorLabel &&
    prev.errorMessage === next.errorMessage &&
    prev.onOpenTab === next.onOpenTab &&
    prev.onCloseTab === next.onCloseTab,
)

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
      <div className="hidden shrink-0 items-center gap-2 md:flex">
        <TooltipProvider>
          <div className="flex items-center gap-0.5 rounded-md border border-border bg-background/70 p-0.5 shadow-sm">
            <Tooltip>
              <TooltipTrigger asChild>
                <Button
                  type="button"
                  variant={viewMode === 'wysiwyg' ? 'secondary' : 'ghost'}
                  size="icon"
                  className="size-6 rounded"
                  aria-label={t('editor.modeWysiwyg')}
                  aria-pressed={viewMode === 'wysiwyg'}
                  disabled={!fileTabActive}
                  onFocus={preloadWysiwygEditor}
                  onMouseEnter={preloadWysiwygEditor}
                  onClick={() => onChangeView('wysiwyg')}
                >
                  <PenLine aria-hidden="true" data-icon="inline-start" />
                </Button>
              </TooltipTrigger>
              <TooltipContent>{t('editor.modeWysiwyg')}</TooltipContent>
            </Tooltip>
            <Tooltip>
              <TooltipTrigger asChild>
                <Button
                  type="button"
                  variant={viewMode === 'source' ? 'secondary' : 'ghost'}
                  size="icon"
                  className="size-6 rounded"
                  aria-label={t('editor.modeSource')}
                  aria-pressed={viewMode === 'source'}
                  disabled={!fileTabActive}
                  onFocus={preloadSourceEditor}
                  onMouseEnter={preloadSourceEditor}
                  onClick={() => onChangeView('source')}
                >
                  <Code2 aria-hidden="true" data-icon="inline-start" />
                </Button>
              </TooltipTrigger>
              <TooltipContent>{t('editor.modeSource')}</TooltipContent>
            </Tooltip>
            <Tooltip>
              <TooltipTrigger asChild>
                <Button
                  type="button"
                  variant={viewMode === 'graph' ? 'secondary' : 'ghost'}
                  size="icon"
                  className="size-6 rounded"
                  aria-label={tabLabels.graph}
                  aria-pressed={viewMode === 'graph'}
                  disabled={!fileTabActive}
                  onFocus={preloadGraphView}
                  onMouseEnter={preloadGraphView}
                  onClick={() => onChangeView('graph')}
                >
                  <GitGraph aria-hidden="true" data-icon="inline-start" />
                </Button>
              </TooltipTrigger>
              <TooltipContent>{tabLabels.graph}</TooltipContent>
            </Tooltip>
          </div>
        </TooltipProvider>
      </div>
    </div>
  )
}

export default memo(TabsBarComponent)
