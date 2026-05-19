import { useI18n } from '@/i18n/useI18n'
import { memo, useEffect, useState } from 'react'
import { createFileLabel } from '@/logic/paths'
import type { FileEntry, FileViewKind, ViewMode } from '@/store/useAppStore'
import type { FsWorkspaceIndex } from '@/services/fsApi'
import {
  requestFocusHeading,
  requestFocusSourcePosition,
  type FocusHeadingRequest,
  type FocusSourcePositionRequest,
} from '@/utils/editorNavigation'
import type { MarkdownSourceDiagnostic } from '@/logic/markdownDiagnostics'
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

const RightSidebarComponent = ({
  collapsed,
  activePath,
  inspectedPath,
  editorValue,
  files,
  fileContents,
  dirtyPaths,
  workspaceIndex,
  tabs,
  totalFiles,
  onOpenFileView,
  viewMode,
}: RightSidebarProps) => {
  const { t } = useI18n()
  const [pendingHeading, setPendingHeading] = useState<FocusHeadingRequest | null>(null)
  const [pendingSourcePosition, setPendingSourcePosition] =
    useState<FocusSourcePositionRequest | null>(null)
  const targetPath = inspectedPath ?? activePath
  const {
    outline,
    backlinks,
    problems,
    errorProblems,
    warningProblems,
    documentStats,
    outgoingLinkCount,
    displayMetadata,
    loadingMetadata,
  } = useRightSidebarData({
    collapsed,
    activePath,
    targetPath,
    editorValue,
    files,
    fileContents,
    dirtyPaths,
    workspaceIndex,
  })
  const targetLabel = targetPath ? createFileLabel(targetPath) : t('inspector.none')

  const handleOpenHeading = (slug: string) => {
    if (!targetPath) return
    setPendingHeading({ path: targetPath, slug })
    onOpenFileView(targetPath, 'edit')
  }

  const handleOpenBacklink = (backlink: SidebarBacklink) => {
    setPendingSourcePosition({
      path: backlink.sourcePath,
      line: backlink.line,
      column: backlink.column,
    })
    onOpenFileView(backlink.sourcePath, 'source')
  }

  const handleOpenProblem = (problem: MarkdownSourceDiagnostic) => {
    if (!targetPath) return
    setPendingSourcePosition({
      path: targetPath,
      line: problem.line,
      column: problem.startColumn,
    })
    onOpenFileView(targetPath, 'source')
  }

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
    <aside
      className="layout-rail workspace-rail flex h-full w-full flex-col border-l border-sidebar-border/80"
      data-collapsed={collapsed ? 'true' : 'false'}
    >
      {!collapsed ? (
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
          documentStats={documentStats}
          outgoingLinkCount={outgoingLinkCount}
          displayMetadata={displayMetadata}
          loadingMetadata={loadingMetadata}
          onOpenHeading={handleOpenHeading}
          onOpenBacklink={handleOpenBacklink}
          onOpenProblem={handleOpenProblem}
        />
      ) : (
        <RightSidebarCollapsed tabs={tabs} totalFiles={totalFiles} />
      )}
    </aside>
  )
}

export default memo(RightSidebarComponent)
