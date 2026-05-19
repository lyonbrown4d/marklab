import { useDeferredValue, useEffect, useMemo, useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import keyBy from 'lodash-es/keyBy'
import { useWorkspaceMarkdownContents } from '@/app/useWorkspaceMarkdownContents'
import {
  getMarkdownSourceDiagnostics,
  type MarkdownSourceDiagnostic,
} from '@/logic/markdownDiagnostics'
import {
  createFileLabel,
  extractHeadings,
  extractLinks,
  isExternalLink,
  resolveRelativePath,
  splitLinkTarget,
} from '@/logic/paths'
import { fsApi, type FsIndexedMarkdownFile, type FsWorkspaceIndex } from '@/services/fsApi'
import type { FileEntry } from '@/store/useAppStore'
import { isTauriRuntime } from '@/utils/tauri'
import type { SidebarBacklink } from '@/components/RightSidebarContent'

type UseRightSidebarDataArgs = {
  collapsed: boolean
  activePath: string | null
  targetPath: string | null
  editorValue: string
  files: FileEntry[]
  fileContents: Record<string, string>
  dirtyPaths?: Record<string, true>
  workspaceIndex?: FsWorkspaceIndex | null
}

export function useRightSidebarData({
  collapsed,
  activePath,
  targetPath,
  editorValue,
  files,
  fileContents,
  dirtyPaths = {},
  workspaceIndex,
}: UseRightSidebarDataArgs) {
  const tauriAvailable = isTauriRuntime()
  const deferredEditorValue = useDeferredValue(editorValue)
  const deferredFileContents = useDeferredValue(fileContents)
  const deferredTargetPath = useDeferredValue(targetPath)
  const metadataQuery = useQuery({
    queryKey: ['path-metadata', targetPath],
    queryFn: () => fsApi.getPathMetadata(targetPath ?? ''),
    enabled: !collapsed && tauriAvailable && Boolean(targetPath),
    staleTime: 10_000,
  })
  const displayMetadata = useMemo(() => {
    if (!targetPath) return null
    if (!tauriAvailable) {
      return {
        path: targetPath,
        absolute_path: targetPath,
        kind: 'file' as const,
        size_bytes: 0,
        readonly: false,
      }
    }
    const metadata = metadataQuery.data
    if (!metadata || metadata.path !== targetPath) return null
    return metadata
  }, [metadataQuery.data, targetPath, tauriAvailable])
  const indexedFilesByPath = useMemo(() => {
    if (!workspaceIndex) return null
    return keyBy(workspaceIndex.files, 'path')
  }, [workspaceIndex])
  const indexedTargetFile = deferredTargetPath
    ? indexedFilesByPath?.[deferredTargetPath]
    : undefined
  const targetIsDirty = Boolean(deferredTargetPath && dirtyPaths[deferredTargetPath])
  const shouldUseIndexedTarget = Boolean(indexedTargetFile && !targetIsDirty)
  const shouldWaitForIndexedActiveTarget = Boolean(
    tauriAvailable &&
    !workspaceIndex &&
    deferredTargetPath &&
    deferredTargetPath === activePath &&
    !targetIsDirty,
  )
  const workspaceContents = useWorkspaceMarkdownContents(
    files,
    deferredFileContents,
    !collapsed && !workspaceIndex && !tauriAvailable,
  )
  const targetContent = useMemo(() => {
    if (collapsed) return ''
    if (!deferredTargetPath) return ''
    if (shouldUseIndexedTarget || shouldWaitForIndexedActiveTarget) return ''
    if (deferredTargetPath === activePath) return deferredEditorValue
    return workspaceContents[deferredTargetPath] ?? ''
  }, [
    activePath,
    collapsed,
    deferredEditorValue,
    deferredTargetPath,
    shouldUseIndexedTarget,
    shouldWaitForIndexedActiveTarget,
    workspaceContents,
  ])
  const statsContent = useMemo(() => {
    if (collapsed) return ''
    if (!deferredTargetPath) return ''
    if (deferredTargetPath === activePath) return deferredEditorValue
    return workspaceContents[deferredTargetPath] ?? ''
  }, [activePath, collapsed, deferredEditorValue, deferredTargetPath, workspaceContents])
  const outline = useMemo(() => {
    if (collapsed) return []
    if (shouldUseIndexedTarget && indexedTargetFile) {
      return indexedTargetFile.headings
    }
    if (shouldWaitForIndexedActiveTarget) return []
    return extractHeadings(targetContent)
  }, [
    collapsed,
    indexedTargetFile,
    shouldUseIndexedTarget,
    shouldWaitForIndexedActiveTarget,
    targetContent,
  ])
  const backlinks = useMemo<SidebarBacklink[]>(() => {
    if (collapsed) return []
    if (!deferredTargetPath) return []

    if (workspaceIndex) {
      return workspaceIndex.files.flatMap((file) => {
        if (file.path === deferredTargetPath) return []
        return file.links
          .filter((link) => !link.is_external && link.target_path === deferredTargetPath)
          .map((link) => ({
            sourcePath: file.path,
            text: link.text || link.target,
            context: link.context,
            line: link.line,
            column: link.column,
          }))
      })
    }

    const nameIndex = new Map<string, string>()
    files
      .filter((file) => file.kind === 'file')
      .forEach((file) => {
        nameIndex.set(createFileLabel(file.path).toLowerCase(), file.path)
      })

    const results: SidebarBacklink[] = []
    files
      .filter((file) => file.kind === 'file' && file.path !== deferredTargetPath)
      .forEach((file) => {
        const content =
          file.path === activePath ? deferredEditorValue : (workspaceContents[file.path] ?? '')
        extractLinks(content).forEach((link) => {
          const linkedPath = normalizeLinkedPath(file.path, link, nameIndex)
          if (linkedPath !== deferredTargetPath) return
          results.push({
            sourcePath: file.path,
            text: link.text || link.target,
            context: link.context,
            line: link.line,
            column: link.column,
          })
        })
      })
    return results
  }, [
    activePath,
    collapsed,
    deferredEditorValue,
    deferredTargetPath,
    files,
    workspaceContents,
    workspaceIndex,
  ])
  const problems = useMemo(() => {
    if (collapsed) return []
    if (shouldUseIndexedTarget && indexedTargetFile) {
      return getIndexedMarkdownSourceDiagnostics({
        activePath: deferredTargetPath,
        file: indexedTargetFile,
        workspaceIndex,
      })
    }
    if (shouldWaitForIndexedActiveTarget) return []
    return getMarkdownSourceDiagnostics({
      activePath: deferredTargetPath,
      content: targetContent,
      files,
      fileContents: workspaceContents,
      workspaceIndex,
    })
  }, [
    collapsed,
    deferredTargetPath,
    files,
    indexedTargetFile,
    shouldUseIndexedTarget,
    shouldWaitForIndexedActiveTarget,
    targetContent,
    workspaceContents,
    workspaceIndex,
  ])
  const documentStats = useIdleDocumentStats(statsContent, !collapsed)
  const outgoingLinkCount = useMemo(() => {
    if (collapsed) return 0
    if (!deferredTargetPath) return 0
    if (shouldUseIndexedTarget && indexedTargetFile) {
      return indexedTargetFile.links.filter((link) => !link.is_external).length
    }
    if (shouldWaitForIndexedActiveTarget) return 0
    return extractLinks(targetContent).filter((link) => !isExternalLink(link.target)).length
  }, [
    collapsed,
    deferredTargetPath,
    indexedTargetFile,
    shouldUseIndexedTarget,
    shouldWaitForIndexedActiveTarget,
    targetContent,
  ])
  const errorProblems = useMemo(
    () => problems.filter((problem) => problem.severity === 'error'),
    [problems],
  )
  const warningProblems = useMemo(
    () => problems.filter((problem) => problem.severity !== 'error'),
    [problems],
  )

  return {
    outline,
    backlinks,
    problems,
    errorProblems,
    warningProblems,
    documentStats,
    outgoingLinkCount,
    displayMetadata,
    loadingMetadata: metadataQuery.isFetching && !metadataQuery.data,
  }
}

const normalizeLinkedPath = (
  sourcePath: string,
  link: ReturnType<typeof extractLinks>[number],
  nameIndex: Map<string, string>,
) => {
  if (isExternalLink(link.target)) return null

  const { path: linkPath } = splitLinkTarget(link.target)
  if (link.type === 'wiki') {
    return nameIndex.get(linkPath.toLowerCase()) ?? `${linkPath}.md`
  }

  if (linkPath.trim().length === 0) {
    return sourcePath
  }

  const normalized = resolveRelativePath(sourcePath, linkPath)
  if (!normalized) return null
  return normalized.endsWith('.md') || normalized.endsWith('.markdown')
    ? normalized
    : `${normalized}.md`
}

type IdleWindow = Window & {
  cancelIdleCallback?: (handle: number) => void
  requestIdleCallback?: (callback: IdleRequestCallback, options?: IdleRequestOptions) => number
}

const EMPTY_DOCUMENT_STATS = {
  lines: 0,
  words: 0,
}

const scheduleIdleUpdate = (callback: () => void) => {
  const idleWindow = window as IdleWindow

  if (idleWindow.requestIdleCallback && idleWindow.cancelIdleCallback) {
    const handle = idleWindow.requestIdleCallback(callback, { timeout: 900 })
    return () => idleWindow.cancelIdleCallback?.(handle)
  }

  const timer = window.setTimeout(callback, 160)
  return () => window.clearTimeout(timer)
}

const useIdleDocumentStats = (value: string, enabled: boolean) => {
  const [stats, setStats] = useState(EMPTY_DOCUMENT_STATS)

  useEffect(() => {
    if (!enabled) return

    return scheduleIdleUpdate(() => {
      setStats(getDocumentStats(value))
    })
  }, [enabled, value])

  return enabled ? stats : EMPTY_DOCUMENT_STATS
}

const getIndexedMarkdownSourceDiagnostics = ({
  activePath,
  file,
  workspaceIndex,
}: {
  activePath: string | null
  file: FsIndexedMarkdownFile
  workspaceIndex?: FsWorkspaceIndex | null
}): MarkdownSourceDiagnostic[] => {
  if (!activePath || !workspaceIndex) return []

  const markdownFileSet = new Set(workspaceIndex.files.map((item) => item.path))
  const diagnostics: MarkdownSourceDiagnostic[] = []

  file.links.forEach((link) => {
    if (link.is_external) return

    const startColumn = link.column
    const endColumn = startColumn + Math.max(1, link.target.length)

    if (!link.target_path || !markdownFileSet.has(link.target_path)) {
      if (link.link_type === 'wiki') {
        diagnostics.push({
          line: link.line,
          startColumn,
          endColumn,
          message: `Cannot find linked note "${link.target}"`,
          severity: 'error',
        })
        return
      }

      const { path } = splitLinkTarget(link.target)
      diagnostics.push({
        line: link.line,
        startColumn,
        endColumn,
        message: `Cannot find linked file "${path || activePath}"`,
        severity: 'error',
      })
      return
    }

    if (link.target_anchor && !link.target_heading_slug) {
      diagnostics.push({
        line: link.line,
        startColumn,
        endColumn,
        message: `Cannot find heading "${link.target_anchor}" in ${link.target_path}`,
        severity: 'warning',
      })
    }
  })

  return diagnostics
}

const getDocumentStats = (value: string) => {
  const trimmed = value.trim()
  return {
    lines: value.length === 0 ? 0 : value.split(/\r\n|\r|\n/).length,
    words: trimmed.length === 0 ? 0 : trimmed.split(/\s+/).filter(Boolean).length,
  }
}
