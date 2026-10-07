import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import type { PlateEditor } from 'platejs/react'
import { createPlateDocumentCompletionIndex } from '@/components/plate/completion/plateDocumentCompletionIndex'

type UsePlateDocumentCompletionIndexOptions = {
  activePath: string | null
  editor: PlateEditor
  enabled: boolean
  value: string
}

export const usePlateDocumentCompletionIndex = ({
  activePath,
  editor,
  enabled,
  value,
}: UsePlateDocumentCompletionIndexOptions) => {
  const completionResource = useMemo(
    () => ({
      documentKey: activePath,
      index: createPlateDocumentCompletionIndex(editor),
    }),
    [activePath, editor],
  )
  const completionIndex = completionResource.index
  const currentChildren = editor.children
  const localChangeRef = useRef<{
    children: PlateEditor['children']
    resource: typeof completionResource
  } | null>(null)
  const [revision, setRevision] = useState(0)

  useEffect(() => {
    if (!enabled) {
      localChangeRef.current = null
      completionIndex.destroy()
      return
    }
    const localChange = localChangeRef.current
    if (localChange?.resource === completionResource && localChange.children === currentChildren) {
      localChangeRef.current = null
      return
    }
    localChangeRef.current = null
    completionIndex.hydrate()
    setRevision((current) => current + 1)
  }, [completionIndex, completionResource, currentChildren, enabled, value])

  useEffect(() => () => completionIndex.destroy(), [completionIndex])

  const syncEditorChanges = useCallback(() => {
    if (!enabled) return
    completionIndex.syncEditorChanges()
    localChangeRef.current = { children: editor.children, resource: completionResource }
  }, [completionIndex, completionResource, editor, enabled])

  return {
    getDocumentCompletions: completionIndex.query,
    revision,
    syncEditorChanges,
  }
}
