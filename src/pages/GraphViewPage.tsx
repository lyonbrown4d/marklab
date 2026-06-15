import { lazy, memo, Suspense, useMemo } from 'react'
import '@xyflow/react/dist/style.css'
import type { GraphData } from '@/logic/graph'
import type { GraphContentMode } from '@/store/appTypes'
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
  const {
    addChildHeading,
    addSiblingHeading,
    addSiblingHeadingBefore,
    deleteHeading,
    editorGraph,
    updateHeadingContent,
    updateHeadingTitle,
  } = useGraphMarkdownEditing({
    graph,
    markdown,
    onChange,
  })
  const hasHeadingNodes = useMemo(
    () => editorGraph.nodes.some((node) => node.type === 'heading'),
    [editorGraph.nodes],
  )
  const canEdit = editable && hasHeadingNodes
  const graphContentMode = canEdit ? 'full' : contentMode
  return (
    <div className="flex h-full flex-col overflow-hidden">
      <div className="editor-stage min-h-0 flex-1 overflow-hidden">
        <div className="relative h-full overflow-hidden">
          <div className="motion-view h-full">
            <Suspense fallback={<EditorPaneFallback />}>
              <GraphPage
                graph={editorGraph}
                onOpenFile={onOpenFile}
                showMiniMap={showMiniMap}
                contentMode={graphContentMode}
                editable={canEdit}
                onAddChildHeading={addChildHeading}
                onAddSiblingHeading={addSiblingHeading}
                onAddSiblingHeadingBefore={addSiblingHeadingBefore}
                onDeleteHeading={deleteHeading}
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
