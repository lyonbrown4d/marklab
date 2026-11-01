import { useEffect, useRef, useState, type RefObject } from 'react'
import { useLatest } from 'ahooks'
import { isDesktopRuntime } from '@/runtime/environment'
import { workspaceTreeApi } from '@/services/workspaceTreeApi'
import { editorBufferIdentity } from '@/app/useEditorBufferState'

export const useEditorBufferInvalidation = (
  workspaceKey: string,
  syncedContentsRef: RefObject<Record<string, string>>,
  visiblePaths: readonly string[],
) => {
  const visiblePathsRef = useLatest(visiblePaths)
  const [generation, setGeneration] = useState<Record<string, number>>({})
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
        if (visiblePathsRef.current.length)
          setGeneration((value) => ({ ...value, '*': (value['*'] ?? 0) + 1 }))
        return
      }

      const changedPaths = event.changes.flatMap((change) =>
        change.type === 'changed' ? [change.path] : [],
      )
      changedPaths.forEach((path) => {
        delete syncedContentsRef.current[editorBufferIdentity(workspaceKey, path)]
      })
      if (visiblePathsRef.current.some((path) => changedPaths.includes(path))) {
        setGeneration((value) => {
          const next: Record<string, number> = { '*': value['*'] ?? 0 }
          for (const path of visiblePathsRef.current)
            next[path] = (value[path] ?? 0) + (changedPaths.includes(path) ? 1 : 0)
          return next
        })
      }
    })
  }, [visiblePathsRef, syncedContentsRef, workspaceKey])

  return generation
}
