import { GitGraph, Layers3, RefreshCw, Terminal } from 'lucide-react'
import { CommandGroup, CommandItem, CommandShortcut } from '@/components/ui/command'
import { useI18n } from '@/i18n/useI18n'
import type { MarkdownCollectionSummary } from '@/logic/markdownCollections'
import { preloadAllPagesView, preloadGraphView } from '@/lib/preloadFeatures'

type CommandWorkspaceSectionProps = {
  collections: MarkdownCollectionSummary[]
  searchIndexRebuilding: boolean
  onAction: (id: string) => void
}

const CommandWorkspaceSection = ({
  collections,
  searchIndexRebuilding,
  onAction,
}: CommandWorkspaceSectionProps) => {
  const { t } = useI18n()

  return (
    <CommandGroup heading={t('menu.workspace')}>
      <CommandItem
        onFocus={preloadAllPagesView}
        onMouseEnter={preloadAllPagesView}
        value="all pages workspace pages collections database"
        onSelect={() => onAction('workspace.open_pages')}
      >
        <Layers3 className="h-4 w-4" />
        {t('actions.openAllPages')}
      </CommandItem>
      <CommandItem
        onFocus={preloadGraphView}
        onMouseEnter={preloadGraphView}
        value="workspace graph knowledge graph mindmap react flow"
        onSelect={() => onAction('workspace.open_graph')}
      >
        <GitGraph className="h-4 w-4" />
        {t('actions.openWorkspaceGraph')}
      </CommandItem>
      {collections.map((collection) => (
        <CommandItem
          key={collection.id}
          onFocus={preloadAllPagesView}
          onMouseEnter={preloadAllPagesView}
          value={`collection ${collection.id} ${t(collection.labelKey)}`}
          onSelect={() => onAction(`collection.open:${collection.id}`)}
        >
          <Layers3 className="h-4 w-4" />
          <span className="truncate">{t(collection.labelKey)}</span>
          <CommandShortcut>{collection.count}</CommandShortcut>
        </CommandItem>
      ))}
      <CommandItem value="terminal shell command line" onSelect={() => onAction('terminal.open')}>
        <Terminal className="h-4 w-4" />
        {t('actions.openTerminal')}
      </CommandItem>
      <CommandItem
        disabled={searchIndexRebuilding}
        value="rebuild search index full text refresh"
        onSelect={() => onAction('workspace.rebuild_search_index')}
      >
        <RefreshCw className="h-4 w-4" />
        {searchIndexRebuilding
          ? t('actions.rebuildingSearchIndex')
          : t('actions.rebuildSearchIndex')}
      </CommandItem>
    </CommandGroup>
  )
}

export default CommandWorkspaceSection
