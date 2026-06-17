import { parseMarkdownDocument } from '@electron/services/workspace/markdown.js'
import type { FsWorkspaceIndex } from '@electron/services/workspace/types.js'
import { getMarkdownDefinition } from '@electron/services/markdownLanguage/definitions.js'
import type {
  CompletionRequest,
  MarkdownLanguageReference,
} from '@electron/services/markdownLanguage/types.js'
import { createMarkdownRequestContext } from '@electron/services/markdownLanguage/requestContext.js'

type ReferenceTarget = {
  path: string
  headingSlug?: string | null
}

export const getMarkdownReferences = async (
  request: CompletionRequest,
  workspaceIndex: () => Promise<FsWorkspaceIndex>,
): Promise<MarkdownLanguageReference[]> => {
  if (!request.path) return []

  const context = createMarkdownRequestContext(request, await workspaceIndex())
  const target = await getReferenceTarget(request, () => Promise.resolve(context.index))
  if (!target) return []

  return context.index.files.flatMap((file) =>
    file.links
      .filter((link) => {
        if (link.is_external || link.target_path !== target.path) return false
        if (!target.headingSlug) return true
        return link.target_heading_slug === target.headingSlug
      })
      .map((link) => ({
        path: file.path,
        line: link.line,
        column: link.column,
        endColumn: link.column + Math.max(1, link.target.length),
        text: link.text || link.target,
        context: link.context,
        targetAnchor: link.target_anchor ?? null,
        targetHeadingSlug: link.target_heading_slug ?? null,
      })),
  )
}

const getReferenceTarget = async (
  request: CompletionRequest,
  workspaceIndex: () => Promise<FsWorkspaceIndex>,
): Promise<ReferenceTarget | null> => {
  const currentHeading = getHeadingAtLine(request)
  if (currentHeading) {
    return {
      path: request.path ?? '',
      headingSlug: currentHeading.slug,
    }
  }

  const definition = await getMarkdownDefinition(request, workspaceIndex)
  if (!definition) return null
  return {
    path: definition.path,
    headingSlug: definition.headingSlug ?? null,
  }
}

const getHeadingAtLine = (request: CompletionRequest) => {
  if (!request.path) return null
  const currentFile = parseMarkdownDocument(request.path, request.content)
  return currentFile.headings.find((heading) => heading.line === request.line) ?? null
}
