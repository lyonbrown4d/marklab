import { lazy, memo, Suspense } from 'react'
import type { GitDiffRequest } from '@/services/gitApi'
import EditorPaneFallback from '@/pages/EditorPaneFallback'
const GitDiffView = lazy(() => import('@/components/GitDiffView'))
type GitDiffPageProps = {
  rootPath: string
  request: GitDiffRequest
  onClose: () => void
  onOpenFile: (path: string) => void
}
const GitDiffPage = ({ rootPath, request, onClose, onOpenFile }: GitDiffPageProps) => {
  return (
    <Suspense fallback={<EditorPaneFallback />}>
      <GitDiffView
        rootPath={rootPath}
        request={request}
        onClose={onClose}
        onOpenFile={onOpenFile}
      />
    </Suspense>
  )
}
export default memo(GitDiffPage)
