import { fileLabel, normalizeWorkspacePath } from '@electron/services/workspace/markdown/utils'
import type { FsMarkdownLink, FsWorkspaceIndex } from '@electron/services/workspace/types'
import type {
  WorkspaceAssetReference,
  WorkspaceAssetReport,
  WorkspaceBacklink,
  WorkspaceKnowledgeInsights,
  WorkspaceKnowledgeLink,
} from '@electron/services/workspace/workspaceIndexQueryTypes'

export const buildWorkspaceBacklinks = (
  index: FsWorkspaceIndex,
  targetPath: string | null,
): WorkspaceBacklink[] => {
  if (!targetPath) return []
  return index.files.flatMap((file) =>
    file.path === targetPath
      ? []
      : file.links
          .filter((link) => !link.is_external && link.target_path === targetPath)
          .map((link) => ({
            source_path: file.path,
            text: link.text || link.target,
            context: link.context,
            line: link.line,
            column: link.column,
            target_anchor: link.target_anchor ?? null,
            target_heading_slug: link.target_heading_slug ?? null,
          })),
  )
}

export const buildWorkspaceKnowledgeInsights = (
  index: FsWorkspaceIndex,
  targetPath: string,
): WorkspaceKnowledgeInsights => {
  const targetFile = index.files.find((file) => file.path === targetPath)
  if (!targetFile) return emptyKnowledgeInsights()
  const outgoing = groupLinks(
    targetFile.links.filter(
      (link) => !link.is_external && Boolean(link.target_path) && link.target_path !== targetPath,
    ),
    (link) => link.target_path ?? '',
  )
  const incoming = groupLinks(
    index.files.flatMap((file) =>
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
      link_type: link.link_type,
      line: link.line,
      column: link.column,
      context: link.context,
    }))
  return {
    incoming,
    outgoing,
    missing,
    incoming_count: countGroupedLinks(incoming),
    outgoing_count: countGroupedLinks(outgoing),
    missing_count: missing.length,
    orphan: incoming.length === 0 && outgoing.length === 0,
  }
}

export const buildWorkspaceAssetReport = (
  index: FsWorkspaceIndex,
  activePath: string,
  requestedLimit: number,
): WorkspaceAssetReport => {
  const limit = Number.isFinite(requestedLimit)
    ? Math.min(500, Math.max(0, Math.floor(requestedLimit)))
    : 80
  const report: WorkspaceAssetReport = {
    current_assets: [],
    current_asset_count: 0,
    current_missing_count: 0,
    workspace_missing_assets: [],
    workspace_missing_count: 0,
    limit,
  }
  const knownPaths = createKnownPathSet(index)
  for (const file of index.files) {
    for (const asset of file.assets) {
      const reference = projectAsset(file.path, asset, knownPaths)
      if (!reference) continue
      if (file.path === activePath) {
        report.current_asset_count += 1
        if (report.current_assets.length < limit) report.current_assets.push(reference)
        if (reference.status === 'missing') report.current_missing_count += 1
      }
      if (reference.status === 'missing') {
        report.workspace_missing_count += 1
        if (report.workspace_missing_assets.length < limit) {
          report.workspace_missing_assets.push(reference)
        }
      }
    }
  }
  return report
}

const groupLinks = (
  links: FsMarkdownLink[],
  getPath: (link: FsMarkdownLink) => string,
): WorkspaceKnowledgeLink[] => {
  const groups = new Map<string, WorkspaceKnowledgeLink>()
  for (const link of links) {
    const path = getPath(link)
    if (!path) continue
    const current = groups.get(path)
    if (current) {
      current.count += 1
      continue
    }
    groups.set(path, {
      path,
      label: fileLabel(path),
      count: 1,
      first_line: link.line,
      first_column: link.column,
      first_text: link.text || link.target,
      first_context: link.context,
    })
  }
  return [...groups.values()].sort(
    (left, right) => right.count - left.count || left.label.localeCompare(right.label),
  )
}

const projectAsset = (
  sourcePath: string,
  asset: FsWorkspaceIndex['files'][number]['assets'][number],
  knownPaths: Set<string> | null,
): WorkspaceAssetReference | null => {
  const target = asset.target.trim()
  if (!target || asset.is_external) return null
  const targetPath = asset.target_path ? normalizeWorkspacePath(asset.target_path) : null
  const status = !targetPath
    ? 'missing'
    : knownPaths
      ? knownPaths.has(targetPath)
        ? 'available'
        : 'missing'
      : 'unverified'
  return {
    id: `${sourcePath}:${asset.line}:${asset.column}:${target}`,
    source_path: sourcePath,
    target,
    target_path: targetPath,
    media_type: asset.media_type ?? null,
    context: asset.context,
    line: asset.line,
    column: asset.column,
    status,
  }
}

const createKnownPathSet = (index: FsWorkspaceIndex): Set<string> | null => {
  if (!index.paths && !index.asset_paths) return null
  return new Set(
    [...(index.paths ?? []), ...(index.asset_paths ?? []), ...index.files.map((file) => file.path)]
      .map(normalizeWorkspacePath)
      .filter(Boolean),
  )
}

const emptyKnowledgeInsights = (): WorkspaceKnowledgeInsights => ({
  incoming: [],
  outgoing: [],
  missing: [],
  incoming_count: 0,
  outgoing_count: 0,
  missing_count: 0,
  orphan: false,
})

const countGroupedLinks = (links: WorkspaceKnowledgeLink[]): number =>
  links.reduce((count, link) => count + link.count, 0)
