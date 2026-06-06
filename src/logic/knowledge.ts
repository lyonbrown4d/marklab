import { createFileLabel } from '@/logic/paths'
import type { FsMarkdownLink, FsWorkspaceIndex } from '@/services/fsApi'

export type KnowledgeLinkReference = {
  path: string
  label: string
  count: number
  firstLine: number
  firstColumn: number
  firstText: string
  firstContext: string
}

export type KnowledgeMissingReference = {
  target: string
  text: string
  linkType: 'markdown' | 'wiki'
  line: number
  column: number
  context: string
}

export type KnowledgeInsights = {
  incoming: KnowledgeLinkReference[]
  outgoing: KnowledgeLinkReference[]
  missing: KnowledgeMissingReference[]
  incomingCount: number
  outgoingCount: number
  missingCount: number
  orphan: boolean
}

export type WorkspaceKnowledgeSummary = {
  fileCount: number
  headingCount: number
  internalLinkCount: number
  linkedFileCount: number
  missingLinkCount: number
  orphanFileCount: number
}

const emptyInsights: KnowledgeInsights = {
  incoming: [],
  outgoing: [],
  missing: [],
  incomingCount: 0,
  outgoingCount: 0,
  missingCount: 0,
  orphan: false,
}

export const buildKnowledgeInsights = ({
  targetPath,
  workspaceIndex,
}: {
  targetPath: string | null
  workspaceIndex?: FsWorkspaceIndex | null
}): KnowledgeInsights => {
  if (!targetPath || !workspaceIndex) return emptyInsights

  const targetFile = workspaceIndex.files.find((file) => file.path === targetPath)
  if (!targetFile) return emptyInsights

  const outgoing = groupLinksByPath(
    targetFile.links.filter(
      (link) => !link.is_external && Boolean(link.target_path) && link.target_path !== targetPath,
    ),
    (link) => link.target_path ?? '',
  )
  const incoming = groupLinksByPath(
    workspaceIndex.files.flatMap((file) =>
      file.path === targetPath
        ? []
        : file.links.filter((link) => !link.is_external && link.target_path === targetPath),
    ),
    (link) => link.source_path,
  )
  const missing = targetFile.links
    .filter((link) => !link.is_external && !link.target_path)
    .map((link) => ({
      target: link.target,
      text: link.text || link.target,
      linkType: link.link_type,
      line: link.line,
      column: link.column,
      context: link.context,
    }))

  return {
    incoming,
    outgoing,
    missing,
    incomingCount: incoming.reduce((count, item) => count + item.count, 0),
    outgoingCount: outgoing.reduce((count, item) => count + item.count, 0),
    missingCount: missing.length,
    orphan: incoming.length === 0 && outgoing.length === 0,
  }
}

export const buildWorkspaceKnowledgeSummary = (
  workspaceIndex?: FsWorkspaceIndex | null,
): WorkspaceKnowledgeSummary => {
  if (!workspaceIndex) {
    return {
      fileCount: 0,
      headingCount: 0,
      internalLinkCount: 0,
      linkedFileCount: 0,
      missingLinkCount: 0,
      orphanFileCount: 0,
    }
  }

  const incoming = new Map<string, number>()
  const outgoing = new Map<string, number>()
  let internalLinkCount = 0
  let missingLinkCount = 0

  workspaceIndex.files.forEach((file) => {
    file.links.forEach((link) => {
      if (link.is_external) return
      if (!link.target_path) {
        missingLinkCount += 1
        return
      }

      internalLinkCount += 1
      outgoing.set(file.path, (outgoing.get(file.path) ?? 0) + 1)
      incoming.set(link.target_path, (incoming.get(link.target_path) ?? 0) + 1)
    })
  })

  const linkedFiles = new Set([...incoming.keys(), ...outgoing.keys()])
  const orphanFileCount = workspaceIndex.files.filter(
    (file) => !incoming.has(file.path) && !outgoing.has(file.path),
  ).length

  return {
    fileCount: workspaceIndex.files.length,
    headingCount: workspaceIndex.files.reduce((count, file) => count + file.headings.length, 0),
    internalLinkCount,
    linkedFileCount: linkedFiles.size,
    missingLinkCount,
    orphanFileCount,
  }
}

const groupLinksByPath = (
  links: FsMarkdownLink[],
  getPath: (link: FsMarkdownLink) => string,
): KnowledgeLinkReference[] => {
  const groups = new Map<string, KnowledgeLinkReference>()

  links.forEach((link) => {
    const path = getPath(link)
    if (!path) return

    const current = groups.get(path)
    if (current) {
      current.count += 1
      return
    }

    groups.set(path, {
      path,
      label: createFileLabel(path),
      count: 1,
      firstLine: link.line,
      firstColumn: link.column,
      firstText: link.text || link.target,
      firstContext: link.context,
    })
  })

  return [...groups.values()].sort((a, b) => b.count - a.count || a.label.localeCompare(b.label))
}
