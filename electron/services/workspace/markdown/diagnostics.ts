import type { FsMarkdownDiagnostic, FsMarkdownLink, FsWorkspaceIndex } from '../types.js'
import { resolveIndexedLinkPath } from './targets.js'
import { charLength } from './text.js'
import { normalizeWorkspacePath } from './utils.js'

export const diagnosticsForFile = (
  index: FsWorkspaceIndex,
  filePath: string,
): FsMarkdownDiagnostic[] => {
  const filesByPath = new Map(index.files.map((file) => [file.path, file]))
  const knownPaths = workspaceKnownPaths(index)
  const diagnostics: FsMarkdownDiagnostic[] = []
  const file = filesByPath.get(filePath)
  if (!file) return diagnostics

  for (const link of file.links) {
    if (link.is_external) continue

    const targetPath = resolveIndexedLinkPath(link, filesByPath, index.files)
    if (!targetPath) continue

    const targetFile = filesByPath.get(targetPath)
    if (!targetFile) {
      diagnostics.push(
        markdownDiagnostic(link, `Cannot find linked file "${link.target}"`, 'error'),
      )
      continue
    }

    const slug = link.target_heading_slug
    if (!slug || targetFile.headings.some((heading) => heading.slug === slug)) continue
    diagnostics.push(
      markdownDiagnostic(
        link,
        `Cannot find heading "${link.target_anchor ?? slug}" in ${targetPath}`,
        'warning',
      ),
    )
  }

  if (knownPaths) {
    for (const asset of file.assets) {
      if (asset.is_external || !asset.target_path) continue
      if (knownPaths.has(asset.target_path)) continue

      diagnostics.push({
        line: asset.line,
        start_column: asset.column,
        end_column: asset.column + charLength(asset.target),
        message: `Cannot find local asset "${asset.target}"`,
        severity: 'error',
      })
    }
  }

  return diagnostics
}

const markdownDiagnostic = (
  link: FsMarkdownLink,
  message: string,
  severity: FsMarkdownDiagnostic['severity'],
): FsMarkdownDiagnostic => {
  return {
    line: link.line,
    start_column: link.column,
    end_column: link.column + charLength(link.target),
    message,
    severity,
  }
}

const workspaceKnownPaths = (index: FsWorkspaceIndex): Set<string> | null => {
  const paths = [...(index.paths ?? []), ...(index.asset_paths ?? [])]
  if (paths.length === 0) return null

  for (const file of index.files) paths.push(file.path)
  return new Set(paths.map(normalizeWorkspacePath))
}
