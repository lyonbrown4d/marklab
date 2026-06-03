import { SearchX } from 'lucide-react'
import { useCallback, useState } from 'react'
import { keepPreviousData, useQuery } from '@tanstack/react-query'
import { useDebounce } from 'ahooks'
import AppCommandDialog from '@/components/AppCommandDialog'
import { CommandEmpty, CommandInput, CommandList } from '@/components/ui/command'
import { useI18n } from '@/i18n/useI18n'
import { fsApi, type FsSearchResult } from '@/services/fsApi'
import { isDesktopRuntime } from '@/runtime/environment'
import CommandActionSections from '@/components/command/CommandActionSections'
import CommandSearchHistory from '@/components/command/CommandSearchHistory'
import CommandSearchResults, {
  type CommandFile,
  type CommandHeading,
} from '@/components/command/CommandSearchResults'
import { useCommandSearchHistory } from '@/components/command/useCommandSearchHistory'

type TitlebarCommandDialogProps = {
  open: boolean
  onOpenChange: (open: boolean) => void
  files: CommandFile[]
  headings: CommandHeading[]
  onOpenFile: (path: string) => void
  onOpenHeading: (path: string, slug: string) => void
  onOpenSearchResult: (result: FsSearchResult) => void
  onAction: (id: string) => void
  canCreateWorkspaceEntries: boolean
  workspaceIndexed: boolean
  indexedFileCount: number
  searchIndexRebuilding: boolean
}

const TitlebarCommandDialog = ({
  open,
  onOpenChange,
  files,
  headings,
  onOpenFile,
  onOpenHeading,
  onOpenSearchResult,
  onAction,
  canCreateWorkspaceEntries,
  workspaceIndexed,
  indexedFileCount,
  searchIndexRebuilding,
}: TitlebarCommandDialogProps) => {
  const { t } = useI18n()
  const [query, setQuery] = useState('')
  const trimmedQuery = query.trim()
  const debouncedQuery = useDebounce(trimmedQuery, { wait: 160 })
  const { searches, rememberSearch, clearSearchHistory } = useCommandSearchHistory()
  const fullTextSearch = useQuery({
    queryKey: ['command-workspace-search', debouncedQuery],
    queryFn: () => fsApi.searchWorkspace(debouncedQuery, 8),
    enabled: open && isDesktopRuntime() && debouncedQuery.length >= 2,
    placeholderData: keepPreviousData,
    staleTime: 5_000,
  })
  const fullTextResults = debouncedQuery === trimmedQuery ? (fullTextSearch.data ?? []) : []
  const emptyQueryLabel =
    trimmedQuery.length > 0 ? `No results for "${trimmedQuery}"` : 'No command results'
  const handleOpenFile = useCallback(
    (path: string) => {
      rememberSearch(trimmedQuery)
      onOpenFile(path)
    },
    [onOpenFile, rememberSearch, trimmedQuery],
  )
  const handleOpenHeading = useCallback(
    (path: string, slug: string) => {
      rememberSearch(trimmedQuery)
      onOpenHeading(path, slug)
    },
    [onOpenHeading, rememberSearch, trimmedQuery],
  )
  const handleOpenSearchResult = useCallback(
    (result: FsSearchResult) => {
      rememberSearch(trimmedQuery)
      onOpenSearchResult(result)
    },
    [onOpenSearchResult, rememberSearch, trimmedQuery],
  )

  return (
    <AppCommandDialog open={open} onOpenChange={onOpenChange}>
      <CommandInput value={query} onValueChange={setQuery} placeholder={t('sidebar.search')} />
      <CommandList>
        <CommandEmpty>
          <div className="flex flex-col items-center gap-1 px-6 py-8 text-center">
            <SearchX className="h-5 w-5 text-muted-foreground" />
            <p className="text-sm text-foreground">{emptyQueryLabel}</p>
            <p className="text-xs text-muted-foreground">
              Try a title, path fragment, heading, command, or a 2+ character full-text query.
            </p>
          </div>
        </CommandEmpty>
        <CommandSearchHistory
          query={query}
          searches={searches}
          onSelectSearch={setQuery}
          onClearSearches={clearSearchHistory}
        />
        <CommandSearchResults
          query={query}
          files={files}
          headings={headings}
          fullTextResults={fullTextResults}
          fullTextFetching={fullTextSearch.isFetching}
          fullTextError={fullTextSearch.isError}
          workspaceIndexed={workspaceIndexed}
          indexedFileCount={indexedFileCount}
          searchIndexRebuilding={searchIndexRebuilding}
          onOpenFile={handleOpenFile}
          onOpenHeading={handleOpenHeading}
          onOpenSearchResult={handleOpenSearchResult}
        />
        <CommandActionSections
          canCreateWorkspaceEntries={canCreateWorkspaceEntries}
          searchIndexRebuilding={searchIndexRebuilding}
          onAction={onAction}
        />
      </CommandList>
    </AppCommandDialog>
  )
}

export default TitlebarCommandDialog
