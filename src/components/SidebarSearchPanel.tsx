import { useEffect, useRef, useState } from 'react'
import { Search } from 'lucide-react'
import SidebarPanelFrame from '@/components/SidebarPanelFrame'
import AppSearchField from '@/components/AppSearchField'
import FullTextSearchPanel from '@/components/FullTextSearchPanel'
import type { SidebarSearchPanelProps } from '@/components/sidebarPanelTypes'
import { useI18n } from '@/i18n/useI18n'

const SidebarSearchPanel = ({
  focusWorkspaceSearchRequest,
  onOpenSearchResult,
  rootKind,
  rootPath,
}: SidebarSearchPanelProps) => {
  const { t } = useI18n()
  const [query, setQuery] = useState('')
  const inputRef = useRef<HTMLInputElement>(null)

  useEffect(() => {
    if (focusWorkspaceSearchRequest <= 0) return
    inputRef.current?.focus()
  }, [focusWorkspaceSearchRequest])

  return (
    <SidebarPanelFrame
      panel="search"
      ariaLabel={t('sidebar.searchAction')}
      className="flex-1"
      contentClassName="flex-1"
      icon={Search}
      title={t('sidebar.searchAction')}
    >
      <AppSearchField
        ref={inputRef}
        aria-label={t('search.fullText')}
        value={query}
        onChange={(event) => setQuery(event.target.value)}
        onClear={() => setQuery('')}
        clearLabel={t('search.clear')}
        placeholder={t('search.fullText')}
        className="border-sidebar-border bg-sidebar/70 focus-visible:ring-sidebar-ring/25"
      />
      <FullTextSearchPanel
        query={query}
        workspaceKey={`${rootKind}:${rootPath}`}
        onOpenResult={onOpenSearchResult}
      />
    </SidebarPanelFrame>
  )
}

export default SidebarSearchPanel
