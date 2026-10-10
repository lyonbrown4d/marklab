import { useI18n } from '@/i18n/useI18n'
import { memo, useCallback } from 'react'
import { createFileLabel } from '@/logic/paths'
import type { FileViewKind, ViewMode } from '@/store/appTypes'
import { Button } from '@/components/ui/button'
import { CircleAlert, LoaderCircle } from 'lucide-react'
import {
  activeHeadingStore,
  requestFocusHeading,
  requestFocusSourcePosition,
} from '@/utils/editorNavigation'
import type { MarkdownSourceDiagnostic } from '@/logic/markdownDiagnostics'
import type { KnowledgeLinkReference, KnowledgeMissingReference } from '@/logic/knowledge'
import type { UnlinkedMentionReference } from '@/logic/backlinks'
import {
  RightSidebarCollapsed,
  RightSidebarContent,
  type SidebarBacklink,
} from '@/components/RightSidebarContent'
import { useRightSidebarData } from '@/components/useRightSidebarData'
import { useStore } from 'zustand'

type RightSidebarProps = {
  collapsed: boolean
  workspaceKey: string
  activePath: string | null
  inspectedPath: string | null
  editorValue: string
  fileContents: Record<string, string>
  tabs: string[]
  totalFiles: number
  onOpenFileView: (path: string, view: FileViewKind) => void
  viewMode: ViewMode
}

const RightSidebarComponent = ({ collapsed, tabs, totalFiles, ...props }: RightSidebarProps) => {
  return (
    <aside
      className="layout-rail workspace-rail workspace-inspector flex h-full w-full min-w-0 flex-col"
      data-collapsed={collapsed ? 'true' : 'false'}
    >
      {collapsed ? (
        <RightSidebarCollapsed tabs={tabs} totalFiles={totalFiles} />
      ) : (
        <RightSidebarExpanded {...props} />
      )}
    </aside>
  )
}

type RightSidebarExpandedProps = Omit<RightSidebarProps, 'collapsed' | 'tabs' | 'totalFiles'>

