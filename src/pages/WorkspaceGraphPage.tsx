import GraphViewPage from '@/pages/GraphViewPage'
import EditorPaneFallback from '@/pages/EditorPaneFallback'
import { useI18n } from '@/i18n/useI18n'
import { useLayoutContext } from '@/pages/useLayoutContext'

const WorkspaceGraphPage = () => {
  const context = useLayoutContext()
  const { t } = useI18n()

  if (context.graphLoading) {
    return <EditorPaneFallback label={t('editor.loadingDocument')} />
  }

  return (
    <GraphViewPage
      graph={context.graph}
      markdown={context.editorValue}
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
