import GraphViewPage from '@/pages/GraphViewPage'
import EditorPaneFallback from '@/pages/EditorPaneFallback'
import { useShallow } from 'zustand/react/shallow'
import { useI18n } from '@/i18n/useI18n'
import { useLayoutContext } from '@/pages/useLayoutContext'

const WorkspaceGraphPage = () => {
  const context = useLayoutContext(
    useShallow((state) => ({
      graph: state.graph,
      graphContentMode: state.graphContentMode,
      graphLoading: state.graphLoading,
      graphMiniMapEnabled: state.graphMiniMapEnabled,
      onEditorChange: state.onEditorChange,
      onOpenFile: state.onOpenFile,
    })),
  )
  const { t } = useI18n()

  if (context.graphLoading) {
    return <EditorPaneFallback label={t('editor.loadingDocument')} />
  }

  return (
    <GraphViewPage
      graph={context.graph}
      markdown=""
      onOpenFile={context.onOpenFile}
      onChange={context.onEditorChange}
      showMiniMap={context.graphMiniMapEnabled}
      contentMode={context.graphContentMode}
      editable={false}
      showEmptyMessage={false}
    />
  )
}

export default WorkspaceGraphPage
