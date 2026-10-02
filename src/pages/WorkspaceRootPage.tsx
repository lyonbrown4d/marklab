import { Navigate } from 'react-router-dom'
import { useShallow } from 'zustand/react/shallow'
import EditorEmptyState from '@/pages/EditorEmptyState'
import { pathToFileViewRoute } from '@/logic/routing'
import { getWorkspaceFilesTarget } from '@/logic/workspaceFilesTarget'
import { useLayoutContext } from '@/pages/useLayoutContext'

const WorkspaceRootPage = () => {
  const { activeTab, files, onOpenFile } = useLayoutContext(
    useShallow((state) => ({
      activeTab: state.activeTab,
      files: state.files,
      onOpenFile: state.onOpenFile,
    })),
  )
  const currentTabs = activeTab ? [activeTab] : []
  const target = getWorkspaceFilesTarget(currentTabs, files)

  if (target) {
    return <Navigate to={pathToFileViewRoute(target.path, target.view)} replace />
  }

  return (
    <EditorEmptyState
      files={files.filter((entry) => entry.kind === 'file')}
      onOpenFile={onOpenFile}
    />
  )
}

export default WorkspaceRootPage
