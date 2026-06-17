import type { CompletionRequest } from '@electron/services/markdownLanguage/types.js'
import { parseMarkdownDocument } from '@electron/services/workspace/markdown.js'
import type { FsIndexedMarkdownFile, FsWorkspaceIndex } from '@electron/services/workspace/types.js'

export type MarkdownRequestContext = {
  currentFile: FsIndexedMarkdownFile | null
  index: FsWorkspaceIndex
}

export const createMarkdownRequestContext = (
  request: CompletionRequest,
  index: FsWorkspaceIndex,
): MarkdownRequestContext => {
  if (!request.path) {
    return {
      currentFile: null,
      index,
    }
  }

  const currentFile = parseMarkdownDocument(request.path, request.content)
  return {
    currentFile,
    index: {
      ...index,
      files: [currentFile, ...index.files.filter((file) => file.path !== request.path)],
    },
  }
}
