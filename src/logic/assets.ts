import { normalizePath } from '@/logic/paths'
import type { FsMarkdownAsset, FsWorkspaceIndex } from '@/services/fsApi'

export const MARKDOWN_ASSET_REPORT_LIMIT = 80

export type MarkdownAssetStatus = 'available' | 'missing' | 'unverified'

export type MarkdownAssetReference = {
  id: string
  sourcePath: string
  target: string
  targetPath: string | null
  mediaType: string | null
  context: string
  line: number
  column: number
  status: MarkdownAssetStatus
}

export type MarkdownAssetReport = {
  indexed: boolean
  currentPath: string | null
  currentAssets: MarkdownAssetReference[]
  currentAssetCount: number
  currentMissingCount: number
  workspaceMissingAssets: MarkdownAssetReference[]
  workspaceMissingCount: number
  limit: number
}

type MarkdownAssetReportArgs = {
  workspaceIndex?: FsWorkspaceIndex | null
  activePath: string | null
  limit?: number
}

export const getMarkdownAssetReport = ({
  workspaceIndex,
  activePath,
  limit = MARKDOWN_ASSET_REPORT_LIMIT,
}: MarkdownAssetReportArgs): MarkdownAssetReport => {
  const safeLimit = Math.max(0, limit)
  const report: MarkdownAssetReport = {
    indexed: Boolean(workspaceIndex),
    currentPath: activePath,
    currentAssets: [],
    currentAssetCount: 0,
    currentMissingCount: 0,
    workspaceMissingAssets: [],
    workspaceMissingCount: 0,
    limit: safeLimit,
  }

  if (!workspaceIndex) return report

  const knownPaths = knownWorkspacePaths(workspaceIndex)

  for (const file of workspaceIndex.files) {
    const isCurrentFile = Boolean(activePath && file.path === activePath)

    for (const asset of file.assets ?? []) {
      const reference = assetReference(file.path, asset, knownPaths)
      if (!reference) continue

      if (isCurrentFile) {
        report.currentAssetCount += 1
        if (report.currentAssets.length < safeLimit) report.currentAssets.push(reference)
        if (reference.status === 'missing') report.currentMissingCount += 1
      }

      if (reference.status === 'missing') {
        report.workspaceMissingCount += 1
        if (report.workspaceMissingAssets.length < safeLimit) {
          report.workspaceMissingAssets.push(reference)
        }
      }
    }
  }

  return report
}

const knownWorkspacePaths = (workspaceIndex: FsWorkspaceIndex): Set<string> | null => {
  const hasKnownPathIndex =
    Array.isArray(workspaceIndex.paths) || Array.isArray(workspaceIndex.asset_paths)
  if (!hasKnownPathIndex) return null

  const values = [
    ...(workspaceIndex.paths ?? []),
    ...(workspaceIndex.asset_paths ?? []),
    ...workspaceIndex.files.map((file) => file.path),
  ]

  return new Set(values.map(normalizeWorkspacePath).filter(Boolean))
}

const assetReference = (
  sourcePath: string,
  asset: FsMarkdownAsset,
  knownPaths: Set<string> | null,
): MarkdownAssetReference | null => {
  const target = asset.target.trim()
  if (!target || asset.is_external) return null

  const targetPath = asset.target_path ? normalizeWorkspacePath(asset.target_path) : null
  const status: MarkdownAssetStatus = !targetPath
    ? 'missing'
    : knownPaths
      ? knownPaths.has(targetPath)
        ? 'available'
        : 'missing'
      : 'unverified'

  return {
    id: `${sourcePath}:${asset.line}:${asset.column}:${target}`,
    sourcePath,
    target,
    targetPath,
    mediaType: asset.media_type ?? null,
    context: asset.context,
    line: asset.line,
    column: asset.column,
    status,
  }
}

const normalizeWorkspacePath = (value: string) => normalizePath(value.replace(/\\/g, '/'))
