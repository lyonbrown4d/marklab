import { CompletionItemKind } from 'vscode-languageserver-types'
import { parseMarkdownDocument } from '@electron/services/workspace/markdown.js'
import type { FsIndexedMarkdownFile, FsWorkspaceIndex } from '@electron/services/workspace/types.js'
import {
  createFileLabel,
  resolveLinkedFilePath,
} from '@electron/services/markdownLanguage/linkTargets.js'
import {
  headingCompletionSortText,
  rankHeadingCompletionItems,
} from '@electron/services/markdownLanguage/completionRanking.js'
import type {
  CompletionRequest,
  MarkdownLanguageCompletionItem,
} from '@electron/services/markdownLanguage/types.js'

export const getWikiHeadingCompletions = ({
  request,
  workspaceIndex,
  target,
  hashIndex,
  replacementStartColumn,
}: {
  request: CompletionRequest
  workspaceIndex: FsWorkspaceIndex
  target: string
  hashIndex: number
  replacementStartColumn: number
}): MarkdownLanguageCompletionItem[] => {
  const targetBeforeHash = target.slice(0, hashIndex)
  const query = target.slice(hashIndex + 1)
  const targetPath = targetBeforeHash.trim()
    ? resolveWikiLinkFilePath(request.path, targetBeforeHash, workspaceIndex)
    : request.path
  const anchorReplacementStartColumn = replacementStartColumn + hashIndex + 1

  if (targetPath === request.path) {
    return headingCompletionsFromFile({
      file: parseMarkdownDocument(request.path ?? '', request.content),
      query,
      detailPath: request.path ?? undefined,
      replacementStartColumn: anchorReplacementStartColumn,
    })
  }

  return headingCompletionsFromFile({
    file: workspaceIndex.files.find((file) => file.path === targetPath),
    query,
    detailPath: targetPath ?? undefined,
    replacementStartColumn: anchorReplacementStartColumn,
  })
}

export const getHeadingCompletions = ({
  request,
  workspaceIndex,
  target,
  hashIndex,
  replacementStartColumn,
}: {
  request: CompletionRequest
  workspaceIndex: FsWorkspaceIndex
  target: string
  hashIndex: number
  replacementStartColumn: number
}): MarkdownLanguageCompletionItem[] => {
  const targetBeforeHash = target.slice(0, hashIndex)
  const query = target.slice(hashIndex + 1)
  const targetPath = targetBeforeHash.trim()
    ? resolveLinkedFilePath(request.path, targetBeforeHash, workspaceIndex)
    : request.path
  const anchorReplacementStartColumn = replacementStartColumn + hashIndex + 1

  if (targetPath === request.path) {
    return headingCompletionsFromFile({
      file: parseMarkdownDocument(request.path ?? '', request.content),
      query,
      detailPath: request.path ?? undefined,
      replacementStartColumn: anchorReplacementStartColumn,
    })
  }

  return headingCompletionsFromFile({
    file: workspaceIndex.files.find((file) => file.path === targetPath),
    query,
    detailPath: targetPath ?? undefined,
    replacementStartColumn: anchorReplacementStartColumn,
  })
}

const resolveWikiLinkFilePath = (
  activePath: string | null,
  target: string,
  workspaceIndex: FsWorkspaceIndex,
) => {
  const normalizedTarget = target.trim().toLowerCase()
  if (!normalizedTarget) return activePath

  const indexedFile = workspaceIndex.files.find((file) => {
    const normalizedPath = file.path.toLowerCase()
    const label = createFileLabel(file.path).toLowerCase()
    return (
      normalizedPath === normalizedTarget ||
      label === normalizedTarget ||
      normalizedPath === `${normalizedTarget}.md` ||
      normalizedPath === `${normalizedTarget}.markdown`
    )
  })

  return indexedFile?.path ?? resolveLinkedFilePath(activePath, target, workspaceIndex)
}

const headingCompletionsFromFile = ({
  file,
  query,
  detailPath,
  replacementStartColumn,
}: {
  file?: FsIndexedMarkdownFile
  query: string
  detailPath?: string
  replacementStartColumn: number
}): MarkdownLanguageCompletionItem[] => {
  if (!file) return []
  return rankHeadingCompletionItems(file.headings, query).map((heading) => ({
    label: heading.text,
    kind: 'heading',
    insertText: heading.slug,
    detail: detailPath ? `${detailPath}#${heading.slug}` : `#${heading.slug}`,
    replacementStartColumn,
    lspKind: CompletionItemKind.Reference,
    sortText: headingCompletionSortText(heading.text, heading.slug, query),
  }))
}
