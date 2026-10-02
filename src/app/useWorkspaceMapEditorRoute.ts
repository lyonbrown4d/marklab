import { useCallback, useMemo } from 'react'
import { useSearchParams } from 'react-router-dom'
import { isMarkdownFilePath } from '@/logic/fileTypes'
import type { FileEntry } from '@/store/appTypes'

type WorkspaceMapEditorRouteOptions = {
  enabled: boolean
  entries: FileEntry[]
}

export const useWorkspaceMapEditorRoute = ({
  enabled,
  entries,
}: WorkspaceMapEditorRouteOptions) => {
  const [searchParams, setSearchParams] = useSearchParams()
  const requestedPath = searchParams.get('edit')
  const editorPath = useMemo(() => {
    if (!enabled || !requestedPath || !isMarkdownFilePath(requestedPath)) return null
    return entries.some((entry) => entry.kind === 'file' && entry.path === requestedPath)
      ? requestedPath
      : null
  }, [enabled, entries, requestedPath])

  const setEditorPath = useCallback(
    (path: string | null) => {
      setSearchParams(
        (current) => {
          const next = new URLSearchParams(current)
          if (path) next.set('edit', path)
          else next.delete('edit')
          return next
        },
        { replace: false },
      )
    },
    [setSearchParams],
  )

  const openEditor = useCallback((path: string) => setEditorPath(path), [setEditorPath])
  const closeEditor = useCallback(() => setEditorPath(null), [setEditorPath])

  return { editorPath, openEditor, closeEditor }
}
