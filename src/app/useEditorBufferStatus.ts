import { useCallback, useEffect, type RefObject } from 'react'
import {
  editorBufferIdentity,
  type createEditorBufferPersistence,
  type EditorRevisionSnapshot,
  type SaveState,
} from '@/app/useEditorBufferState'
import { isDesktopRuntime } from '@/runtime/environment'
import { listen } from '@/runtime/events'
import { fsApi, fsBufferStatusSchema } from '@/services/fsApi'

type UseEditorBufferStatusOptions = {
  changeVersionRef: RefObject<Record<string, number>>
  latestContentsRef: RefObject<Record<string, string>>
  markPathClean: (workspace: string, path: string, content: string) => void
  markPathDirty: (workspace: string, path: string, nextState: SaveState) => void
  persistence: ReturnType<typeof createEditorBufferPersistence>
  workspaceKeyRef: RefObject<string>
}

export const useEditorBufferStatus = ({
  changeVersionRef,
  latestContentsRef,
  markPathClean,
  markPathDirty,
  persistence,
  workspaceKeyRef,
}: UseEditorBufferStatusOptions) => {
  const confirmFlushedRevisions = useCallback(
    async (snapshots: EditorRevisionSnapshot[]) => {
      await Promise.all(
        snapshots.map(async (snapshot) => {
          const current = persistence.revisionFor(snapshot.identity)
          if (!current || current.revision !== snapshot.revision) return
          if (snapshot.workspace !== workspaceKeyRef.current) {
            persistence.deleteRevision(snapshot.identity, snapshot.revision)
            return
          }

          const status = await fsApi.getBufferStatus(snapshot.path)
          const latest = persistence.revisionFor(snapshot.identity)
          if (!latest || latest.revision !== snapshot.revision) return
          if (!status || status.revision !== snapshot.revision) {
            persistence.deleteRevision(snapshot.identity, snapshot.revision)
            return
          }
          if (status.dirty) {
            markPathDirty(snapshot.workspace, snapshot.path, { status: 'saving' })
            return
          }

          persistence.deleteRevision(snapshot.identity, snapshot.revision)
          const currentContent = latestContentsRef.current[snapshot.identity]
          const isCurrent =
            changeVersionRef.current[snapshot.identity] === snapshot.version &&
            currentContent != null
          if (isCurrent) markPathClean(snapshot.workspace, snapshot.path, currentContent)
        }),
      )
    },
    [
      changeVersionRef,
      latestContentsRef,
      markPathClean,
      markPathDirty,
      persistence,
      workspaceKeyRef,
    ],
  )

  useEffect(() => {
    if (!isDesktopRuntime()) return

    let cancelled = false
    let unlisten: (() => void) | undefined
    void listen<unknown>('fs-buffer-status', (event) => {
      const parsed = fsBufferStatusSchema.safeParse(event.payload)
      if (!parsed.success) return

      const { path, revision, dirty } = parsed.data
      const workspace = workspaceKeyRef.current
      const identity = editorBufferIdentity(workspace, path)
      const snapshot = persistence.revisionFor(identity)
      if (!snapshot || snapshot.revision !== revision) return

      const isCurrent =
        changeVersionRef.current[identity] === snapshot.version &&
        latestContentsRef.current[identity] != null
      if (!isCurrent) {
        persistence.deleteRevision(identity, revision)
        return
      }
      if (dirty) {
        markPathDirty(workspace, path, { status: 'saving' })
        return
      }

      const content = latestContentsRef.current[identity]
      persistence.deleteRevision(identity, revision)
      if (content != null) markPathClean(workspace, path, content)
    }).then((nextUnlisten) => {
      if (cancelled) nextUnlisten()
      else unlisten = nextUnlisten
    })

    return () => {
      cancelled = true
      unlisten?.()
    }
  }, [
    changeVersionRef,
    latestContentsRef,
    markPathClean,
    markPathDirty,
    persistence,
    workspaceKeyRef,
  ])

  return confirmFlushedRevisions
}
