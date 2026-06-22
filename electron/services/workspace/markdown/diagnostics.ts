import type {
  FsMarkdownDiagnostic,
  FsMarkdownLink,
  FsWorkspaceIndex,
} from '@electron/services/workspace/types.js'
import { resolveIndexedLinkPath } from '@electron/services/workspace/markdown/targets.js'
import { charLength } from '@electron/services/workspace/markdown/text.js'
import { normalizeWorkspacePath } from '@electron/services/workspace/markdown/utils.js'

export const diagnosticsForFile = (
  index: FsWorkspaceIndex,
  filePath: string,
): FsMarkdownDiagnostic[] => {
  const filesByPath = new Map(index.files.map((file) => [file.path, file]))
  const knownPaths = workspaceKnownPaths(index)
  const diagnostics: FsMarkdownDiagnostic[] = []
  const file = filesByPath.get(filePath)
  if (!file) return diagnostics

  diagnostics.push(...duplicateHeadingDiagnostics(file))

  for (const link of file.links) {
    if (link.is_external) continue

    const targetPath = resolveIndexedLinkPath(link, filesByPath, index.files)
    if (!targetPath) continue

    const targetFile = filesByPath.get(targetPath)
    if (!targetFile) {
      const normalizedTarget = normalizeWorkspacePath(targetPath)
      if (knownPaths?.has(normalizedTarget)) continue

      const casingMatch = findPathIgnoringCase(knownPaths ?? filesByPath.keys(), targetPath)
      if (casingMatch) {
        diagnostics.push(
          markdownDiagnostic(
            link,
            `Linked file path casing differs from workspace path "${casingMatch}"`,
            'warning',
          ),
        )
        continue
      }

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

      const casingMatch = findPathIgnoringCase(knownPaths, asset.target_path)
      if (casingMatch) {
        diagnostics.push({
          line: asset.line,
          start_column: asset.column,
          end_column: asset.column + charLength(asset.target),
          message: `Local asset path casing differs from workspace path "${casingMatch}"`,
          severity: 'warning',
        })
        continue
      }

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

const duplicateHeadingDiagnostics = (
  file: FsWorkspaceIndex['files'][number],
): FsMarkdownDiagnostic[] => {
  const diagnostics: FsMarkdownDiagnostic[] = []
  const firstBySlug = new Map<string, number>()

  for (const heading of file.headings) {
    const firstLine = firstBySlug.get(heading.slug)
    if (firstLine == null) {
      firstBySlug.set(heading.slug, heading.line)
      continue
    }

    diagnostics.push({
      line: heading.line,
      start_column: heading.column,
      end_column: heading.column + Math.max(1, charLength(heading.text)),
      message: `Duplicate heading anchor "${heading.slug}" also appears on line ${firstLine}`,
      severity: 'warning',
    })
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

const findPathIgnoringCase = (paths: Iterable<string>, targetPath: string): string | null => {
  const normalizedTarget = normalizeWorkspacePath(targetPath).toLowerCase()
  for (const candidate of paths) {
    if (normalizeWorkspacePath(candidate).toLowerCase() === normalizedTarget) return candidate
  }
  return null
}
