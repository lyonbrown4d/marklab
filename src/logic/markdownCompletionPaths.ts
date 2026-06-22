import type { FileEntry } from '@/store/appTypes'
import type { FsWorkspaceIndex } from '@/services/fsApi'
import { createFileLabel, normalizePath, resolveRelativePath } from '@/logic/paths'

const MARKDOWN_EXTENSIONS = /\.(md|markdown)$/i
const WORKSPACE_LINK_TARGET_EXTENSIONS =
  /\.(md|markdown|ics|pdf|drawio|excalidraw|docx?|pptx?|xlsx?|csv|tsv|png|jpe?g|gif|webp|svg|avif|bmp|mp3|wav|ogg|m4a|mp4|webm|mov)$/i

export const fileCompletions = ({
  activePath,
  files,
  workspaceIndex,
  query,
  replacementStartColumn,
  mode,
}: {
  activePath: string | null
  files: FileEntry[]
  workspaceIndex?: FsWorkspaceIndex | null
  query: string
  replacementStartColumn: number
  mode: 'markdown' | 'wiki'
}) => {
  const normalizedQuery = query.toLowerCase()
  return workspaceDocumentPaths(files, workspaceIndex, mode)
    .filter((path) => {
      const label = createFileLabel(path)
      return (
        path.toLowerCase().includes(normalizedQuery) ||
        label.toLowerCase().includes(normalizedQuery)
      )
    })
    .map((path) => {
      const label = createFileLabel(path)
      return {
        label,
        kind: 'file' as const,
        insertText: mode === 'wiki' ? label : createRelativeLinkTarget(activePath, path),
        detail: path,
        replacementStartColumn,
      }
    })
}

const workspaceDocumentPaths = (
  files: FileEntry[],
  workspaceIndex: FsWorkspaceIndex | null | undefined,
  mode: 'markdown' | 'wiki',
) => {
  const extensionPattern = mode === 'wiki' ? MARKDOWN_EXTENSIONS : WORKSPACE_LINK_TARGET_EXTENSIONS
  const paths = workspaceIndex
    ? [
        ...workspaceIndex.files.map((file) => file.path),
        ...(workspaceIndex.paths ?? []).filter((path) => extensionPattern.test(path)),
        ...(mode === 'markdown'
          ? (workspaceIndex.asset_paths ?? []).filter((path) => extensionPattern.test(path))
          : []),
      ]
    : files.filter((file) => file.kind === 'file').map((file) => file.path)

  return Array.from(new Set(paths)).filter((path) => extensionPattern.test(path))
}

const createRelativeLinkTarget = (activePath: string | null, targetPath: string) => {
  if (!activePath) return targetPath
  const fromDir = activePath.split('/').slice(0, -1)
  const targetParts = targetPath.split('/')
  const targetFile = targetParts[targetParts.length - 1] ?? targetPath
  const targetDir = targetParts.slice(0, -1)

  let commonLength = 0
  while (
    commonLength < fromDir.length &&
    commonLength < targetDir.length &&
    fromDir[commonLength] === targetDir[commonLength]
  ) {
    commonLength += 1
  }

  const up = new Array(fromDir.length - commonLength).fill('..')
  const down = targetDir.slice(commonLength)
  return [...up, ...down, targetFile].join('/') || targetPath
}

export const resolveLinkedFilePath = (
  activePath: string | null,
  target: string,
  files: FileEntry[],
  workspaceIndex?: FsWorkspaceIndex | null,
) => {
  if (!activePath) return null
  if (!target.trim()) return activePath

  const normalized = resolveRelativePath(activePath, target)
  const candidates = [
    normalized,
    MARKDOWN_EXTENSIONS.test(normalized) ? normalized : `${normalized}.md`,
    MARKDOWN_EXTENSIONS.test(normalized) ? normalized : `${normalized}.markdown`,
  ].map(normalizePath)
  const existing = new Set(
    workspaceIndex
      ? workspaceIndex.files.map((file) => file.path)
      : files.filter((file) => file.kind === 'file').map((file) => file.path),
  )
  return candidates.find((candidate) => existing.has(candidate)) ?? candidates[0]
}
