import { useCallback, useEffect, useState } from 'react'
import type { FileViewKind, ViewMode } from '@/store/appTypes'
import { requestFocusHeading, type FocusHeadingRequest } from '@/utils/editorNavigation'

type UseAppPendingHeadingOptions = {
  activePath: string | null
  onOpenFileView: (path: string, view: FileViewKind) => void
  viewMode: ViewMode
}

export const useAppPendingHeading = ({
  activePath,
  onOpenFileView,
  viewMode,
}: UseAppPendingHeadingOptions) => {
  const [pendingHeading, setPendingHeading] = useState<FocusHeadingRequest | null>(null)

  const openHeading = useCallback(
    (path: string, slug: string) => {
      onOpenFileView(path, 'edit')
      setPendingHeading({ path, slug })
    },
    [onOpenFileView],
  )

  useEffect(() => {
    if (!pendingHeading) return
    if (activePath !== pendingHeading.path || viewMode !== 'wysiwyg') return

    const timer = window.setTimeout(() => {
      requestFocusHeading(pendingHeading)
      setPendingHeading((current) =>
        current?.path === pendingHeading.path && current.slug === pendingHeading.slug
          ? null
          : current,
      )
    }, 80)

    return () => window.clearTimeout(timer)
  }, [activePath, pendingHeading, viewMode])

  return openHeading
}
