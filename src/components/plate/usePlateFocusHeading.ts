import { useEffect } from 'react'
import type { PlateEditor } from 'platejs/react'
import { focusPlateHeading } from '@/components/plate/plateHeadingNavigation'
import { onFocusHeadingRequest } from '@/utils/editorNavigation'

export const usePlateFocusHeading = (
  activePath: string | null,
  getEditor: () => PlateEditor | null,
) => {
  useEffect(() => {
    let retryHandle: number | null = null
    const cancelRetry = () => {
      if (retryHandle !== null) window.clearTimeout(retryHandle)
      retryHandle = null
    }
    const focusWhenReady = (slug: string, attemptsRemaining = 100) => {
      const editor = getEditor()
      if (editor && focusPlateHeading(editor, slug)) return
      if (attemptsRemaining <= 0) return
      retryHandle = window.setTimeout(() => focusWhenReady(slug, attemptsRemaining - 1), 50)
    }
    const unsubscribe = onFocusHeadingRequest(({ path, slug }) => {
      if (!path || !slug || path !== activePath) return
      cancelRetry()
      focusWhenReady(slug)
    })

    return () => {
      cancelRetry()
      unsubscribe()
    }
  }, [activePath, getEditor])
}
