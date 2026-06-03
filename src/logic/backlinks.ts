import {
  createFileLabel,
  extractLinks,
  isExternalLink,
  resolveRelativePath,
  splitLinkTarget,
} from '@/logic/paths'
import type { FsWorkspaceIndex } from '@/services/fsApi'

export type BacklinkReference = {
  sourcePath: string
  text: string
  context: string
  line: number
  column: number
  targetAnchor?: string | null
  targetHeadingSlug?: string | null
}

type MarkdownFileEntry = {
  path: string
  kind: 'file' | 'folder'
}

type BuildBacklinksFromWorkspaceIndexArgs = {
  targetPath: string | null
  workspaceIndex?: FsWorkspaceIndex | null
}

type BuildBacklinksFromMarkdownContentsArgs = {
  activePath: string | null
  activeContent: string
  targetPath: string | null
  files: MarkdownFileEntry[]
  fileContents: Record<string, string>
}

export const buildBacklinksFromWorkspaceIndex = ({
  targetPath,
  workspaceIndex,
}: BuildBacklinksFromWorkspaceIndexArgs): BacklinkReference[] => {
  if (!targetPath || !workspaceIndex) return []

  return workspaceIndex.files.flatMap((file) => {
    if (file.path === targetPath) return []

    return file.links
      .filter((link) => !link.is_external && link.target_path === targetPath)
      .map((link) => ({
        sourcePath: file.path,
        text: link.text || link.target,
        context: link.context,
        line: link.line,
        column: link.column,
        targetAnchor: link.target_anchor ?? null,
        targetHeadingSlug: link.target_heading_slug ?? null,
      }))
  })
}

export const buildBacklinksFromMarkdownContents = ({
  activePath,
  activeContent,
  targetPath,
  files,
  fileContents,
}: BuildBacklinksFromMarkdownContentsArgs): BacklinkReference[] => {
  if (!targetPath) return []

  const markdownFiles = files.filter((file) => file.kind === 'file')
  if (markdownFiles.length <= 1) return []

  const nameIndex = createMarkdownNameIndex(markdownFiles)
  const results: BacklinkReference[] = []

  markdownFiles.forEach((file) => {
    if (file.path === targetPath) return

    const content = file.path === activePath ? activeContent : (fileContents[file.path] ?? '')
    if (!content) return

    extractLinks(content).forEach((link) => {
      const linkedPath = normalizeLinkedPath(file.path, link, nameIndex)
      if (linkedPath !== targetPath) return

      const { anchor } = splitLinkTarget(link.target)
      results.push({
        sourcePath: file.path,
        text: link.text || link.target,
        context: link.context,
        line: link.line,
        column: link.column,
        targetAnchor: anchor,
      })
    })
  })

  return results
}

const createMarkdownNameIndex = (files: MarkdownFileEntry[]) => {
  const nameIndex = new Map<string, string>()

  files.forEach((file) => {
    nameIndex.set(createFileLabel(file.path).toLowerCase(), file.path)
  })

  return nameIndex
}

const normalizeLinkedPath = (
  sourcePath: string,
  link: ReturnType<typeof extractLinks>[number],
  nameIndex: Map<string, string>,
) => {
  if (isExternalLink(link.target)) return null

  const { path: linkPath } = splitLinkTarget(link.target)
  if (link.type === 'wiki') {
    return nameIndex.get(linkPath.toLowerCase()) ?? `${linkPath}.md`
  }

  if (linkPath.trim().length === 0) {
    return sourcePath
  }

  const normalized = resolveRelativePath(sourcePath, linkPath)
  if (!normalized) return null
  return normalized.endsWith('.md') || normalized.endsWith('.markdown')
    ? normalized
    : `${normalized}.md`
}
