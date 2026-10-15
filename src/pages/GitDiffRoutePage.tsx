import { useParams } from 'react-router-dom'
import { useShallow } from 'zustand/react/shallow'
import GitDiffPage from '@/pages/GitDiffPage'
import { isGitDiffSection } from '@/logic/routing'
import { FileRouteNotFound } from '@/pages/fileRouteHelpers'
import { useLayoutContext } from '@/pages/useLayoutContext'
import { gitDiffTabId } from '@/logic/tabs'

const GitDiffRoutePage = () => {
  const params = useParams()
  const context = useLayoutContext(
    useShallow((state) => ({
      files: state.files,
      onCloseActiveTab: state.onCloseActiveTab,
      onCloseTab: state.onCloseTab,
      onOpenFile: state.onOpenFile,
      rootPath: state.rootPath,
    })),
  )
  const section = params.section
  const path = params['*'] || null

  if (!isGitDiffSection(section) || !path) {
    return <FileRouteNotFound files={context.files} onOpenFile={context.onOpenFile} />
  }

  return (
    <GitDiffPage
      rootPath={context.rootPath}
      request={{ path, section }}
      onClose={() =>
        context.onCloseTab
          ? context.onCloseTab(gitDiffTabId(section, path), context.rootPath)
          : context.onCloseActiveTab()
      }
      onOpenFile={context.onOpenFile}
    />
  )
}

export default GitDiffRoutePage
