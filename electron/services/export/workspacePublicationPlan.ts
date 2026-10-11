import path from 'node:path'
import type { FsIndexedMarkdownFile, FsWorkspaceIndex } from '@electron/services/workspace/types'
import { parseMarkdown, plainTextFromInlines } from '@electron/services/export/markdown'
import type { MarkdownBlock } from '@electron/services/export/markdown'
import type { WorkspaceDocument } from '@electron/services/workspace/workspaceDocumentLoader'
import type {
  WorkspacePublicationChapter,
  WorkspacePublicationPlan,
} from '@/types/workspacePublication'

const WORDS_PER_PAGE = 430
const ENTRY_FILE_NAMES = new Set(['readme', 'index', 'home', 'intro', 'introduction', 'overview'])

export const buildWorkspacePublicationPlan = (
  index: FsWorkspaceIndex,
  documents: WorkspaceDocument[],
  workspaceTitle: string,
): WorkspacePublicationPlan => {
  const documentsByPath = new Map(documents.map((document) => [document.path, document]))
  const files = index.files.filter((file) => documentsByPath.has(file.path))
  const paths = new Set(files.map((file) => file.path))
  const adjacency = new Map<string, string[]>()
  const incoming = new Map(files.map((file) => [file.path, 0]))

  files.forEach((file) => {
    const targets = uniqueLinkedPaths(file, paths)
    adjacency.set(file.path, targets)
    targets.forEach((target) => incoming.set(target, (incoming.get(target) ?? 0) + 1))
  })

  const fileByPath = new Map(files.map((file) => [file.path, file]))
  const visited = new Set<string>()
  const ordered: Array<{ depth: number; orphaned: boolean; path: string }> = []
  const visit = (filePath: string, depth: number, orphaned: boolean) => {
    if (visited.has(filePath)) return
    visited.add(filePath)
    ordered.push({ depth: Math.min(depth, 2), orphaned, path: filePath })
    for (const target of adjacency.get(filePath) ?? []) visit(target, depth + 1, orphaned)
  }

  const roots = files.filter((file) => incoming.get(file.path) === 0).sort(compareEntryFiles)
  const primaryRoot = roots[0]
  if (primaryRoot) visit(primaryRoot.path, 0, false)
  files.sort(compareEntryFiles).forEach((file) => visit(file.path, 0, true))

  const chapters = ordered.map(({ depth, orphaned, path: filePath }) =>
    chapterFromDocument(fileByPath.get(filePath), documentsByPath.get(filePath), depth, orphaned),
  )
  return {
    chapters,
    estimatedPages: chapters.reduce((total, chapter) => total + chapter.estimatedPages, 0) + 2,
    orphanCount: chapters.filter((chapter) => chapter.orphaned).length,
    title: workspaceTitle || 'Marklab Workspace',
    totalWords: chapters.reduce((total, chapter) => total + chapter.wordCount, 0),
  }
}

const uniqueLinkedPaths = (file: FsIndexedMarkdownFile, paths: Set<string>): string[] => {
  const seen = new Set<string>()
  return [...file.links]
    .sort((left, right) => left.line - right.line || left.column - right.column)
    .flatMap((link) => {
      const target = link.target_path
      if (!target || target === file.path || !paths.has(target) || seen.has(target)) return []
      seen.add(target)
      return [target]
    })
}

const compareEntryFiles = (left: FsIndexedMarkdownFile, right: FsIndexedMarkdownFile): number => {
  const leftRank = entryRank(left.path)
  const rightRank = entryRank(right.path)
  return leftRank - rightRank || left.path.localeCompare(right.path, undefined, { numeric: true })
}

const entryRank = (filePath: string): number => {
  const name = path.basename(filePath, path.extname(filePath)).toLowerCase()
  return ENTRY_FILE_NAMES.has(name) ? 0 : 1
}

const chapterFromDocument = (
  file: FsIndexedMarkdownFile | undefined,
  document: WorkspaceDocument | undefined,
  depth: number,
  orphaned: boolean,
): WorkspacePublicationChapter => {
  const blocks = parseMarkdown(document?.content ?? '')
  const text = blocks.flatMap(blockText).join(' ').replace(/\s+/g, ' ').trim()
  const wordCount = countWords(text)
  return {
    depth,
    estimatedPages: Math.max(1, Math.ceil(wordCount / WORDS_PER_PAGE)),
    excerpt: text.slice(0, 220),
    orphaned,
    path: file?.path ?? document?.path ?? '',
    title: file?.headings[0]?.text || fileName(file?.path ?? document?.path ?? ''),
    wordCount,
  }
}

const blockText = (block: MarkdownBlock): string[] => {
  if (block.type === 'heading' || block.type === 'paragraph') {
    return [plainTextFromInlines(block.children)]
  }
  if (block.type === 'blockquote') return block.blocks.flatMap(blockText)
  if (block.type === 'list') return block.items.map(plainTextFromInlines)
  if (block.type === 'table')
    return [...block.header, ...block.rows.flat()].map(plainTextFromInlines)
  if (block.type === 'codeBlock') return [block.text]
  return []
}

const countWords = (value: string): number => {
  const latinWords = value.match(/[A-Za-z0-9_]+/g)?.length ?? 0
  const cjkCharacters =
    value.match(/[\p{Script=Han}\p{Script=Hiragana}\p{Script=Katakana}]/gu)?.length ?? 0
  return latinWords + cjkCharacters
}

const fileName = (filePath: string): string =>
  path.basename(filePath, path.extname(filePath)) || 'Untitled'
