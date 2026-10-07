import Fuse from 'fuse.js'

import { diagnosticsForFile } from '@electron/services/workspace/markdown/diagnostics'
import { charLength } from '@electron/services/workspace/markdown/text'
import { fileLabel } from '@electron/services/workspace/markdown/utils'
import type { FsIndexedMarkdownFile, FsWorkspaceIndex } from '@electron/services/workspace/types'
import {
  buildWorkspaceAssetReport,
  buildWorkspaceBacklinks,
  buildWorkspaceKnowledgeInsights,
} from '@electron/services/workspace/workspaceIndexQueryDetails'
import type {
  WorkspaceDocumentInsights,
  WorkspaceKnowledgeSummary,
  WorkspaceNavigationQuery,
  WorkspaceNavigationQueryResult,
} from '@electron/services/workspace/workspaceIndexQueryTypes'
export { queryWorkspacePages } from '@electron/services/workspace/workspacePageQueries'
import { pageSummary } from '@electron/services/workspace/workspacePageQueries'

const DEFAULT_NAVIGATION_LIMIT = 20
const MAX_NAVIGATION_LIMIT = 100

export const queryWorkspaceNavigation = (
  index: FsWorkspaceIndex,
  revision: number,
  query: WorkspaceNavigationQuery = {},
): WorkspaceNavigationQueryResult => {
  const limit = boundedInteger(query.limit, 1, MAX_NAVIGATION_LIMIT, DEFAULT_NAVIGATION_LIMIT)
  const search = query.query?.trim().toLocaleLowerCase() ?? ''
  const scope = query.scope ?? 'all'
  const activePath = query.active_path ?? null
  const activeFile = index.files.find((file) => file.path === activePath)
  const fileMatches = scope === 'headings' ? [] : matchingFiles(index, search)
  const headingMatches = scope === 'files' ? [] : matchingHeadings(index, search)
  const backlinks = buildWorkspaceBacklinks(index, activePath)
  const outgoingLinks = (activeFile?.links ?? []).filter(
    (link) => !link.is_external && Boolean(link.target_path),
  )
  const missingLinks = (activeFile?.links ?? []).filter(
    (link) => !link.is_external && !link.target_path,
  )

  return {
    ready: true,
    revision,
    active_path: activePath,
    files: fileMatches.slice(0, limit),
    headings: headingMatches.slice(0, limit),
    file_total: fileMatches.length,
    heading_total: headingMatches.length,
    current: {
      headings: (activeFile?.headings ?? []).slice(0, limit).map(compactHeading),
      outgoing_links: outgoingLinks.slice(0, limit).map((link) => ({
        source_path: activeFile!.path,
        target_path: link.target_path!,
        target_anchor: link.target_anchor ?? null,
        target_heading_slug: link.target_heading_slug ?? null,
        target: link.target,
        text: link.text || link.target,
        context: link.context,
        line: link.line,
        column: link.column,
        link_type: link.link_type,
      })),
      backlinks: backlinks.slice(0, limit),
      missing_links: missingLinks.slice(0, limit).map((link) => ({
        path: activeFile!.path,
        target: link.target,
        text: link.text || link.target,
        context: link.context,
        line: link.line,
        column: link.column,
        link_type: link.link_type,
      })),
      heading_total: activeFile?.headings.length ?? 0,
      outgoing_link_total: outgoingLinks.length,
      backlink_total: backlinks.length,
      missing_link_total: missingLinks.length,
    },
    limit,
  }
}

export const queryWorkspaceDocumentInsights = (
  index: FsWorkspaceIndex,
  path: string,
  revision: number,
  assetLimit = 80,
): WorkspaceDocumentInsights => {
  const file = index.files.find((candidate) => candidate.path === path)
  return {
    ready: true,
    revision,
    path,
    found: Boolean(file),
    headings: file?.headings ?? [],
    backlinks: buildWorkspaceBacklinks(index, path),
    diagnostics: file ? documentDiagnostics(index, file) : [],
    asset_report: buildWorkspaceAssetReport(index, path, assetLimit),
    knowledge: buildWorkspaceKnowledgeInsights(index, path),
  }
}

