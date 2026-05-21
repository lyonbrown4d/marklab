import type { FileEntry } from '@/store/useAppStore'
import type { FsIndexedMarkdownFile, FsWorkspaceIndex } from '@/services/fsApi'
import {
  createFileLabel,
  extractHeadings,
  normalizeHeadingAnchor,
  normalizePath,
  resolveRelativePath,
} from '@/logic/paths'

export type MarkdownCompletionKind = 'file' | 'heading' | 'language'

export type MarkdownCompletionItem = {
  label: string
  kind: MarkdownCompletionKind
  insertText: string
  detail?: string
  replacementStartColumn: number
}

type MarkdownCompletionContext = {
  activePath: string | null
  content: string
  line: number
  column: number
  files: FileEntry[]
  fileContents: Record<string, string>
  workspaceIndex?: FsWorkspaceIndex | null
}

const LANGUAGE_COMPLETIONS = [
  'bash',
  'css',
  'html',
  'javascript',
  'json',
  'markdown',
  'mermaid',
  'rust',
  'shell',
  'sql',
  'toml',
  'tsx',
  'typescript',
  'yaml',
]

const LANGUAGE_ALIASES: Record<string, string[]> = {
  bash: ['sh'],
  javascript: ['js'],
  markdown: ['md'],
  mermaid: ['mmd'],
  shell: ['sh'],
  typescript: ['ts'],
  yaml: ['yml'],
}

const MARKDOWN_EXTENSIONS = /\.(md|markdown)$/i

export const getMarkdownCompletions = ({
  activePath,
  content,
  line,
  column,
  files,
  fileContents,
  workspaceIndex,
}: MarkdownCompletionContext): MarkdownCompletionItem[] => {
  const currentLine = getLine(content, line)
  const prefix = currentLine.slice(0, Math.max(0, column - 1))

  const fenceContext = getCodeFenceContext(prefix)
  if (fenceContext) {
    return languageCompletions(fenceContext.query, fenceContext.replacementStartColumn)
  }

  const wikiContext = getWikiLinkContext(prefix)
  if (wikiContext) {
    return fileCompletions({
      activePath,
      files,
      workspaceIndex,
      query: wikiContext.query,
      replacementStartColumn: wikiContext.replacementStartColumn,
      mode: 'wiki',
    })
  }

  const markdownLinkContext = getMarkdownLinkTargetContext(prefix)
  if (!markdownLinkContext) return []

  const hashIndex = markdownLinkContext.target.indexOf('#')
  if (hashIndex >= 0) {
    const targetBeforeHash = markdownLinkContext.target.slice(0, hashIndex)
    const query = markdownLinkContext.target.slice(hashIndex + 1)
    const targetPath = targetBeforeHash.trim()
      ? resolveLinkedFilePath(activePath, targetBeforeHash, files, workspaceIndex)
      : activePath
    if (targetBeforeHash.trim() && targetPath !== activePath && workspaceIndex) {
      return headingCompletionsFromIndex({
        file: workspaceIndex.files.find((file) => file.path === targetPath),
        query,
        detailPath: targetPath ?? undefined,
        replacementStartColumn: markdownLinkContext.replacementStartColumn + hashIndex + 1,
      })
    }

    const source = targetPath === activePath ? content : (fileContents[targetPath ?? ''] ?? '')
    return headingCompletions({
      content: source,
      query,
      detailPath: targetPath ?? activePath ?? undefined,
      replacementStartColumn: markdownLinkContext.replacementStartColumn + hashIndex + 1,
    })
  }

  return fileCompletions({
    activePath,
    files,
    workspaceIndex,
    query: markdownLinkContext.target,
    replacementStartColumn: markdownLinkContext.replacementStartColumn,
    mode: 'markdown',
  })
}

const getLine = (content: string, line: number) => {
  return content.split(/\r?\n/)[Math.max(0, line - 1)] ?? ''
}