const RightSidebarExpanded = ({
  workspaceKey,
  activePath,
  inspectedPath,
  editorValue,
  fileContents,
  onOpenFileView,
  viewMode,
}: RightSidebarExpandedProps) => {
  const { t } = useI18n()
  const targetPath = activePath ? (inspectedPath ?? activePath) : null
  const {
    outline,
    backlinks,
    unlinkedMentions,
    unlinkedMentionsLoading,
    unlinkedMentionsError,
    retryUnlinkedMentions,
    problems,
    problemController,
    errorProblems,
    warningProblems,
    documentStats,
    displayMetadata,
    loadingMetadata,
    assetReport,
    knowledge,
    insightsLoading,
    insightsError,
    retryInsights,
  } = useRightSidebarData({
    collapsed: false,
    workspaceKey,
    activePath,
    targetPath,
    editorValue,
    fileContents,
  })
  const targetLabel = targetPath ? createFileLabel(targetPath) : t('inspector.none')
  const activeHeadingSlug = useStore(activeHeadingStore, (state) =>
    targetPath && targetPath === activePath ? (state.headings[targetPath] ?? null) : null,
  )

  const handleOpenHeading = useCallback(
    (slug: string) => {
      if (!targetPath) return
      requestFocusHeading({ path: targetPath, slug, workspaceKey })
      onOpenFileView(targetPath, 'edit')
    },
    [onOpenFileView, targetPath, workspaceKey],
  )

  const handleOpenBacklink = useCallback(
    (backlink: SidebarBacklink) => {
      requestFocusSourcePosition({
        path: backlink.sourcePath,
        line: backlink.line,
        column: backlink.column,
        workspaceKey,
      })
      onOpenFileView(backlink.sourcePath, 'source')
    },
    [onOpenFileView, workspaceKey],
  )

  const handleOpenMention = useCallback(
    (mention: UnlinkedMentionReference) => {
      requestFocusSourcePosition({
        path: mention.sourcePath,
        line: mention.line,
        column: mention.column,
        workspaceKey,
      })
      onOpenFileView(mention.sourcePath, 'source')
    },
    [onOpenFileView, workspaceKey],
  )

  const handleOpenKnowledgeFile = useCallback(
    (path: string) => {
      onOpenFileView(path, 'edit')
    },
    [onOpenFileView],
  )

  const handleOpenKnowledgeReference = useCallback(
    (reference: KnowledgeLinkReference) => {
      requestFocusSourcePosition({
        path: reference.path,
        line: reference.firstLine,
        column: reference.firstColumn,
        workspaceKey,
      })
      onOpenFileView(reference.path, 'source')
    },
    [onOpenFileView, workspaceKey],
  )

  const handleOpenMissingLink = useCallback(
    (reference: KnowledgeMissingReference) => {
      if (!targetPath) return
      requestFocusSourcePosition({
        path: targetPath,
        line: reference.line,
        column: reference.column,
        workspaceKey,
      })
      onOpenFileView(targetPath, 'source')
    },
    [onOpenFileView, targetPath, workspaceKey],
  )

  const handleOpenProblem = useCallback(
    (problem: MarkdownSourceDiagnostic) => {
      if (!targetPath) return
      if (problemController) {
        onOpenFileView(targetPath, 'edit')
        problemController.focus(problem)
        return
      }
      requestFocusSourcePosition({
        path: targetPath,
        line: problem.line,
        column: problem.startColumn,
        workspaceKey,
      })
      onOpenFileView(targetPath, 'source')
    },
    [onOpenFileView, problemController, targetPath, workspaceKey],
  )

  return (
    <div className="flex h-full min-h-0 flex-col">
      {insightsLoading ? (
        <div
          role="status"
          className="mx-3 mt-2 flex shrink-0 items-center gap-2 rounded-md border border-border/60 bg-muted/35 px-2.5 py-2 text-xs text-muted-foreground"
        >
          <LoaderCircle className="size-3.5 animate-spin" aria-hidden="true" />
          {t('inspector.loading')}
        </div>
      ) : null}
      {insightsError ? (
        <div
          role="alert"
          className="mx-3 mt-2 flex shrink-0 items-center gap-2 rounded-md border border-destructive/35 bg-destructive/10 px-2.5 py-2 text-xs text-destructive"
        >
          <CircleAlert className="size-3.5 shrink-0" aria-hidden="true" />
          <span className="min-w-0 flex-1 truncate">{insightsError}</span>
          <Button
            type="button"
            variant="ghost"
            size="sm"
            className="h-6 shrink-0 px-2 text-xs"
            onClick={() => void retryInsights()}
          >
            {t('actions.retry')}
          </Button>
        </div>
      ) : null}
      <div className="min-h-0 flex-1">
        <RightSidebarContent
          activePath={activePath}
          targetPath={targetPath}
          targetLabel={targetLabel}
          viewMode={viewMode}
          outline={outline}
          activeHeadingSlug={activeHeadingSlug}
          backlinks={backlinks}
          unlinkedMentions={unlinkedMentions}
          unlinkedMentionsError={unlinkedMentionsError}
          unlinkedMentionsLoading={unlinkedMentionsLoading}
          problems={problems}
          problemController={problemController}
          errorProblems={errorProblems}
          warningProblems={warningProblems}
          knowledge={knowledge}
          documentStats={documentStats}
          displayMetadata={displayMetadata}
          loadingMetadata={loadingMetadata}
          assetReport={assetReport}
          onOpenHeading={handleOpenHeading}
          onOpenBacklink={handleOpenBacklink}
          onOpenMention={handleOpenMention}
          onOpenKnowledgeFile={handleOpenKnowledgeFile}
          onOpenKnowledgeReference={handleOpenKnowledgeReference}
          onOpenMissingLink={handleOpenMissingLink}
          onOpenProblem={handleOpenProblem}
          onRetryUnlinkedMentions={() => void retryUnlinkedMentions()}
        />
      </div>
    </div>
  )
}

export default memo(RightSidebarComponent)