export const queryWorkspaceKnowledgeSummary = (
  index: FsWorkspaceIndex,
  revision: number,
): WorkspaceKnowledgeSummary => {
  const incoming = new Set<string>()
  const outgoing = new Set<string>()
  let internalLinkCount = 0
  let missingLinkCount = 0

  for (const file of index.files) {
    for (const link of file.links) {
      if (link.is_external) continue
      if (!link.target_path) {
        missingLinkCount += 1
        continue
      }
      internalLinkCount += 1
      outgoing.add(file.path)
      incoming.add(link.target_path)
    }
  }
  const linked = new Set([...incoming, ...outgoing])
  const pages = index.files.map(pageSummary)
  return {
    ready: true,
    revision,
    file_count: index.files.length,
    heading_count: index.files.reduce((count, file) => count + file.headings.length, 0),
    internal_link_count: internalLinkCount,
    linked_file_count: linked.size,
    missing_link_count: missingLinkCount,
    orphan_file_count: index.files.filter(
      (file) => !incoming.has(file.path) && !outgoing.has(file.path),
    ).length,
    collection_counts: {
      all: pages.length,
      'needs-attention': pages.filter((page) => page.issue_count > 0).length,
      linked: pages.filter((page) => page.link_count > 0).length,
      structured: pages.filter((page) => page.heading_count >= 3).length,
    },
  }
}

const matchingFiles = (index: FsWorkspaceIndex, search: string) => {
  const candidates = index.files.map((file) => ({
    path: file.path,
    title: file.headings.find((heading) => heading.level === 1)?.text ?? fileLabel(file.path),
  }))
  if (!search) {
    return candidates.sort(
      (left, right) => left.title.localeCompare(right.title) || left.path.localeCompare(right.path),
    )
  }
  return new Fuse(candidates, {
    threshold: 0.35,
    keys: [
      { name: 'title', weight: 0.65 },
      { name: 'path', weight: 0.35 },
    ],
  })
    .search(search)
    .map((result) => result.item)
}

const matchingHeadings = (index: FsWorkspaceIndex, search: string) => {
  const candidates = index.files.flatMap((file) => file.headings.map(compactHeading))
  if (!search) {
    return candidates.sort(
      (left, right) => left.text.localeCompare(right.text) || left.path.localeCompare(right.path),
    )
  }
  return new Fuse(candidates, {
    threshold: 0.35,
    keys: [
      { name: 'text', weight: 0.55 },
      { name: 'path', weight: 0.3 },
      { name: 'slug', weight: 0.15 },
    ],
  })
    .search(search)
    .map((result) => result.item)
}

const compactHeading = (heading: FsIndexedMarkdownFile['headings'][number]) => ({
  path: heading.path,
  slug: heading.slug,
  text: heading.text,
  level: heading.level,
})

const documentDiagnostics = (index: FsWorkspaceIndex, file: FsIndexedMarkdownFile) => {
  const diagnostics = diagnosticsForFile(index, file.path)
  const known = new Set(
    [...(index.paths ?? []), ...index.files.map((candidate) => candidate.path)].map((path) =>
      path.toLocaleLowerCase(),
    ),
  )
  for (const link of file.links) {
    if (link.is_external || (link.target_path && known.has(link.target_path.toLocaleLowerCase()))) {
      continue
    }
    diagnostics.push({
      line: link.line,
      start_column: link.column,
      end_column: link.column + Math.max(1, charLength(link.target)),
      message: `Cannot find linked file "${link.target}"`,
      severity: 'error',
    })
  }
  return diagnostics.sort(
    (left, right) => left.line - right.line || left.start_column - right.start_column,
  )
}

const boundedInteger = (value: number | undefined, min: number, max: number, fallback: number) =>
  Number.isFinite(value) ? Math.min(max, Math.max(min, Math.floor(value!))) : fallback
