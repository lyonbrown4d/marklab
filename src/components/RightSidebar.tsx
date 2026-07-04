import { useI18n } from '@/i18n/useI18n'
import { memo, useCallback, useEffect, useState } from 'react'
import { createFileLabel } from '@/logic/paths'
import type { FileEntry, FileViewKind, ViewMode } from '@/store/appTypes'
import type { FsWorkspaceIndex } from '@/services/fsApi'
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
  activePath: string | null
  inspectedPath: string | null
  editorValue: string
  files: FileEntry[]
  fileContents: Record<string, string>
  dirtyPaths?: Record<string, true>
  workspaceIndex?: FsWorkspaceIndex | null
  tabs: string[]
  totalFiles: number
  onOpenFileView: (path: string, view: FileViewKind) => void
  viewMode: ViewMode
}

const RightSidebarComponent = ({ collapsed, tabs, totalFiles, ...props }: RightSidebarProps) => {
  return (
    <aside
      className="layout-rail workspace-rail flex h-full w-full flex-col border-l border-sidebar-border/80"
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
  activePath,
  inspectedPath,
  editorValue,
  files,
  fileContents,
  dirtyPaths,
  workspaceIndex,
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
  } = useRightSidebarData({
    collapsed: false,
    activePath,
    targetPath,
    editorValue,
    files,
    fileContents,
    dirtyPaths,
    workspaceIndex,
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
  )
}

export default memo(RightSidebarComponent)
