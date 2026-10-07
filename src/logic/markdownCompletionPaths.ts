import { dirname, relative } from 'pathe'
import type { FileEntry } from '@/store/appTypes'
import { createFileLabel, normalizePath, resolveRelativePath, splitLinkTarget } from '@/logic/paths'

const MARKDOWN_EXTENSIONS = /\.(md|markdown)$/i
const WORKSPACE_LINK_TARGET_EXTENSIONS =
  /\.(md|markdown|ics|pdf|drawio|excalidraw|docx?|pptx?|xlsx?|csv|tsv|png|jpe?g|gif|webp|svg|avif|bmp|mp3|wav|ogg|m4a|mp4|webm|mov)$/i

export const fileCompletions = ({
  activePath,
  files,
  query,
  replacementStartColumn,
  mode,
}: {
  activePath: string | null
  files: FileEntry[]
  query: string
  replacementStartColumn: number
  mode: 'markdown' | 'wiki'
}) => {
  const normalizedQuery = query.toLowerCase()
  return workspaceDocumentPaths(files, mode)
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

const workspaceDocumentPaths = (files: FileEntry[], mode: 'markdown' | 'wiki') => {
  const extensionPattern = mode === 'wiki' ? MARKDOWN_EXTENSIONS : WORKSPACE_LINK_TARGET_EXTENSIONS
  const paths = files.filter((file) => file.kind === 'file').map((file) => file.path)

  return Array.from(new Set(paths)).filter((path) => extensionPattern.test(path))
}

const createRelativeLinkTarget = (activePath: string | null, targetPath: string) => {
  if (!activePath) return targetPath
  return relative(dirname(activePath), targetPath) || targetPath
}

export const resolveLinkedFilePath = (
  activePath: string | null,
  target: string,
  files: FileEntry[],
) => {
  if (!activePath) return null
  if (!target.trim()) return activePath

  const normalized = resolveRelativePath(activePath, localLinkPath(target))
  const candidates = [
    normalized,
    MARKDOWN_EXTENSIONS.test(normalized) ? normalized : `${normalized}.md`,
    MARKDOWN_EXTENSIONS.test(normalized) ? normalized : `${normalized}.markdown`,
  ].map(normalizePath)
  const existing = new Set(
    files.filter((file) => file.kind === 'file').map((file) => normalizePath(file.path)),
  )
  return candidates.find((candidate) => existing.has(candidate)) ?? null
}

const localLinkPath = (target: string) => {
  const { path } = splitLinkTarget(target.trim())
  const queryIndex = path.indexOf('?')
  const pathWithoutQuery = queryIndex === -1 ? path : path.slice(0, queryIndex)
  try {
    return decodeURIComponent(pathWithoutQuery)
  } catch {
    return pathWithoutQuery
  }
}
