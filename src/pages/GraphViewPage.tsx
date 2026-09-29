import { lazy, memo, Suspense, useCallback, useMemo, useState } from 'react'
import '@xyflow/react/dist/style.css'
import type { GraphData } from '@/logic/graph'
import type { GraphContentMode } from '@/store/appTypes'
import EditorPaneFallback from '@/pages/EditorPaneFallback'
import { useI18n } from '@/i18n/useI18n'
import { useGraphMarkdownEditing } from '@/pages/useGraphMarkdownEditing'
import type { GraphPresentation } from '@/pages/graph/graphPageConfig'
import { createMindmapPresentation } from '@/pages/graph/mindmapPresentation'
import { useMindmapHistory } from '@/pages/graph/useMindmapHistory'
import {
  insertMindmapParent,
  moveMindmapHeading,
  reorderMindmapHeading,
} from '@/pages/graph/mindmapMarkdownEdits'
import type { MindmapDropPlacement } from '@/pages/graph/mindmapModel'
const GraphPage = lazy(() => import('@/pages/GraphPage'))
type GraphViewPageProps = {
  graph: GraphData
  presentation?: GraphPresentation
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
  presentation = 'graph',
  markdown,
  onOpenFile,
  onChange,
  showMiniMap,
  contentMode,
  editable,
  showEmptyMessage,
}: GraphViewPageProps) => {
  const { t } = useI18n()
  const [mindmapContentMode, setMindmapContentMode] = useState<GraphContentMode>('none')
  const history = useMindmapHistory(markdown, onChange, presentation === 'mindmap')
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
    onChange: presentation === 'mindmap' ? history.commit : onChange,
  })
  const hasHeadingNodes = useMemo(
    () => editorGraph.nodes.some((node) => node.type === 'heading'),
    [editorGraph.nodes],
  )
  const canEdit = editable && hasHeadingNodes
  const graphContentMode =
    presentation === 'mindmap' ? mindmapContentMode : canEdit ? 'full' : contentMode
  const presentedGraph = useMemo(
    () =>
      presentation === 'mindmap'
        ? createMindmapPresentation(editorGraph, graphContentMode)
        : editorGraph,
    [editorGraph, graphContentMode, presentation],
  )
  const moveHeading = useCallback(
    (nodeId: string, targetId: string, placement: MindmapDropPlacement) =>
      history.commit(
        moveMindmapHeading(history.getCurrentMarkdown(), editorGraph, nodeId, targetId, placement),
      ),
    [editorGraph, history],
  )
  const reorderHeading = useCallback(
    (nodeId: string, direction: 'up' | 'down') =>
      history.commit(
        reorderMindmapHeading(history.getCurrentMarkdown(), editorGraph, nodeId, direction),
      ),
    [editorGraph, history],
  )
  const insertParentHeading = useCallback(
    (nodeId: string) =>
      history.commit(insertMindmapParent(history.getCurrentMarkdown(), editorGraph, nodeId)),
    [editorGraph, history],
  )
  return (
    <div className="flex h-full flex-col overflow-hidden">
      <div className="editor-stage min-h-0 flex-1 overflow-hidden">
        <div className="relative h-full overflow-hidden">
          <div className="motion-view h-full">
            <Suspense fallback={<EditorPaneFallback />}>
              <GraphPage
                graph={presentedGraph}
                presentation={presentation}
                onContentModeChange={setMindmapContentMode}
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
                onInsertParentHeading={insertParentHeading}
                onMoveHeading={moveHeading}
                onReorderHeading={reorderHeading}
                onUndo={history.undo}
                onRedo={history.redo}
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
