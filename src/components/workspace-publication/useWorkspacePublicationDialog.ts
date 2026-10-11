import { useCallback, useEffect, useMemo, useState } from 'react'
import { flushEditorChanges } from '@/app/editorCloseLifecycle'
import { workspacePublicationApi } from '@/services/workspacePublicationApi'
import { useI18n } from '@/i18n/useI18n'
import type { WorkspacePublicationOptions } from '@/types/workspacePublication'
import {
  createPreviewPages,
  defaultPublicationOptions,
  type PublicationChapterSelection,
} from '@/components/workspace-publication/workspacePublicationModel'

type UseWorkspacePublicationDialogOptions = {
  onExportQueued: () => void
  rootPath: string
}

export const useWorkspacePublicationDialog = ({
  onExportQueued,
  rootPath,
}: UseWorkspacePublicationDialogOptions) => {
  const { locale } = useI18n()
  const [chapters, setChapters] = useState<PublicationChapterSelection[]>([])
  const [options, setOptions] = useState(() => defaultPublicationOptions(locale))
  const [loading, setLoading] = useState(true)
  const [exporting, setExporting] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [query, setQuery] = useState('')
  const [selectedPath, setSelectedPath] = useState<string | null>(null)

  useEffect(() => {
    let cancelled = false
    void workspacePublicationApi
      .loadPlan()
      .then((plan) => {
        if (cancelled) return
        const nextChapters = plan.chapters.map((chapter) => ({ ...chapter, included: true }))
        setChapters(nextChapters)
        setOptions({ ...defaultPublicationOptions(locale), title: plan.title })
        setSelectedPath(nextChapters[0]?.path ?? null)
        setQuery('')
      })
      .catch((reason) => {
        if (!cancelled) setError(String(reason))
      })
      .finally(() => {
        if (!cancelled) setLoading(false)
      })
    return () => {
      cancelled = true
    }
  }, [locale])

  const includedChapters = useMemo(() => chapters.filter((chapter) => chapter.included), [chapters])
  const previewPages = useMemo(() => createPreviewPages(chapters, options), [chapters, options])
  const estimatedPages = useMemo(
    () =>
      includedChapters.reduce((total, chapter) => total + chapter.estimatedPages, 0) +
      Number(options.cover) +
      Number(options.tableOfContents),
    [includedChapters, options.cover, options.tableOfContents],
  )
  const totalWords = useMemo(
    () => includedChapters.reduce((total, chapter) => total + chapter.wordCount, 0),
    [includedChapters],
  )
  const orphanCount = includedChapters.filter((chapter) => chapter.orphaned).length

  const setOption = useCallback(
    <Key extends keyof WorkspacePublicationOptions>(
      key: Key,
      value: WorkspacePublicationOptions[Key],
    ) => setOptions((current) => ({ ...current, [key]: value })),
    [],
  )
  const toggleChapter = useCallback((path: string, included: boolean) => {
    setChapters((current) =>
      current.map((chapter) => (chapter.path === path ? { ...chapter, included } : chapter)),
    )
  }, [])
  const toggleAll = useCallback((included: boolean) => {
    setChapters((current) => current.map((chapter) => ({ ...chapter, included })))
  }, [])
  const moveChapter = useCallback((sourcePath: string, targetPath: string) => {
    if (sourcePath === targetPath) return
    setChapters((current) => {
      const sourceIndex = current.findIndex((chapter) => chapter.path === sourcePath)
      const targetIndex = current.findIndex((chapter) => chapter.path === targetPath)
      if (sourceIndex < 0 || targetIndex < 0) return current
      const next = [...current]
      const [source] = next.splice(sourceIndex, 1)
      if (!source) return current
      next.splice(targetIndex, 0, source)
      return next
    })
  }, [])
  const moveChapterBy = useCallback((path: string, offset: number) => {
    setChapters((current) => {
      const index = current.findIndex((chapter) => chapter.path === path)
      const target = index + offset
      if (index < 0 || target < 0 || target >= current.length) return current
      const next = [...current]
      const [chapter] = next.splice(index, 1)
      if (!chapter) return current
      next.splice(target, 0, chapter)
      return next
    })
  }, [])
  const exportPublication = useCallback(async () => {
    if (includedChapters.length === 0 || exporting) return
    setExporting(true)
    setError(null)
    try {
      await flushEditorChanges()
      const taskId = await workspacePublicationApi.exportPublication(
        includedChapters.map(({ path, title }) => ({ path, title })),
        options,
        rootPath,
      )
      if (taskId) onExportQueued()
    } catch (reason) {
      setError(String(reason))
    } finally {
      setExporting(false)
    }
  }, [exporting, includedChapters, onExportQueued, options, rootPath])

  return {
    chapters,
    error,
    estimatedPages,
    exporting,
    includedChapters,
    loading,
    moveChapter,
    moveChapterBy,
    options,
    orphanCount,
    previewPages,
    query,
    selectedPath,
    setOption,
    setQuery,
    setSelectedPath,
    toggleAll,
    toggleChapter,
    totalWords,
    exportPublication,
  }
}
