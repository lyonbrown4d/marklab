import { TextDocument } from 'vscode-languageserver-textdocument'
import { parseMarkdownDocument } from '@electron/services/workspace/markdown.js'
import type { FsIndexedMarkdownFile, FsWorkspaceIndex } from '@electron/services/workspace/types.js'
import {
  createFileLabel,
  normalizeHeadingAnchor,
  resolveLinkedFilePath,
} from '@electron/services/markdownLanguage/linkTargets.js'
import type {
  CompletionRequest,
  MarkdownLanguageDefinition,
} from '@electron/services/markdownLanguage/types.js'

type LinkTarget =
  | {
      kind: 'markdown'
      target: string
    }
  | {
      kind: 'wiki'
      target: string
    }

export const getMarkdownDefinition = async (
  request: CompletionRequest,
  workspaceIndex: () => Promise<FsWorkspaceIndex>,
): Promise<MarkdownLanguageDefinition | null> => {
  if (!request.path) return null

  const document = TextDocument.create(
    `marklab-markdown://${encodeURIComponent(request.path)}`,
    'markdown',
    0,
    request.content,
  )
  const lineText = getLineText(document, request.line)
  const target = getLinkTargetAtColumn(lineText, request.column)
  if (!target) return null

  const index = await workspaceIndex()
  const resolved = resolveTarget({
    activePath: request.path,
    content: request.content,
    target,
    workspaceIndex: index,
  })
  if (!resolved.file) return null

  if (!resolved.anchor) {
    return {
      path: resolved.file.path,
      line: 1,
      column: 1,
    }
  }

  const normalizedAnchor = normalizeHeadingAnchor(resolved.anchor)
  const heading = resolved.file.headings.find((item) => item.slug === normalizedAnchor)
  if (!heading) return null

  return {
    path: resolved.file.path,
    line: heading.line,
    column: 1,
    endColumn: Math.max(2, heading.text.length + 1),
    headingSlug: heading.slug,
  }
}

const getLineText = (document: TextDocument, line: number) => {
  const zeroBasedLine = Math.max(0, Math.min(document.lineCount - 1, line - 1))
  const startOffset = document.offsetAt({ line: zeroBasedLine, character: 0 })
  const endOffset = document.offsetAt({
    line: zeroBasedLine,
    character: Number.MAX_SAFE_INTEGER,
  })
  return document.getText().slice(startOffset, endOffset)
}

const getLinkTargetAtColumn = (lineText: string, column: number): LinkTarget | null => {
  const character = Math.max(0, column - 1)
  return getMarkdownLinkTarget(lineText, character) ?? getWikiLinkTarget(lineText, character)
}

const getMarkdownLinkTarget = (lineText: string, character: number): LinkTarget | null => {
  const markdownLinkPattern = /\[[^\]]*]\(([^)]*)\)/g
  for (const match of lineText.matchAll(markdownLinkPattern)) {
    const matchStart = match.index ?? 0
    const target = match[1] ?? ''
    const targetStart = matchStart + match[0].lastIndexOf('(') + 1
    const targetEnd = targetStart + target.length
    if (character >= matchStart && character <= targetEnd) {
      return { kind: 'markdown', target }
    }
  }
  return null
}

const getWikiLinkTarget = (lineText: string, character: number): LinkTarget | null => {
  const wikiLinkPattern = /\[\[([^\]]+)]]/g
  for (const match of lineText.matchAll(wikiLinkPattern)) {
    const matchStart = match.index ?? 0
    const target = match[1] ?? ''
    const targetStart = matchStart + 2
    const targetEnd = targetStart + target.length
    if (character >= matchStart && character <= targetEnd) {
      return { kind: 'wiki', target }
    }
  }
  return null
}

const resolveTarget = ({
  activePath,
  content,
  target,
  workspaceIndex,
}: {
  activePath: string
  content: string
  target: LinkTarget
  workspaceIndex: FsWorkspaceIndex
}): { file: FsIndexedMarkdownFile | null; anchor: string | null } => {
  if (target.kind === 'wiki') {
    return resolveWikiTarget(activePath, content, target.target, workspaceIndex)
  }
  return resolveMarkdownTarget(activePath, content, target.target, workspaceIndex)
}

const resolveMarkdownTarget = (
  activePath: string,
  content: string,
  rawTarget: string,
  workspaceIndex: FsWorkspaceIndex,
) => {
  const [pathPart = '', anchor = null] = rawTarget.split('#')
  const targetPath = pathPart.trim()
    ? resolveLinkedFilePath(activePath, pathPart, workspaceIndex)
    : activePath
  return {
    file: getIndexedFile(activePath, content, targetPath, workspaceIndex),
    anchor,
  }
}

const resolveWikiTarget = (
  activePath: string,
  content: string,
  rawTarget: string,
  workspaceIndex: FsWorkspaceIndex,
) => {
  const [fileLabel = '', anchor = null] = rawTarget.split('#')
  const normalizedLabel = fileLabel.trim().toLowerCase()
  const targetPath =
    workspaceIndex.files.find(
      (file) => createFileLabel(file.path).toLowerCase() === normalizedLabel,
    )?.path ?? null
  return {
    file: getIndexedFile(activePath, content, targetPath, workspaceIndex),
    anchor,
  }
}

const getIndexedFile = (
  activePath: string,
  content: string,
  targetPath: string | null,
  workspaceIndex: FsWorkspaceIndex,
) => {
  if (!targetPath) return null
  if (targetPath === activePath) {
    return parseMarkdownDocument(activePath, content)
  }
  return workspaceIndex.files.find((file) => file.path === targetPath) ?? null
}
