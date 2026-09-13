import { lazy, memo, Suspense, useCallback, useMemo, useState } from 'react'
import type { FsWorkspaceIndex } from '@/services/fsApi'
import type { FileEntry, FileViewKind } from '@/store/appTypes'
import EditorPaneFallback from '@/pages/EditorPaneFallback'
import { useDocumentStats } from '@/pages/useDocumentStats'
import { EditorDocumentStatus, type EditorCursorPosition } from '@/components/EditorDocumentStatus'
const MarkdownSourceEditor = lazy(() => import('@/components/MarkdownSourceEditor'))
type SourceCodePageProps = {
  activePath: string | null
  value: string
  files: FileEntry[]
  fileContents: Record<string, string>
  workspaceIndex: FsWorkspaceIndex | null
  onChange: (value: string) => void
  onOpenFileView?: (path: string, view: FileViewKind) => void
  showStatusBar: boolean
}
const SourceCodePage = ({
  activePath,
  value,
  files,
  fileContents,
  workspaceIndex,
  onChange,
  onOpenFileView,
  showStatusBar,
}: SourceCodePageProps) => {
  const [cursor, setCursor] = useState<{
    path: string | null
    position: EditorCursorPosition | null
  } | null>(null)
  const onCursorChange = useCallback(
    (position: EditorCursorPosition | null) => {
      setCursor({ path: activePath, position })
    },
    [activePath],
  )
  const stats = useDocumentStats(value, showStatusBar)
  const sourceFileContents = useMemo(
    () =>
      activePath
        ? {
            ...fileContents,
            [activePath]: value,
          }
        : fileContents,
    [activePath, fileContents, value],
  )
  return (
    <div className="flex h-full flex-col overflow-hidden">
      <div className="editor-stage min-h-0 flex-1 overflow-hidden">
        <div className="editor-paper relative h-full w-full overflow-hidden">
          <div className="motion-view h-full">
            <Suspense fallback={<EditorPaneFallback />}>
              <MarkdownSourceEditor
                activePath={activePath}
                value={value}
                files={files}
                fileContents={sourceFileContents}
                workspaceIndex={workspaceIndex}
                onChange={onChange}
                onOpenFileView={onOpenFileView}
                onCursorChange={showStatusBar ? onCursorChange : undefined}
              />
            </Suspense>
          </div>
        </div>
      </div>
      {showStatusBar && activePath && (
        <EditorDocumentStatus
          activePath={activePath}
          viewMode="source"
          stats={stats}
          value={value}
          cursor={cursor?.path === activePath ? cursor.position : null}
        />
      )}
    </div>
  )
}
export default memo(SourceCodePage)
