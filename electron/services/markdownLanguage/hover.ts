import type { FsMarkdownLink, FsWorkspaceIndex } from '@electron/services/workspace/types.js'
import { getMarkdownDefinition } from '@electron/services/markdownLanguage/definitions.js'
import type {
  CompletionRequest,
  MarkdownLanguageHover,
} from '@electron/services/markdownLanguage/types.js'
import { parseMarkdownDocument } from '@electron/services/workspace/markdown.js'
import { resolveIndexedLinkPath } from '@electron/services/workspace/markdown/targets.js'

export const getMarkdownHover = async (
  request: CompletionRequest,
  workspaceIndex: () => Promise<FsWorkspaceIndex>,
): Promise<MarkdownLanguageHover | null> => {
  const index = await workspaceIndex()
  const definition = await getMarkdownDefinition(request, () => Promise.resolve(index))
  if (!definition) return getBrokenLinkHover(request, index)

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

const getBrokenLinkHover = (
  request: CompletionRequest,
  index: FsWorkspaceIndex,
): MarkdownLanguageHover | null => {
  if (!request.path) return null

  const link = linkAtRequestPosition(request)
  if (!link || link.is_external) return null

  const filesByPath = new Map(index.files.map((file) => [file.path, file]))
  const targetPath = resolveIndexedLinkPath(link, filesByPath, index.files)
  const targetFile = targetPath ? filesByPath.get(targetPath) : null

  if (!targetFile) {
    return {
      path: targetPath ?? link.target,
      line: link.line,
      heading: null,
      markdown: missingFileHoverMarkdown(link.target),
    }
  }

  if (
    link.target_anchor &&
    link.target_heading_slug &&
    !targetFile.headings.some((heading) => heading.slug === link.target_heading_slug)
  ) {
    return {
      path: targetPath ?? link.target,
      line: link.line,
      heading: null,
      markdown: missingHeadingHoverMarkdown(link.target_anchor, targetPath ?? link.target),
    }
  }

  return null
}

const linkAtRequestPosition = (request: CompletionRequest): FsMarkdownLink | null => {
  if (!request.path) return null

  const parsed = parseMarkdownDocument(request.path, request.content)
  const lineText = request.content.split(/\r?\n/)[request.line - 1] ?? ''
  return (
    parsed.links.find(
      (link) =>
        link.line === request.line &&
        !link.is_external &&
        isCursorOnLinkTarget(lineText, request.column, link),
    ) ?? null
  )
}

const isCursorOnLinkTarget = (lineText: string, column: number, link: FsMarkdownLink) => {
  const indexedTargetStart = lineText.indexOf(link.target, Math.max(0, link.column - 1))
  const targetStart = indexedTargetStart >= 0 ? indexedTargetStart : lineText.indexOf(link.target)
  if (targetStart < 0) return false

  const targetEnd = targetStart + link.target.length
  const cursorIndex = Math.max(0, column - 1)
  return cursorIndex >= targetStart && cursorIndex <= targetEnd
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

const missingFileHoverMarkdown = (target: string) =>
  [
    '### Broken Markdown link',
    '',
    `Cannot find \`${target}\`.`,
    '',
    'Quick fix: create the missing Markdown file from the lightbulb menu.',
  ].join('\n')

const missingHeadingHoverMarkdown = (anchor: string, path: string) =>
  [
    '### Missing heading anchor',
    '',
    `Cannot find \`#${anchor}\` in \`${path}\`.`,
    '',
    'Quick fix: remove the missing anchor from the lightbulb menu.',
  ].join('\n')
