import { useEffect, useRef, useState, type RefObject } from 'react'
import { isDesktopRuntime } from '@/runtime/environment'
import { workspaceTreeApi } from '@/services/workspaceTreeApi'
import { editorBufferIdentity } from '@/app/useEditorBufferState'

export const useEditorBufferInvalidation = (
  workspaceKey: string,
  syncedContentsRef: RefObject<Record<string, string>>,
  activePath: string | null,
) => {
  const [generation, setGeneration] = useState(0)
  const revisionRef = useRef<{ revision: number | null; workspace: string }>({
    revision: null,
    workspace: workspaceKey,
  })
  useEffect(() => {
    if (!isDesktopRuntime()) return
    if (revisionRef.current.workspace !== workspaceKey) {
      revisionRef.current = { revision: null, workspace: workspaceKey }
    }
    return workspaceTreeApi.onChanged((event) => {
      if (workspaceKey !== `${event.root.kind}:${event.root.path}`) return
      const previousRevision = revisionRef.current.revision
      revisionRef.current.revision = event.revision
      const hasGap = previousRevision !== null && event.previousRevision !== previousRevision
      if (event.kind === 'invalidated' || hasGap) {
        syncedContentsRef.current = {}
        if (activePath) setGeneration((value) => value + 1)
        return
      }

      const changedPaths = event.changes.flatMap((change) =>
        change.type === 'changed' ? [change.path] : [],
      )
      changedPaths.forEach((path) => {
        delete syncedContentsRef.current[editorBufferIdentity(workspaceKey, path)]
      })
      if (activePath && changedPaths.includes(activePath)) {
        setGeneration((value) => value + 1)
      }
    })
  }, [activePath, syncedContentsRef, workspaceKey])

  return generation
}
