import { memo, useCallback, type KeyboardEvent, type MouseEvent } from 'react'
import { Code2, Eye, FileText, GitGraph, Globe2, X } from 'lucide-react'
import { DocumentAdapterIconView } from '@/components/documentAdapterIcons'
import { Button } from '@/components/ui/button'
import { createFileLabel } from '@/logic/paths'
import type { WorkspaceTab } from '@/store/appTypes'
import { cn } from '@/lib/utils'

export type TabLabelText = {
  source: string
  preview: string
  diff: string
}

export const getTabLabel = (tab: WorkspaceTab, labels: TabLabelText) => {
  if (tab.kind === 'web') return tab.title
  const label = createFileLabel(tab.path)
  if (tab.kind === 'file') {
    if (tab.view === 'source') return `${label} · ${labels.source}`
    if (tab.view === 'preview') return `${label} · ${labels.preview}`
    return label
  }
  return `${label} · ${labels.diff}`
}

const renderTabIcon = (tab: WorkspaceTab) => {
  const iconClassName = 'size-3.5 shrink-0'

  if (tab.kind === 'git-diff') {
    return <GitGraph aria-hidden="true" className={iconClassName} />
  }
  if (tab.kind === 'web') {
    return <Globe2 aria-hidden="true" className={iconClassName} />
  }
  if (tab.view === 'source') {
    return <Code2 aria-hidden="true" className={iconClassName} />
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
  width: number
  position: number
  setSize: number
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

export const WorkspaceTabButton = memo(
  ({
    id,
    tab,
    width,
    position,
    setSize,
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
      (event: MouseEvent<HTMLButtonElement>) => {
        event.stopPropagation()
        onCloseTab(id)
      },
      [id, onCloseTab],
    )

    return (
      <div
        role="tab"
        tabIndex={isActive ? 0 : -1}
        aria-label={tabAriaLabel}
        aria-posinset={position}
        aria-selected={isActive}
        aria-setsize={setSize}
        data-state={isActive ? 'active' : 'inactive'}
        data-tab-id={id}
        className="tab-item group relative inline-flex h-8 shrink-0 cursor-default select-none items-center gap-1.5 rounded-lg px-2 text-xs text-muted-foreground outline-none transition-[background-color,color,box-shadow] duration-150 hover:bg-muted/80 hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring data-[state=active]:bg-muted data-[state=active]:text-foreground data-[state=active]:shadow-sm after:absolute after:bottom-0.5 after:left-3 after:right-3 after:hidden after:h-0.5 after:rounded-full after:bg-primary data-[state=active]:after:block motion-reduce:transition-none"
        style={{ width }}
        title={tab.kind === 'file' || tab.kind === 'git-diff' ? tab.path : label}
        onClick={openTab}
        onKeyDown={handleTabKeyDown}
      >
        {renderTabIcon(tab)}
        <span className="min-w-0 flex-1 truncate">{label}</span>
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
        <Button
          type="button"
          variant="ghost"
          size="icon"
          className={cn(
            'ml-0.5 size-5 rounded p-0.5 opacity-70 transition-opacity duration-150 hover:bg-muted hover:opacity-100 focus-visible:opacity-100 md:opacity-0 md:group-focus-within:opacity-100 md:group-hover:opacity-100',
            isActive && 'opacity-100 md:opacity-100',
          )}
          onClick={closeTab}
          aria-label={closeLabel}
          title={closeLabel}
        >
          <X aria-hidden="true" data-icon="icon" />
        </Button>
      </div>
    )
  },
  (prev, next) =>
    prev.id === next.id &&
    prev.tab === next.tab &&
    prev.width === next.width &&
    prev.position === next.position &&
    prev.setSize === next.setSize &&
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
