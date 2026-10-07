import { type KeyboardEvent, useEffect, useRef, useState } from 'react'
import { Search } from 'lucide-react'
import SidebarPanelFrame from '@/components/SidebarPanelFrame'
import AppSearchField from '@/components/AppSearchField'
import FullTextSearchPanel, {
  type FullTextSearchPanelHandle,
} from '@/components/FullTextSearchPanel'
import type { SidebarSearchPanelProps } from '@/components/sidebarPanelTypes'
import { useI18n } from '@/i18n/useI18n'
import SearchOptionsBar from '@/components/sidebar-search/SearchOptionsBar'
import type { WorkspaceSearchOptions } from '@/components/sidebar-search/searchModel'

const DEFAULT_SEARCH_OPTIONS: WorkspaceSearchOptions = {
  caseSensitive: false,
  wholeWord: false,
  useRegex: false,
}

const SidebarSearchPanel = ({
  focusWorkspaceSearchRequest,
  onOpenSearchResult,
  rootKind,
  rootPath,
}: SidebarSearchPanelProps) => {
  const { t } = useI18n()
  const [query, setQuery] = useState('')
  const [options, setOptions] = useState(DEFAULT_SEARCH_OPTIONS)
  const inputRef = useRef<HTMLInputElement>(null)
  const resultsRef = useRef<FullTextSearchPanelHandle>(null)

  useEffect(() => {
    if (focusWorkspaceSearchRequest <= 0) return
    inputRef.current?.focus()
  }, [focusWorkspaceSearchRequest])

  const handleQueryKeyDown = (event: KeyboardEvent<HTMLInputElement>) => {
    if (!['ArrowDown', 'ArrowUp', 'Enter', 'Escape'].includes(event.key)) return
    if (resultsRef.current?.handleKeyDown(event.key)) event.preventDefault()
  }

  const title = t('search.workspaceTitle')

  return (
    <SidebarPanelFrame
      panel="search"
      ariaLabel={title}
      className="flex-1"
      contentClassName="flex-1 gap-1.5"
      icon={Search}
      title={title}
    >
      <AppSearchField
        ref={inputRef}
        aria-label={t('search.fullText')}
        value={query}
        onChange={(event) => setQuery(event.target.value)}
        onKeyDown={handleQueryKeyDown}
        onClear={() => setQuery('')}
        clearLabel={t('search.clear')}
        placeholder={t('search.fullText')}
        className="border-sidebar-border bg-sidebar/70 focus-visible:ring-sidebar-ring/25"
      />
      <SearchOptionsBar
        labels={{
          caseSensitive: t('search.caseSensitive'),
          group: t('search.options'),
          regex: t('search.regex'),
          wholeWord: t('search.wholeWord'),
        }}
        onChange={setOptions}
        value={options}
      />
      <FullTextSearchPanel
        ref={resultsRef}
        onRequestSearchFocus={() => inputRef.current?.focus()}
        options={options}
        query={query}
        workspaceKey={`${rootKind}:${rootPath}`}
        onOpenResult={onOpenSearchResult}
      />
    </SidebarPanelFrame>
  )
}

export default SidebarSearchPanel
