import { TextDocument } from 'vscode-languageserver-textdocument'
import { parseMarkdownDocument } from '@electron/services/workspace/markdown.js'
import {
  hasChildren,
  isLinkNode,
  isTextNode,
  parseMarkdownAst,
  type MarkdownNode,
} from '@electron/services/workspace/markdown/ast.js'
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

const WIKI_LINK_PATTERN = /!?\[\[([^\]\n]+?)]]/g

export const getMarkdownDefinition = async (
  request: CompletionRequest,
  workspaceIndex: () => Promise<FsWorkspaceIndex>,
): Promise<MarkdownLanguageDefinition | null> => {
  if (!request.path) return null

  const target = getLinkTargetAtColumn(request.content, request.line, request.column)
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

const getLinkTargetAtColumn = (
  content: string,
  line: number,
  column: number,
): LinkTarget | null => {
  const document = TextDocument.create('marklab-markdown://definition.md', 'markdown', 0, content)
  const offset = document.offsetAt({
    line: Math.max(0, Math.min(document.lineCount - 1, line - 1)),
    character: Math.max(0, column - 1),
  })
  const tree = parseMarkdownAst(content)
  return getMarkdownLinkTarget(tree, offset) ?? getWikiLinkTarget(tree, offset, false)
}

const getMarkdownLinkTarget = (node: MarkdownNode, offset: number): LinkTarget | null => {
  if (isLinkNode(node) && node.url.trim() && nodeContainsOffset(node, offset)) {
    return { kind: 'markdown', target: node.url }
  }

  if (!hasChildren(node)) return null
  for (const child of node.children) {
    const target = getMarkdownLinkTarget(child, offset)
    if (target) return target
  }
  return null
}

const getWikiLinkTarget = (
  node: MarkdownNode,
  offset: number,
  excluded: boolean,
): LinkTarget | null => {
  const nextExcluded = excluded || excludesWikiTargets(node)

  if (!nextExcluded && isTextNode(node)) {
    const target = getWikiTargetInTextNode(node, offset)
    if (target) return target
  }

  if (!hasChildren(node)) return null
  for (const child of node.children) {
    const target = getWikiLinkTarget(child, offset, nextExcluded)
    if (target) return target
  }
  return null
}

const getWikiTargetInTextNode = (
  node: MarkdownNode & { value: string },
  offset: number,
): LinkTarget | null => {
  const startOffset = node.position?.start.offset
  if (typeof startOffset !== 'number') return null

  WIKI_LINK_PATTERN.lastIndex = 0
  for (const match of node.value.matchAll(WIKI_LINK_PATTERN)) {
    const matchStart = startOffset + (match.index ?? 0)
    const matchEnd = matchStart + (match[0]?.length ?? 0)
    if (offset < matchStart || offset > matchEnd) continue

    const raw = (match[1] ?? '').trim()
    const separator = raw.indexOf('|')
    const target = (separator >= 0 ? raw.slice(0, separator) : raw).trim()
    if (!target) return null
    return { kind: 'wiki', target }
  }

  return null
}

const nodeContainsOffset = (node: MarkdownNode, offset: number): boolean => {
  const start = node.position?.start.offset
  const end = node.position?.end.offset
  return typeof start === 'number' && typeof end === 'number' && offset >= start && offset <= end
}

const excludesWikiTargets = (node: MarkdownNode): boolean => {
  return [
    'definition',
    'html',
    'inlineCode',
    'code',
    'link',
    'linkReference',
    'image',
    'imageReference',
  ].includes(node.type)
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
