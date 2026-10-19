import { lazy, memo, Suspense, useCallback, useMemo, useState } from 'react'
import { useKeepAliveContext } from 'keepalive-for-react'
import type { FileEntry, FileViewKind } from '@/store/appTypes'
import EditorPaneFallback from '@/pages/EditorPaneFallback'
import { useDocumentStats } from '@/pages/useDocumentStats'
import { EditorDocumentStatus, type EditorCursorPosition } from '@/components/EditorDocumentStatus'
import type { EditorChangeHandler } from '@/types/editorChanges'
import { isPlantUmlFilePath } from '@/logic/fileTypes'
import { Button } from '@/components/ui/button'
import { useI18n } from '@/i18n/useI18n'
const SourceCodeEditor = lazy(() => import('@/components/SourceCodeEditor'))
const PlantUmlPreview = lazy(() => import('@/components/previews/PlantUmlPreview'))
type SourceCodePageProps = {
  activePath: string | null
  workspaceKey: string
  value: string
  files: FileEntry[]
  fileContents: Record<string, string>
  onChange: EditorChangeHandler
  onOpenFileView?: (path: string, view: FileViewKind) => void
  showStatusBar: boolean
  readOnly: boolean
}
const SourceCodePage = ({
  activePath,
  workspaceKey,
  value,
  files,
  fileContents,
  onChange,
  onOpenFileView,
  showStatusBar,
  readOnly,
}: SourceCodePageProps) => {
  const { t } = useI18n()
  const keepAlive = useKeepAliveContext()
  const interactionActive = !keepAlive.cacheKey || keepAlive.active
  const [previewPath, setPreviewPath] = useState<string | null>(null)
  const plantuml = isPlantUmlFilePath(activePath ?? '')
  const preview = plantuml && Boolean(activePath) && previewPath === activePath
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
  const stats = useDocumentStats(value, showStatusBar && interactionActive)
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
      {plantuml ? (
        <div className="flex shrink-0 justify-end border-b border-border px-3 py-1">
          <Button
            aria-label={t('preview.plantumlTitle')}
            aria-pressed={preview}
            onClick={() => setPreviewPath(preview ? null : activePath)}
            size="sm"
            variant="ghost"
            type="button"
          >
            {preview ? t('preview.plantumlEditSource') : t('preview.plantumlTitle')}
          </Button>
        </div>
      ) : null}
      {preview && interactionActive ? (
        <div className="min-h-0 flex-1 overflow-auto p-4">
          <Suspense fallback={<EditorPaneFallback />}>
            <PlantUmlPreview source={value} />
          </Suspense>
        </div>
      ) : null}
      <div hidden={preview} className="editor-stage min-h-0 flex-1 overflow-hidden">
        <div className="editor-paper relative h-full w-full overflow-hidden">
          <div className="motion-view h-full">
            <Suspense fallback={<EditorPaneFallback />}>
              <SourceCodeEditor
                activePath={activePath}
                workspaceKey={workspaceKey}
                value={value}
                files={files}
                fileContents={sourceFileContents}
                onChange={onChange}
                onOpenFileView={onOpenFileView}
                onCursorChange={showStatusBar ? onCursorChange : undefined}
                readOnly={readOnly}
                interactionActive={interactionActive && !preview}
              />
            </Suspense>
          </div>
        </div>
      </div>
      {showStatusBar && activePath && !preview && (
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
