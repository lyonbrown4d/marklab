import { useCallback, useEffect, useRef, useState, type RefObject } from 'react'
import { useLatest } from 'ahooks'
import { produce } from 'immer'
import { editorBufferIdentity, type useEditorBufferState } from '@/app/useEditorBufferState'

export type BeginEditorPathMutation = (from: string, to: string) => (committed: boolean) => void

type Options = {
  activePath: string | null
  workspaceKey: string
  state: ReturnType<typeof useEditorBufferState>
  loadTokenRef: RefObject<number>
  activeLoadRef: RefObject<{ path: string; token: number; workspace: string } | null>
}

const containsPath = (parent: string, path: string) =>
  path === parent || path.startsWith(`${parent}/`)

const remapPaths = <T>(files: Record<string, T> | undefined, from: string, to: string) => {
  if (!files) return
  for (const path of Object.keys(files)) {
    if (!containsPath(from, path)) continue
    files[to + path.slice(from.length)] = files[path]!
    delete files[path]
  }
}

export const useEditorBufferPathMutation = (options: Options) => {
  const latestRef = useLatest(options)
  const mutation = useRef<{ from: string; workspace: string; pending: boolean } | null>(null)
  const [mutationGeneration, setMutationGeneration] = useState(0)
  const [pending, setPending] = useState<{ from: string; workspace: string } | null>(null)
  const isPathBlocked = useCallback((workspace: string, path: string) => {
    const current = mutation.current
    return Boolean(current?.workspace === workspace && containsPath(current.from, path))
  }, [])

  useEffect(() => {
    const current = mutation.current
    if (
      current &&
      !current.pending &&
      (current.workspace !== options.workspaceKey ||
        !options.activePath ||
        !containsPath(current.from, options.activePath))
    ) {
      mutation.current = null
      setPending(null)
    }
  }, [options.activePath, options.workspaceKey, mutationGeneration])

  const beginPathMutation = useCallback<BeginEditorPathMutation>(
    (from, to) => {
      const { workspaceKey, state, loadTokenRef, activeLoadRef } = latestRef.current
      const current = { from, workspace: workspaceKey, pending: true }
      mutation.current = current
      setPending(current)
      const previousVersions = new Map<string, number | undefined>()
      for (const path of Object.keys(state.workspaceFileContents[workspaceKey] ?? {})) {
        if (containsPath(from, path)) {
          const identity = editorBufferIdentity(workspaceKey, path)
          previousVersions.set(identity, state.loadedVersions[identity])
        }
      }
      // Snapshot flushers have drained before this boundary. A disposed editor's
      // delayed notification must not recreate its old path after the native move.
      state.setLoadedVersions((versions) => {
        const next = { ...versions }
        for (const identity of previousVersions.keys()) {
          next[identity] = (versions[identity] ?? 0) + 1
        }
        return next
      })
      const active = activeLoadRef.current
      if (active?.workspace === workspaceKey && containsPath(from, active.path)) {
        loadTokenRef.current += 1
        activeLoadRef.current = null
        state.setPathLoading(workspaceKey, active.path, false)
      }
      return (committed) => {
        if (mutation.current !== current) return
        current.pending = false
        if (committed) {
          state.setWorkspaceFileContents((value) =>
            produce(value, (draft) => {
              remapPaths(draft[workspaceKey], from, to)
            }),
          )
          state.setWorkspaceDirtyPaths((value) =>
            produce(value, (draft) => {
              remapPaths(draft[workspaceKey], from, to)
            }),
          )
          state.setWorkspaceSaveStates((value) =>
            produce(value, (draft) => {
              remapPaths(draft[workspaceKey], from, to)
            }),
          )
        } else {
          mutation.current = null
          setPending(null)
          state.setLoadedVersions((versions) => {
            const next = { ...versions }
            for (const [identity, version] of previousVersions) {
              if (version === undefined) delete next[identity]
              else next[identity] = version
            }
            return next
          })
        }
        setMutationGeneration((generation) => generation + 1)
      }
    },
    [latestRef],
  )

  return {
    beginPathMutation,
    mutationGeneration,
    isPathBlocked,
    pathMutationPending:
      pending !== null &&
      pending.workspace === options.workspaceKey &&
      Boolean(options.activePath && containsPath(pending.from, options.activePath)),
  }
}
