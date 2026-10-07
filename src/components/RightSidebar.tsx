import { useI18n } from '@/i18n/useI18n'
import { memo, useCallback, useEffect, useState } from 'react'
import { createFileLabel } from '@/logic/paths'
import type { FileViewKind, ViewMode } from '@/store/appTypes'
import { Button } from '@/components/ui/button'
import { CircleAlert, LoaderCircle } from 'lucide-react'
import {
  requestFocusHeading,
  requestFocusSourcePosition,
  type FocusHeadingRequest,
  type FocusSourcePositionRequest,
} from '@/utils/editorNavigation'
import type { MarkdownSourceDiagnostic } from '@/logic/markdownDiagnostics'
import type { KnowledgeLinkReference, KnowledgeMissingReference } from '@/logic/knowledge'
import {
  RightSidebarCollapsed,
  RightSidebarContent,
  type SidebarBacklink,
} from '@/components/RightSidebarContent'
import { useRightSidebarData } from '@/components/useRightSidebarData'

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
  const [pendingHeading, setPendingHeading] = useState<FocusHeadingRequest | null>(null)
  const [pendingSourcePosition, setPendingSourcePosition] =
    useState<FocusSourcePositionRequest | null>(null)
  const targetPath = activePath ? (inspectedPath ?? activePath) : null
  const {
    outline,
    backlinks,
    problems,
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

  const handleOpenHeading = useCallback(
    (slug: string) => {
      if (!targetPath) return
      setPendingHeading({ path: targetPath, slug })
      onOpenFileView(targetPath, 'edit')
    },
    [onOpenFileView, targetPath],
  )

  const handleOpenBacklink = useCallback(
    (backlink: SidebarBacklink) => {
      setPendingSourcePosition({
        path: backlink.sourcePath,
        line: backlink.line,
        column: backlink.column,
      })
      onOpenFileView(backlink.sourcePath, 'source')
    },
    [onOpenFileView],
  )

  const handleOpenKnowledgeFile = useCallback(
    (path: string) => {
      onOpenFileView(path, 'edit')
    },
    [onOpenFileView],
  )

  const handleOpenKnowledgeReference = useCallback(
    (reference: KnowledgeLinkReference) => {
      setPendingSourcePosition({
        path: reference.path,
        line: reference.firstLine,
        column: reference.firstColumn,
      })
      onOpenFileView(reference.path, 'source')
    },
    [onOpenFileView],
  )

  const handleOpenMissingLink = useCallback(
    (reference: KnowledgeMissingReference) => {
      if (!targetPath) return
      setPendingSourcePosition({
        path: targetPath,
        line: reference.line,
        column: reference.column,
      })
      onOpenFileView(targetPath, 'source')
    },
    [onOpenFileView, targetPath],
  )

  const handleOpenProblem = useCallback(
    (problem: MarkdownSourceDiagnostic) => {
      if (!targetPath) return
      setPendingSourcePosition({
        path: targetPath,
        line: problem.line,
        column: problem.startColumn,
      })
      onOpenFileView(targetPath, 'source')
    },
    [onOpenFileView, targetPath],
  )

  useEffect(() => {
    if (!pendingHeading) return
    if (pendingHeading.path !== activePath || viewMode !== 'wysiwyg') return

    const timer = window.setTimeout(() => {
      requestFocusHeading(pendingHeading)
      setPendingHeading((current) =>
        current?.path === pendingHeading.path && current.slug === pendingHeading.slug
          ? null
          : current,
      )
    }, 80)

    return () => window.clearTimeout(timer)
  }, [activePath, pendingHeading, viewMode])

  useEffect(() => {
    if (!pendingSourcePosition) return
    if (pendingSourcePosition.path !== activePath || viewMode !== 'source') return

    const timer = window.setTimeout(() => {
      requestFocusSourcePosition(pendingSourcePosition)
      setPendingSourcePosition((current) =>
        current?.path === pendingSourcePosition.path &&
        current.line === pendingSourcePosition.line &&
        current.column === pendingSourcePosition.column
          ? null
          : current,
      )
    }, 80)

    return () => window.clearTimeout(timer)
  }, [activePath, pendingSourcePosition, viewMode])

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
          backlinks={backlinks}
          problems={problems}
          errorProblems={errorProblems}
          warningProblems={warningProblems}
          knowledge={knowledge}
          documentStats={documentStats}
          displayMetadata={displayMetadata}
          loadingMetadata={loadingMetadata}
          assetReport={assetReport}
          onOpenHeading={handleOpenHeading}
          onOpenBacklink={handleOpenBacklink}
          onOpenKnowledgeFile={handleOpenKnowledgeFile}
          onOpenKnowledgeReference={handleOpenKnowledgeReference}
          onOpenMissingLink={handleOpenMissingLink}
          onOpenProblem={handleOpenProblem}
        />
      </div>
    </div>
  )
}

export default memo(RightSidebarComponent)
