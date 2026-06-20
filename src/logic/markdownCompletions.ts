import type { FileEntry } from '@/store/appTypes'
import type { FsIndexedMarkdownFile, FsWorkspaceIndex } from '@/services/fsApi'
import { fileCompletions, resolveLinkedFilePath } from '@/logic/markdownCompletionPaths'
import { extractHeadings, normalizeHeadingAnchor } from '@/logic/paths'

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
