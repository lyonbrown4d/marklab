import { useEffect, useRef, useState } from 'react'
import { Search } from 'lucide-react'
import SidebarPanelFrame from '@/components/SidebarPanelFrame'
import { Input } from '@/components/ui/input'
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
      <Input
        ref={inputRef}
        aria-label={t('search.fullText')}
        value={query}
        onChange={(event) => setQuery(event.target.value)}
        placeholder={t('search.fullText')}
        className="h-8 border-sidebar-border bg-transparent text-xs shadow-none focus-visible:ring-sidebar-ring"
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
