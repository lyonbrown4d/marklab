import keyBy from 'lodash-es/keyBy'
import type { FileEntry } from '@/store/useAppStore'
import type { FsIndexedMarkdownFile, FsWorkspaceIndex } from '@/services/fsApi'
import {
  createFileLabel,
  extractHeadings,
  extractLinks,
  isExternalLink,
  normalizeHeadingAnchor,
  resolveRelativePath,
  splitLinkTarget,
} from '@/logic/paths'

type MarkdownLink = ReturnType<typeof extractLinks>[number]

const MARKDOWN_EXTENSIONS = /\.(md|markdown)$/i

export type MarkdownSourceDiagnosticSeverity = 'error' | 'warning'

export type MarkdownSourceDiagnostic = {
  line: number
  startColumn: number
  endColumn: number
  message: string
  severity: MarkdownSourceDiagnosticSeverity
}

export const MARKDOWN_SOURCE_LINK_DIAGNOSTIC_OWNER = 'markdown-source-link'

type MarkdownDiagnosticsContext = {
  activePath: string | null
  content: string
  files: FileEntry[]
  fileContents: Record<string, string>
  workspaceIndex?: FsWorkspaceIndex | null
}

export const getMarkdownSourceDiagnostics = ({
  activePath,
  content,
  files,
  fileContents,
  workspaceIndex,
}: MarkdownDiagnosticsContext): MarkdownSourceDiagnostic[] => {
  if (!activePath) return []

  const indexedFilesByPath = keyBy(workspaceIndex?.files ?? [], 'path') as Record<
    string,
    FsIndexedMarkdownFile
  >
  const markdownFiles = workspaceIndex
    ? workspaceIndex.files.map((file) => file.path)
    : files
        .filter((file) => file.kind === 'file' && MARKDOWN_EXTENSIONS.test(file.path))
        .map((file) => file.path)
  const markdownFileSet = new Set(markdownFiles)
  const wikiNameIndex = buildWikiNameIndex(markdownFiles)

  const lines = content.split(/\r?\n/)
  const links = extractLinks(content)
  const diagnostics: MarkdownSourceDiagnostic[] = []

  for (const link of links) {
    if (!isExternalLink(link.target)) {
      const lineText = lines[link.line - 1] ?? ''
      const linkSuffix = lineText.slice(Math.max(0, link.column - 1))
      const linkMatch = resolveLinkTargetText(link.type, linkSuffix)
      if (!linkMatch) continue

      if (link.type === 'wiki') {
        const wikiTarget = link.target.trim()
        const resolvedPath = resolveWikiTarget(wikiTarget, wikiNameIndex, markdownFileSet)
        if (!resolvedPath) {
          diagnostics.push({
            line: link.line,
            startColumn: link.column + linkMatch.startOffset,
            endColumn: link.column + linkMatch.endOffset,
            message: `Cannot find linked note "${wikiTarget}"`,
            severity: 'error',
          })
        }
        continue
      }

      const { path: rawTargetPath, anchor } = splitLinkTarget(link.target)
      const resolvedPath = resolveMarkdownTarget(activePath, rawTargetPath, markdownFileSet)
      if (!resolvedPath) {
        diagnostics.push({
          line: link.line,
          startColumn: link.column + linkMatch.startOffset,
          endColumn: link.column + linkMatch.endOffset,
          message: `Cannot find linked file "${rawTargetPath || activePath}"`,
          severity: 'error',
        })
        continue
      }

      if (anchor) {
        const headings = getHeadingsFromSource(resolvedPath, indexedFilesByPath, fileContents)
        if (headings === null) continue
        const anchorSlug = normalizeHeadingAnchor(anchor)
        if (anchorSlug && !headings.some((heading) => heading.slug === anchorSlug)) {
          diagnostics.push({
            line: link.line,
            startColumn: link.column + linkMatch.startOffset,
            endColumn: link.column + linkMatch.endOffset,
            message: `Cannot find heading "${anchor}" in ${resolvedPath}`,
            severity: 'warning',
          })
        }
      }
    }
  }

  return diagnostics
}

const resolveLinkTargetText = (linkType: MarkdownLink['type'], lineSuffix: string) => {
  if (linkType === 'markdown') {
    const match = lineSuffix.match(/^\[[^\]]*\]\(([^)]*)\)/)
    if (!match) return null
    const targetIndex = match[0].indexOf(match[1] ?? '')
    if (targetIndex < 0) return null
    return {
      startOffset: targetIndex,
      endOffset: targetIndex + Math.max(1, match[1].length),
    }
  }

  const match = lineSuffix.match(/^\[\[([^\]]+)\]\]/)
  if (!match) return null
  const target = match[1] ?? ''
  const targetIndex = match[0].indexOf(target)
  if (targetIndex < 0) return null
  return {
    startOffset: targetIndex,
    endOffset: targetIndex + Math.max(1, target.length),
  }
}

const resolveMarkdownTarget = (activePath: string, target: string, markdownFiles: Set<string>) => {
  if (!target.trim()) return activePath
  const normalized = normalizeRelativePath(activePath, target)
  const candidates = [
    normalized,
    addMarkdownExtensionIfMissing(normalized),
    addMarkdownExtensionIfMissing(normalized, true),
  ]
  for (const candidate of candidates) {
    if (markdownFiles.has(candidate)) return candidate
  }
  return null
}

const resolveWikiTarget = (
  target: string,
  wikiNameIndex: Map<string, string>,
  markdownFiles: Set<string>,
) => {
  const normalized = target.trim()
  if (!normalized) return null
  const direct = wikiNameIndex.get(normalized.toLowerCase())
  if (direct) return direct
  const withExt = addMarkdownExtensionIfMissing(normalized)
  if (markdownFiles.has(withExt)) return withExt
  const withMdExt = addMarkdownExtensionIfMissing(normalized, true)
  if (markdownFiles.has(withMdExt)) return withMdExt
  return null
}

const getHeadingsFromSource = (
  path: string,
  indexedFilesByPath: Record<string, FsIndexedMarkdownFile>,
  fileContents: Record<string, string>,
) => {
  const indexedFile = indexedFilesByPath[path]
  if (indexedFile) return indexedFile.headings
  const content = fileContents[path]
  if (content == null) return null
  return extractHeadings(content)
}

const addMarkdownExtensionIfMissing = (path: string, forceMarkdown = false) => {
  if (!path) return path
  if (MARKDOWN_EXTENSIONS.test(path)) return path
  if (forceMarkdown) return `${path}.markdown`
  return `${path}.md`
}

const normalizeRelativePath = (activePath: string, target: string) => {
  return resolveRelativePath(activePath, target)
}

const buildWikiNameIndex = (paths: string[]) => {
  const index = new Map<string, string>()
  paths.forEach((path) => {
    index.set(path.toLowerCase(), path)
    index.set(createFileLabel(path).toLowerCase(), path)
  })
  return index
}
