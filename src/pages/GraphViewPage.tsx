import { lazy, memo, Suspense } from 'react'
import type { GraphData } from '@/logic/graph'
import type { GraphContentMode } from '@/store/useAppStore'
import EditorPaneFallback from '@/pages/EditorPaneFallback'
import { useI18n } from '@/i18n/useI18n'
import { useGraphMarkdownEditing } from '@/pages/useGraphMarkdownEditing'
const GraphPage = lazy(() => import('@/pages/GraphPage'))
type GraphViewPageProps = {
  graph: GraphData
  markdown: string
  onOpenFile: (path: string) => void
  onChange: (value: string) => void
  showMiniMap: boolean
  contentMode: GraphContentMode
  editable: boolean
  showEmptyMessage: boolean
}
const GraphViewPage = ({
  graph,
  markdown,
  onOpenFile,
  onChange,
  showMiniMap,
  contentMode,
  editable,
  showEmptyMessage,
}: GraphViewPageProps) => {
  const { t } = useI18n()
  const { editorGraph, updateHeadingContent, updateHeadingTitle } = useGraphMarkdownEditing({
    graph,
    markdown,
    onChange,
  })
  const canEdit = editable && editorGraph.nodes.some((node) => node.type === 'heading')
  const graphContentMode = canEdit ? 'full' : contentMode
  return (
    <div className="flex h-full flex-col overflow-hidden">
      <div className="editor-stage min-h-0 flex-1 overflow-hidden">
        <div className="relative h-full overflow-hidden">
          <div className="h-full animate-[view-fade_160ms_ease-out]">
            <Suspense fallback={<EditorPaneFallback />}>
              <GraphPage
                graph={editorGraph}
                onOpenFile={onOpenFile}
                showMiniMap={showMiniMap}
                contentMode={graphContentMode}
                editable={canEdit}
                onUpdateHeadingTitle={updateHeadingTitle}
                onUpdateHeadingContent={updateHeadingContent}
              />
            </Suspense>
          </div>
        </div>
      </div>
      {showEmptyMessage && (
        <div className="border-t border-border bg-background px-3 py-2 text-sm text-muted-foreground">
          {t('editor.empty')}
        </div>
      )}
    </div>
  )
}
export default memo(GraphViewPage)
