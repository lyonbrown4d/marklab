import { lazy, memo, Suspense } from 'react'
import type { GitDiffRequest } from '@/services/gitApi'
import EditorPaneFallback from '@/pages/EditorPaneFallback'
const GitDiffView = lazy(() => import('@/components/GitDiffView'))
const GitConflictMergeView = lazy(() => import('@/components/git/GitConflictMergeView'))
type GitDiffPageProps = {
  rootPath: string
  request: GitDiffRequest
  onClose: () => void
  onOpenFile: (path: string) => void
}
const GitDiffPage = ({ rootPath, request, onClose, onOpenFile }: GitDiffPageProps) => {
  const View = request.section === 'conflicts' ? GitConflictMergeView : GitDiffView
  return (
    <Suspense fallback={<EditorPaneFallback />}>
      <View
        key={`${rootPath}:${request.section}:${request.path}`}
        rootPath={rootPath}
        request={request}
        onClose={onClose}
        onOpenFile={onOpenFile}
      />
    </Suspense>
  )
}
export default memo(GitDiffPage)
