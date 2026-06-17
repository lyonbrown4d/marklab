import { resolveIndexedLinkPath } from '@electron/services/workspace/markdown/targets.js'
import type { FsMarkdownLink, FsWorkspaceIndex } from '@electron/services/workspace/types.js'
import type {
  CompletionRequest,
  MarkdownLanguageCodeAction,
} from '@electron/services/markdownLanguage/types.js'
import { createMarkdownRequestContext } from '@electron/services/markdownLanguage/requestContext.js'

export const getMarkdownCodeActions = async (
  request: CompletionRequest,
  workspaceIndex: () => Promise<FsWorkspaceIndex>,
): Promise<MarkdownLanguageCodeAction[]> => {
  if (!request.path) return []

  const context = createMarkdownRequestContext(request, await workspaceIndex())
  if (!context.currentFile) return []

  const filesByPath = new Map(context.index.files.map((file) => [file.path, file]))
  const lineText = request.content.split(/\r?\n/)[request.line - 1] ?? ''
  const actions: MarkdownLanguageCodeAction[] = []

  for (const link of context.currentFile.links.filter((item) => item.line === request.line)) {
    if (link.is_external) continue
    if (!isCursorOnLinkTarget(lineText, request.column, link)) continue

    const targetPath = resolveIndexedLinkPath(link, filesByPath, context.index.files)
    const targetFile = targetPath ? filesByPath.get(targetPath) : null

    if (link.target_path && !targetFile) {
      actions.push({
        title: `Create missing Markdown file "${targetPath ?? link.target_path}"`,
        kind: 'create-file',
        path: targetPath ?? link.target_path,
        isPreferred: true,
      })
    }

    if (
      link.target_anchor &&
      link.target_heading_slug &&
      targetFile &&
      !targetFile.headings.some((heading) => heading.slug === link.target_heading_slug)
    ) {
      const edit = removeAnchorEdit(request.path, lineText, link)
      if (edit) {
        actions.push({
          title: `Remove missing heading anchor "#${link.target_anchor}"`,
          kind: 'replace-text',
          edit,
          isPreferred: true,
        })
      }
    }
  }

  return actions
}

const isCursorOnLinkTarget = (lineText: string, column: number, link: FsMarkdownLink) => {
  const searchStart = Math.max(0, link.column - 1)
  const targetStart = lineText.indexOf(link.target, searchStart)
  const fallbackStart = targetStart >= 0 ? targetStart : lineText.indexOf(link.target)
  if (fallbackStart < 0) return false

  const character = Math.max(0, column - 1)
  return character >= fallbackStart && character <= fallbackStart + link.target.length
}

const removeAnchorEdit = (path: string, lineText: string, link: FsMarkdownLink) => {
  const hashIndex = link.target.indexOf('#')
  if (hashIndex < 0) return null

  const searchStart = Math.max(0, link.column - 1)
  const targetStart = lineText.indexOf(link.target, searchStart)
  const fallbackStart = targetStart >= 0 ? targetStart : lineText.indexOf(link.target)
  if (fallbackStart < 0) return null

  return {
    path,
    line: link.line,
    startColumn: fallbackStart + hashIndex + 1,
    endColumn: fallbackStart + link.target.length + 1,
    newText: '',
  }
}
