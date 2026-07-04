import { memo, useCallback, type KeyboardEvent, type MouseEvent } from 'react'
import { Code2, Eye, FileText, GitGraph, X } from 'lucide-react'
import { DocumentAdapterIconView } from '@/components/documentAdapterIcons'
import { Button } from '@/components/ui/button'
import { createFileLabel } from '@/logic/paths'
import type { WorkspaceTab } from '@/store/appTypes'
import { cn } from '@/lib/utils'

export type TabLabelText = {
  workspaceGraph: string
  source: string
  graph: string
  preview: string
  diff: string
}

export const getTabLabel = (tab: WorkspaceTab, labels: TabLabelText) => {
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

export const WorkspaceTabButton = memo(
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
      (event: MouseEvent<HTMLButtonElement>) => {
        event.stopPropagation()
        onCloseTab(id)
      },
      [id, onCloseTab],
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
