import { useCallback, useEffect, useRef } from 'react'
import { useMutation } from '@tanstack/react-query'
import { useLatest } from 'ahooks'
import { toast } from 'sonner'
import { linkedFilePathCandidates, resolveLinkedFilePath } from '@/logic/markdownCompletionPaths'
import { isSourcePreviewFilePath } from '@/logic/fileTypes'
import { workspaceTreeApi } from '@/services/workspaceTreeApi'
import { useWorkspaceStore } from '@/store/useWorkspaceStore'
import type { FileEntry, FileViewKind } from '@/store/appTypes'
import { useI18n } from '@/i18n/useI18n'

type WorkspaceLinkNavigationOptions = {
  activePath: string | null
  workspaceKey?: string
  interactionActive: boolean
  files: FileEntry[]
  onOpenFile: (path: string) => void
  onOpenFileView?: (path: string, view: FileViewKind) => void
}

type LinkLookup = {
  paths: string[]
  activePath: string | null
  workspaceKey?: string
}

export const useWorkspaceLinkNavigation = (options: WorkspaceLinkNavigationOptions) => {
  const { activePath, workspaceKey, interactionActive } = options
  const { t } = useI18n()
  const latest = useLatest(options)
  const requestSequence = useRef(0)
  const mounted = useRef(false)
  const { mutateAsync, reset, isPending, variables } = useMutation({
    mutationFn: (request: LinkLookup) =>
      workspaceTreeApi.pathsExist({ kind: 'file', paths: request.paths }),
    retry: false,
  })

  useEffect(() => {
    mounted.current = true
    return () => {
      mounted.current = false
      requestSequence.current += 1
    }
  }, [activePath, interactionActive, workspaceKey])

  const openLink = useCallback(
    (target: string, documentPath: string | null) => {
      const current = latest.current
      if (!current.interactionActive || !mounted.current) return
      if (documentPath && documentPath !== current.activePath) return
      const sequence = ++requestSequence.current
      reset()
      const source = documentPath ?? current.activePath
      const open = (path: string) => {
        if (isSourcePreviewFilePath(path) && current.onOpenFileView) {
          current.onOpenFileView(path, 'source')
        } else {
          current.onOpenFile(path)
        }
      }
      const loadedPath = resolveLinkedFilePath(source, target, current.files)
      if (loadedPath) {
        open(loadedPath)
        return
      }
      const paths = linkedFilePathCandidates(source, target)
      if (!paths.length) return
      const snapshot = useWorkspaceStore.getState()
      const isCurrent = () => {
        const next = latest.current
        const state = useWorkspaceStore.getState()
        return (
          mounted.current &&
          requestSequence.current === sequence &&
          next.interactionActive &&
          next.activePath === current.activePath &&
          next.workspaceKey === current.workspaceKey &&
          state.rootKind === snapshot.rootKind &&
          state.rootPath === snapshot.rootPath &&
          state.treeGeneration === snapshot.treeGeneration
        )
      }
      void mutateAsync({
        paths,
        activePath: current.activePath,
        workspaceKey: current.workspaceKey,
      })
        .then((result) => {
          if (
            !isCurrent() ||
            result.root.kind !== snapshot.rootKind ||
            result.root.path !== snapshot.rootPath ||
            result.generation !== snapshot.treeGeneration
          )
            return
          const path = paths.find((candidate) => result.existing.includes(candidate))
          if (path) open(path)
          else toast.error(t('notFound.title'))
        })
        .catch(() => {
          if (isCurrent()) toast.error(t('editor.openFileFailed'))
        })
    },
    [latest, mutateAsync, reset, t],
  )

  return {
    openLink,
    pending:
      isPending &&
      interactionActive &&
      variables?.activePath === activePath &&
      variables?.workspaceKey === workspaceKey,
  }
}
