import { resolveIndexedLinkPath } from '@electron/services/workspace/markdown/targets.js'
import type { FsMarkdownLink, FsWorkspaceIndex } from '@electron/services/workspace/types.js'
import type {
  CompletionRequest,
  MarkdownLanguageCodeAction,
} from '@electron/services/markdownLanguage/types.js'
import { createMarkdownRequestContext } from '@electron/services/markdownLanguage/requestContext.js'

type IndexedHeading = FsWorkspaceIndex['files'][number]['headings'][number]

const MAX_HEADING_REPLACEMENT_ACTIONS = 3

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
      const edit = anchorEdit(request.path, lineText, link, '')
      if (edit) {
        const replacements = closestHeadingAnchorReplacements(
          link.target_heading_slug,
          targetFile.headings,
        )

        actions.push(
          ...replacements.map((heading, index) => ({
            title: `Replace missing heading anchor "#${link.target_anchor}" with "#${heading.slug}"`,
            kind: 'replace-text' as const,
            edit: {
              ...edit,
              newText: `#${heading.slug}`,
            },
            isPreferred: index === 0,
          })),
        )

        actions.push({
          title: `Remove missing heading anchor "#${link.target_anchor}"`,
          kind: 'replace-text',
          edit,
          isPreferred: replacements.length === 0,
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

const anchorEdit = (path: string, lineText: string, link: FsMarkdownLink, newText: string) => {
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
    newText,
  }
}

const closestHeadingAnchorReplacements = (
  targetHeadingSlug: string,
  headings: IndexedHeading[],
) => {
  const seenSlugs = new Set<string>()

  return headings
    .filter((heading) => {
      if (!heading.slug || seenSlugs.has(heading.slug)) return false

      seenSlugs.add(heading.slug)
      return true
    })
    .map((heading, index) => ({
      heading,
      index,
      score: headingMatchScore(targetHeadingSlug, heading),
    }))
    .sort((left, right) => left.score - right.score || left.index - right.index)
    .slice(0, MAX_HEADING_REPLACEMENT_ACTIONS)
    .map(({ heading }) => heading)
}

const headingMatchScore = (targetHeadingSlug: string, heading: IndexedHeading) => {
  const target = comparableHeadingText(targetHeadingSlug)
  const headingSlug = comparableHeadingText(heading.slug)
  const headingText = comparableHeadingText(heading.text)

  return Math.min(
    normalizedEditDistance(target, headingSlug),
    normalizedEditDistance(target, headingText),
  )
}

const comparableHeadingText = (value: string) =>
  value
    .trim()
    .toLowerCase()
    .replace(/[\s_]+/g, '-')

const normalizedEditDistance = (left: string, right: string) => {
  if (left === right) return 0
  if (!left || !right) return Math.max(left.length, right.length)

  const previous = Array.from({ length: right.length + 1 }, (_, index) => index)
  const current = Array.from({ length: right.length + 1 }, () => 0)

  for (let leftIndex = 1; leftIndex <= left.length; leftIndex += 1) {
    current[0] = leftIndex

    for (let rightIndex = 1; rightIndex <= right.length; rightIndex += 1) {
      const cost = left[leftIndex - 1] === right[rightIndex - 1] ? 0 : 1

      current[rightIndex] = Math.min(
        current[rightIndex - 1] + 1,
        previous[rightIndex] + 1,
        previous[rightIndex - 1] + cost,
      )
    }

    for (let index = 0; index < previous.length; index += 1) {
      previous[index] = current[index]
    }
  }

  return previous[right.length] / Math.max(left.length, right.length)
}
