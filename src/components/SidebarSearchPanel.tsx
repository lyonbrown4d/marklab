import { useState } from 'react'
import { Search } from 'lucide-react'
import { Input } from '@/components/ui/input'
import { SidebarGroup, SidebarGroupContent, SidebarGroupLabel } from '@/components/ui/sidebar'
import FullTextSearchPanel from '@/components/FullTextSearchPanel'
import type { SidebarSearchPanelProps } from '@/components/sidebarPanelTypes'
import { useI18n } from '@/i18n/useI18n'

const SidebarSearchPanel = ({ onOpenSearchResult }: SidebarSearchPanelProps) => {
  const { t } = useI18n()
  const [query, setQuery] = useState('')

  return (
    <SidebarGroup className="sidebar-section flex min-h-0 flex-1 flex-col rounded-md p-1">
      <SidebarGroupLabel className="sidebar-section-header flex h-8 items-center gap-2 px-2 text-[11px] uppercase">
        <Search className="h-3.5 w-3.5" />
        <span>{t('sidebar.searchAction')}</span>
      </SidebarGroupLabel>
      <SidebarGroupContent className="flex min-h-0 flex-1 flex-col gap-2">
        <Input
          value={query}
          onChange={(event) => setQuery(event.target.value)}
          placeholder={t('search.fullText')}
          className="h-7 rounded-md border-sidebar-border bg-background/70 text-xs shadow-sm"
        />
        <FullTextSearchPanel query={query} onOpenResult={onOpenSearchResult} />
      </SidebarGroupContent>
    </SidebarGroup>
  )
}

export default SidebarSearchPanel
