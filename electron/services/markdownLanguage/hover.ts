import type { FsWorkspaceIndex } from '@electron/services/workspace/types.js'
import { getMarkdownDefinition } from '@electron/services/markdownLanguage/definitions.js'
import type {
  CompletionRequest,
  MarkdownLanguageHover,
} from '@electron/services/markdownLanguage/types.js'

export const getMarkdownHover = async (
  request: CompletionRequest,
  workspaceIndex: () => Promise<FsWorkspaceIndex>,
): Promise<MarkdownLanguageHover | null> => {
  const definition = await getMarkdownDefinition(request, workspaceIndex)
  if (!definition) return null

  const index = await workspaceIndex()
  const file = index.files.find((item) => item.path === definition.path)
  const heading = definition.headingSlug
    ? file?.headings.find((item) => item.slug === definition.headingSlug)
    : null

  return {
    path: definition.path,
    line: definition.line,
    heading: heading?.text ?? null,
    markdown: hoverMarkdown({
      path: definition.path,
      line: definition.line,
      heading: heading?.text ?? null,
    }),
  }
}

const hoverMarkdown = ({
  path,
  line,
  heading,
}: {
  path: string
  line: number
  heading: string | null
}) => {
  const title = heading ? `### ${heading}` : '### Markdown document'
  return `${title}\n\n${path}:${line}`
}
