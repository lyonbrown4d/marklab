import { TextDocument } from 'vscode-languageserver-textdocument'
import { CompletionItemKind } from 'vscode-languageserver-types'
import type { FsWorkspaceIndex } from '@electron/services/workspace/types.js'
import {
  createFileLabel,
  createRelativeLinkTarget,
} from '@electron/services/markdownLanguage/linkTargets.js'
import {
  fileCompletionSortText,
  rankFileCompletionPaths,
} from '@electron/services/markdownLanguage/completionRanking.js'
import type {
  CompletionRequest,
  MarkdownLanguageCompletionItem,
} from '@electron/services/markdownLanguage/types.js'
import {
  getHeadingCompletions,
  getWikiHeadingCompletions,
} from '@electron/services/markdownLanguage/headingCompletions.js'

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
const WORKSPACE_LINK_TARGET_EXTENSIONS =
  /\.(md|markdown|ics|pdf|drawio|excalidraw|docx?|pptx?|xlsx?|csv|tsv|png|jpe?g|gif|webp|svg|avif|bmp|mp3|wav|ogg|m4a|mp4|webm|mov)$/i

export const createMarkdownCompletions = async (
  request: CompletionRequest,
  workspaceIndex: () => Promise<FsWorkspaceIndex>,
): Promise<MarkdownLanguageCompletionItem[]> => {
  const document = TextDocument.create(markdownUri(request.path), 'markdown', 0, request.content)
  const prefix = getLinePrefix(document, request.line, request.column)

  const fenceContext = getCodeFenceContext(prefix)
  if (fenceContext) {
    return languageCompletions(fenceContext.query, fenceContext.replacementStartColumn)
  }

  const index = await workspaceIndex()
  const wikiContext = getWikiLinkContext(prefix)
  if (wikiContext) {
    const hashIndex = wikiContext.query.indexOf('#')
    if (hashIndex >= 0) {
      return getWikiHeadingCompletions({
        request,
        workspaceIndex: index,
        target: wikiContext.query,
        hashIndex,
        replacementStartColumn: wikiContext.replacementStartColumn,
      })
    }

    return fileCompletions({
      activePath: request.path,
      workspaceIndex: index,
      query: wikiContext.query,
      replacementStartColumn: wikiContext.replacementStartColumn,
      mode: 'wiki',
    })
  }

  const markdownLinkContext = getMarkdownLinkTargetContext(prefix)
  if (!markdownLinkContext) return []

  const hashIndex = markdownLinkContext.target.indexOf('#')
  if (hashIndex >= 0) {
    return getHeadingCompletions({
      request,
      workspaceIndex: index,
      target: markdownLinkContext.target,
      hashIndex,
      replacementStartColumn: markdownLinkContext.replacementStartColumn,
    })
  }

  return fileCompletions({
    activePath: request.path,
    workspaceIndex: index,
    query: markdownLinkContext.target,
    replacementStartColumn: markdownLinkContext.replacementStartColumn,
    mode: 'markdown',
  })
}

const markdownUri = (path: string | null) => {
  return `marklab-markdown://${encodeURIComponent(path ?? 'untitled.md')}`
}

const getLinePrefix = (document: TextDocument, line: number, column: number) => {
  const zeroBasedLine = Math.max(0, Math.min(document.lineCount - 1, line - 1))
  const startOffset = document.offsetAt({ line: zeroBasedLine, character: 0 })
  const endOffset = document.offsetAt({
    line: zeroBasedLine,
    character: Math.max(0, column - 1),
  })
  return document.getText().slice(startOffset, endOffset)
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

const languageCompletions = (
  query: string,
  replacementStartColumn: number,
): MarkdownLanguageCompletionItem[] => {
  const normalizedQuery = query.toLowerCase()
  return LANGUAGE_COMPLETIONS.filter((language) =>
    matchesLanguageQuery(language, normalizedQuery),
  ).map((language) => ({
    label: language,
    kind: 'language',
    insertText: language,
    detail: 'Code fence language',
    replacementStartColumn,
    lspKind: CompletionItemKind.Keyword,
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
  workspaceIndex,
  query,
  replacementStartColumn,
  mode,
}: {
  activePath: string | null
  workspaceIndex: FsWorkspaceIndex
  query: string
  replacementStartColumn: number
  mode: 'markdown' | 'wiki'
}): MarkdownLanguageCompletionItem[] => {
  return rankFileCompletionPaths({
    activePath,
    query,
    paths: workspaceDocumentPaths(workspaceIndex, mode),
  }).map((path) => {
    const label = createFileLabel(path)
    return {
      label,
      kind: 'file',
      insertText: mode === 'wiki' ? label : createRelativeLinkTarget(activePath, path),
      detail: path,
      replacementStartColumn,
      lspKind: CompletionItemKind.File,
      sortText: fileCompletionSortText({ activePath, query, path, label }),
    }
  })
}

const workspaceDocumentPaths = (workspaceIndex: FsWorkspaceIndex, mode: 'markdown' | 'wiki') => {
  const extensionPattern = mode === 'wiki' ? MARKDOWN_EXTENSIONS : WORKSPACE_LINK_TARGET_EXTENSIONS
  const paths = [
    ...workspaceIndex.files.map((file) => file.path),
    ...(workspaceIndex.paths ?? []).filter((path) => extensionPattern.test(path)),
    ...(mode === 'markdown'
      ? (workspaceIndex.asset_paths ?? []).filter((path) => extensionPattern.test(path))
      : []),
  ]

  return Array.from(new Set(paths)).filter((path) => extensionPattern.test(path))
}
