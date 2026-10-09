import { useCallback, useEffect } from 'react'
import type { FileViewKind, ViewMode } from '@/store/appTypes'
import { clearPendingHeadingNavigation, requestFocusHeading } from '@/utils/editorNavigation'

type UseAppPendingHeadingOptions = {
  activePath: string | null
  onOpenFileView: (path: string, view: FileViewKind) => void
  viewMode: ViewMode
  workspaceKey: string
}

export const useAppPendingHeading = ({
  onOpenFileView,
  workspaceKey,
}: UseAppPendingHeadingOptions) => {
  useEffect(() => () => clearPendingHeadingNavigation(), [workspaceKey])

  const openHeading = useCallback(
    (path: string, slug: string) => {
      requestFocusHeading({ path, slug, workspaceKey })
      onOpenFileView(path, 'edit')
    },
    [onOpenFileView, workspaceKey],
  )

  return openHeading
}
