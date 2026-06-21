import { Code2, Eye, FileText, GitGraph } from 'lucide-react'
import { useMemo } from 'react'
import type { SaveState } from '@/app/useEditorBuffer'
import { DocumentAdapterIconView } from '@/components/documentAdapterIcons'
import { useI18n } from '@/i18n/useI18n'
import { createFileLabel } from '@/logic/paths'
import type { WorkspaceTab } from '@/store/appTypes'
import type { TabLabelText } from '@/components/titlebar/titlebarTypes'

type TitlebarActiveTabBadgeProps = {
  activePath: string | null
  activeTab: WorkspaceTab | null
  dirtyPaths: Record<string, true>
  saveStates: Record<string, SaveState>
  silentSave: boolean
}

const getActiveTabLabel = (tab: WorkspaceTab | null, labels: TabLabelText) => {
  if (!tab) return ''
  if (tab.kind === 'workspace-graph') return labels.workspaceGraph
  const label = createFileLabel(tab.path)
  if (tab.kind === 'git-diff') return `${label} · ${labels.diff}`
  if (tab.view === 'source') return `${label} · ${labels.source}`
  if (tab.view === 'graph') return `${label} · ${labels.graph}`
  if (tab.view === 'preview') return `${label} · ${labels.preview}`
  return label
}

const getActiveTabTitle = (
  tab: WorkspaceTab | null,
  activePath: string | null,
  labels: TabLabelText,
) => {
  if (!tab) return ''
  if (tab.kind === 'workspace-graph') return labels.workspaceGraph
  if (tab.kind === 'git-diff') return tab.path
  return activePath ?? tab.path
}

const renderActiveTabIcon = (tab: WorkspaceTab | null) => {
  if (!tab) return <FileText className="h-3.5 w-3.5" />
  if (tab.kind === 'workspace-graph' || tab.kind === 'git-diff') {
    return <GitGraph className="h-3.5 w-3.5" />
  }
  if (tab.view === 'source') return <Code2 className="h-3.5 w-3.5" />
  if (tab.view === 'graph') return <GitGraph className="h-3.5 w-3.5" />
  if (tab.view === 'preview') {
    return <DocumentAdapterIconView path={tab.path} fallback={Eye} className="h-3.5 w-3.5" />
  }
  return <FileText className="h-3.5 w-3.5" />
}

export const TitlebarActiveTabBadge = ({
  activePath,
  activeTab,
  dirtyPaths,
  saveStates,
  silentSave,
}: TitlebarActiveTabBadgeProps) => {
  const { t } = useI18n()
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
  const activeSaveState = activePath ? saveStates[activePath] : undefined
  const activeTabLabel = getActiveTabLabel(activeTab, tabLabels)
  const activeTabTitle = getActiveTabTitle(activeTab, activePath, tabLabels)
  const showDirtyIndicator = Boolean(activePath && !silentSave && dirtyPaths[activePath])
  const showErrorIndicator = activeSaveState?.status === 'error'
  const dirtyLabel = t('save.unsaved')
  const errorLabel = t('save.error')

  if (!activeTab) return null

  return (
    <div
      className="flex h-7 min-w-0 max-w-[240px] shrink items-center gap-1.5 rounded-md border border-border/80 bg-background/60 px-2 text-xs text-muted-foreground"
      title={activeTabTitle}
    >
      <span className="shrink-0 text-muted-foreground">{renderActiveTabIcon(activeTab)}</span>
      <span className="min-w-0 truncate text-foreground/90">{activeTabLabel}</span>
      {showDirtyIndicator && (
        <span
          aria-label={dirtyLabel}
          className="h-1.5 w-1.5 shrink-0 rounded-full bg-amber-500"
          title={dirtyLabel}
        />
      )}
      {showErrorIndicator && (
        <span
          aria-label={errorLabel}
          className="h-1.5 w-1.5 shrink-0 rounded-full bg-destructive"
          title={activeSaveState?.message ?? errorLabel}
        />
      )}
    </div>
  )
}