const getCodeFenceContext = (prefix: string) => {
  const match = prefix.match(/(^|\s)```([\w+-]*)$/)
  if (!match) return null
  const query = match[2] ?? ''
  return {
    query,
    replacementStartColumn: prefix.length - query.length + 1,
  }
}

const getWikiLinkContext = (prefix: string) => {
  const start = prefix.lastIndexOf('[[')
  if (start < 0) return null
  const query = prefix.slice(start + 2)
  if (query.includes(']]')) return null
  return {
    query,
    replacementStartColumn: start + 3,
  }
}

const getMarkdownLinkTargetContext = (prefix: string) => {
  const start = prefix.lastIndexOf('](')
  if (start < 0) return null
  const target = prefix.slice(start + 2)
  if (target.includes(')')) return null
  return {
    target,
    replacementStartColumn: start + 3,
  }
}

const languageCompletions = (query: string, replacementStartColumn: number) => {
  const normalizedQuery = query.toLowerCase()
  return LANGUAGE_COMPLETIONS.filter((language) =>
    matchesLanguageQuery(language, normalizedQuery),
  ).map((language) => ({
    label: language,
    kind: 'language' as const,
    insertText: language,
    detail: 'Code fence language',
    replacementStartColumn,
  }))
}

const matchesLanguageQuery = (language: string, query: string) => {
  if (!query) return true
  return (
    language.includes(query) || (LANGUAGE_ALIASES[language] ?? []).some((alias) => alias === query)
  )
}

const fileCompletions = ({
  activePath,
  files,
  workspaceIndex,
  query,
  replacementStartColumn,
  mode,
}: {
  activePath: string | null
  files: FileEntry[]
  workspaceIndex?: FsWorkspaceIndex | null
  query: string
  replacementStartColumn: number
  mode: 'markdown' | 'wiki'
}) => {
  const normalizedQuery = query.toLowerCase()
  const paths = workspaceIndex
    ? workspaceIndex.files.map((file) => file.path)
    : files
        .filter((file) => file.kind === 'file' && MARKDOWN_EXTENSIONS.test(file.path))
        .map((file) => file.path)
  return paths
    .filter((path) => {
      const label = createFileLabel(path)
      return (
        path.toLowerCase().includes(normalizedQuery) ||
        label.toLowerCase().includes(normalizedQuery)
      )
    })
    .map((path) => {
      const label = createFileLabel(path)
      return {
        label,
        kind: 'file' as const,
        insertText: mode === 'wiki' ? label : createRelativeLinkTarget(activePath, path),
        detail: path,
        replacementStartColumn,
      }
    })
}

const headingCompletions = ({
  content,
  query,
  detailPath,
  replacementStartColumn,
}: {
  content: string
  query: string
  detailPath?: string
  replacementStartColumn: number
}) => {
  const normalizedQuery = normalizeHeadingAnchor(query)
  const lowerQuery = query.toLowerCase()
  return extractHeadings(content)
    .filter((heading) => {
      if (!query) return true
      return (
        heading.slug.includes(normalizedQuery) || heading.text.toLowerCase().includes(lowerQuery)
      )
    })
    .map((heading) => ({
      label: heading.text,
      kind: 'heading' as const,
      insertText: heading.slug,
      detail: detailPath ? `${detailPath}#${heading.slug}` : `#${heading.slug}`,
      replacementStartColumn,
    }))
}

const headingCompletionsFromIndex = ({
  file,
  query,
  detailPath,
  replacementStartColumn,
}: {
  file?: FsIndexedMarkdownFile
  query: string
  detailPath?: string
  replacementStartColumn: number
}) => {
  if (!file) return []
  const normalizedQuery = normalizeHeadingAnchor(query)
  const lowerQuery = query.toLowerCase()
  return file.headings
    .filter((heading) => {
      if (!query) return true
      return (
        heading.slug.includes(normalizedQuery) || heading.text.toLowerCase().includes(lowerQuery)
      )
    })
    .map((heading) => ({
      label: heading.text,
      kind: 'heading' as const,
      insertText: heading.slug,
      detail: detailPath ? `${detailPath}#${heading.slug}` : `#${heading.slug}`,
      replacementStartColumn,
    }))
}

const createRelativeLinkTarget = (activePath: string | null, targetPath: string) => {
  if (!activePath) return targetPath
  const fromDir = activePath.split('/').slice(0, -1)
  const targetParts = targetPath.split('/')
  const targetFile = targetParts[targetParts.length - 1] ?? targetPath
  const targetDir = targetParts.slice(0, -1)

  let commonLength = 0
  while (
    commonLength < fromDir.length &&
    commonLength < targetDir.length &&
    fromDir[commonLength] === targetDir[commonLength]
  ) {
    commonLength += 1
  }

  const up = new Array(fromDir.length - commonLength).fill('..')
  const down = targetDir.slice(commonLength)
  return [...up, ...down, targetFile].join('/') || targetPath
}

const resolveLinkedFilePath = (
  activePath: string | null,
  target: string,
  files: FileEntry[],
  workspaceIndex?: FsWorkspaceIndex | null,
) => {
  if (!activePath) return null
  if (!target.trim()) return activePath

  const normalized = resolveRelativePath(activePath, target)
  const candidates = [
    normalized,
    MARKDOWN_EXTENSIONS.test(normalized) ? normalized : `${normalized}.md`,
    MARKDOWN_EXTENSIONS.test(normalized) ? normalized : `${normalized}.markdown`,
  ].map(normalizePath)
  const existing = new Set(
    workspaceIndex
      ? workspaceIndex.files.map((file) => file.path)
      : files.filter((file) => file.kind === 'file').map((file) => file.path),
  )
  return candidates.find((candidate) => existing.has(candidate)) ?? candidates[0]
}
