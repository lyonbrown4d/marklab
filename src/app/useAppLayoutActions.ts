import { useCallback, useState } from 'react'
import type { QueryClient } from '@tanstack/react-query'
import { toast } from 'sonner'
import { requestFocusSourcePosition } from '@/utils/editorNavigation'
import { isDesktopRuntime } from '@/runtime/environment'
import { fsApi, type FsSearchResult } from '@/services/fsApi'
import type { GitDiffRequest } from '@/services/gitApi'
import type { FileEntry } from '@/store/appTypes'
import type { useAppLayoutState } from '@/app/useAppLayoutState'

type AppLayoutState = ReturnType<typeof useAppLayoutState>

type UseAppLayoutActionsOptions = {
  queryClient: QueryClient
  state: AppLayoutState
}

const createUntitledPath = (files: FileEntry[]) => {
  const existingPaths = new Set(
    files.filter((entry) => entry.kind === 'file').map((entry) => entry.path.toLowerCase()),
  )
  if (!existingPaths.has('untitled.md')) return 'Untitled.md'
  for (let index = 1; index <= 999; index += 1) {
    const next = `Untitled-${index}.md`
    if (!existingPaths.has(next.toLowerCase())) return next
  }
  return `Untitled-${Date.now()}.md`
}

const getErrorMessage = (error: unknown) => (error instanceof Error ? error.message : String(error))

export const useAppLayoutActions = ({ queryClient, state }: UseAppLayoutActionsOptions) => {
  const [searchIndexRebuilding, setSearchIndexRebuilding] = useState(false)
  const { createFile, createFolder, files, onOpenFile, onOpenFileView, onOpenGitDiff, rootKind } =
    state

  const handleOpenFile = useCallback(
    (path: string) => {
      onOpenFile(path)
    },
    [onOpenFile],
  )

  const handleOpenFileView = useCallback(
    (path: string, view: Parameters<typeof onOpenFileView>[1]) => {
      onOpenFileView(path, view)
    },
    [onOpenFileView],
  )

  const handleCreateFile = useCallback(() => {
    if (rootKind === 'single') {
      toast.info('New files are unavailable for single-file workspaces.')
      return
    }
    const nextPath = createUntitledPath(files)
    void createFile(nextPath)
      .then(() => {
        toast.success('Created file')
        onOpenFile(nextPath)
      })
      .catch((error) => {
        toast.error('Failed to create file', {
          description: getErrorMessage(error),
        })
      })
  }, [createFile, files, onOpenFile, rootKind])

  const handleCreateFolder = useCallback(() => {
    if (rootKind === 'single') {
      toast.info('New folders are unavailable for single-file workspaces.')
      return
    }
    const nextPath = window.prompt('New folder name', 'folder')?.trim()
    if (!nextPath) return
    void createFolder(nextPath)
      .then(() => {
        toast.success('Created folder')
      })
      .catch((error) => {
        toast.error('Failed to create folder', {
          description: getErrorMessage(error),
        })
      })
  }, [createFolder, rootKind])

  const handleRebuildSearchIndex = useCallback(() => {
    if (searchIndexRebuilding || !isDesktopRuntime()) return
    const toastId = 'search-index-rebuild'
    toast.loading('Rebuilding search index...', {
      id: toastId,
    })
    setSearchIndexRebuilding(true)
    const rebuildPromise = (async () => {
      await fsApi.rebuildSearchIndex()
      await queryClient.invalidateQueries({ queryKey: ['workspace-index'] })
      await queryClient.invalidateQueries({ queryKey: ['command-workspace-search'] })
    })()
    void rebuildPromise
      .then(() => {
        toast.success('Search index rebuilt', {
          id: toastId,
        })
      })
      .catch((error) => {
        toast.error('Failed to rebuild search index', {
          id: toastId,
          description: getErrorMessage(error),
        })
      })
      .finally(() => {
        setSearchIndexRebuilding(false)
      })
  }, [queryClient, searchIndexRebuilding])

  const handleOpenGitDiff = useCallback(
    (request: GitDiffRequest) => {
      onOpenGitDiff(request.path, request.section)
    },
    [onOpenGitDiff],
  )

  const handleOpenSearchResult = useCallback(
    (result: FsSearchResult) => {
      onOpenFileView(result.path, 'source')
      window.setTimeout(() => {
        requestFocusSourcePosition({
          path: result.path,
          line: result.line,
          column: result.column,
          endColumn: result.end_column,
        })
      }, 80)
    },
    [onOpenFileView],
  )

  return {
    handleCreateFile,
    handleCreateFolder,
    handleOpenFile,
    handleOpenFileView,
    handleOpenGitDiff,
    handleOpenSearchResult,
    handleRebuildSearchIndex,
    searchIndexRebuilding,
  }
}
