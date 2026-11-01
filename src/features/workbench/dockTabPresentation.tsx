import { Code2, Eye, FileText, Network } from 'lucide-react'
import { DocumentAdapterIconView } from '@/components/documentAdapterIcons'
import { getTabLabel, type TabLabelText } from '@/components/TabsBarTab'
import type { DockTab } from '@/features/workbench/dockTypes'
import { documentAtRoute } from '@/features/workbench/workbenchState'

export const getDockTabPresentation = (
  tab: DockTab | undefined,
  fallback: string,
  labels: TabLabelText,
) => {
  const document = tab ? documentAtRoute(tab.route) : null
  return {
    label: document ? getTabLabel({ kind: 'file', ...document }, labels) : (tab?.title ?? fallback),
    document,
  }
}

export const DockTabIcon = ({ tab }: { tab: DockTab | undefined }) => {
  const document = tab ? documentAtRoute(tab.route) : null
  const className = 'size-3.5 shrink-0 text-muted-foreground'
  if (document?.view === 'preview') {
    return (
      <span aria-hidden="true" className="inline-flex shrink-0">
        <DocumentAdapterIconView path={document.path} fallback={Eye} className={className} />
      </span>
    )
  }
  const Icon = tab?.kind === 'graph' ? Network : document?.view === 'source' ? Code2 : FileText
  return <Icon aria-hidden="true" className={className} />
}
