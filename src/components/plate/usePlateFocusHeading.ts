import { useEffect } from 'react'
import type { PlateEditor } from 'platejs/react'
import { focusPlateHeading } from '@/components/plate/plateHeadingNavigation'
import {
  clearFocusHeadingRequest,
  headingNavigationStore,
  onFocusHeadingRequest,
  type FocusHeadingRequest,
  type PendingFocusHeadingRequest,
} from '@/utils/editorNavigation'

export const usePlateFocusHeading = (
  activePath: string | null,
  getEditor: () => PlateEditor | null,
  workspaceKey?: string,
) => {
  useEffect(() => {
    let retryHandle: number | null = null
    const cancelRetry = () => {
      if (retryHandle !== null) window.clearTimeout(retryHandle)
      retryHandle = null
    }
    const focusWhenReady = (request: FocusHeadingRequest, attemptsRemaining = 100) => {
      const editor = getEditor()
      if (editor && focusPlateHeading(editor, request.slug)) {
        if (request.workspaceKey) {
          clearFocusHeadingRequest(request as PendingFocusHeadingRequest)
        }
        return
      }
      if (attemptsRemaining <= 0) {
        if (request.workspaceKey) {
          clearFocusHeadingRequest(request as PendingFocusHeadingRequest)
        }
        return
      }
      retryHandle = window.setTimeout(() => focusWhenReady(request, attemptsRemaining - 1), 50)
    }
    const handleRequest = (request: FocusHeadingRequest) => {
      if (!request.path || !request.slug || request.path !== activePath) return
      if (request.workspaceKey && request.workspaceKey !== workspaceKey) return
      cancelRetry()
      focusWhenReady(request)
    }
    const unsubscribe = onFocusHeadingRequest(handleRequest)
    const pending =
      activePath && workspaceKey
        ? headingNavigationStore.getState().requests[`${workspaceKey}:${activePath}`]
        : undefined
    if (pending) handleRequest(pending)

    return () => {
      cancelRetry()
      unsubscribe()
    }
  }, [activePath, getEditor, workspaceKey])
}
