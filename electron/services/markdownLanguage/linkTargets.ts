import type { FsWorkspaceIndex } from '@electron/services/workspace/types.js'

const MARKDOWN_EXTENSIONS = /\.(md|markdown)$/i

export const createFileLabel = (relativePath: string) => {
  const base = relativePath.split('/').pop() ?? relativePath
  return base.replace(MARKDOWN_EXTENSIONS, '')
}

export const createRelativeLinkTarget = (activePath: string | null, targetPath: string) => {
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
  workspaceIndex: FsWorkspaceIndex,
) => {
  if (!activePath) return null
  if (!target.trim()) return activePath

  const normalized = resolveRelativePath(activePath, target)
  const candidates = [
    normalized,
    MARKDOWN_EXTENSIONS.test(normalized) ? normalized : `${normalized}.md`,
    MARKDOWN_EXTENSIONS.test(normalized) ? normalized : `${normalized}.markdown`,
  ].map(normalizePath)
  const existing = new Set(workspaceIndex.files.map((file) => file.path))
  return candidates.find((candidate) => existing.has(candidate)) ?? candidates[0]
}

export const normalizeHeadingAnchor = (anchor: string) => {
  const value = anchor.trim()
  if (!value) return ''
  try {
    return slugify(decodeURIComponent(value))
  } catch {
    return slugify(value)
  }
}

const normalizePath = (value: string) => {
  const parts = value.split('/').filter(Boolean)
  const stack: string[] = []
  for (const part of parts) {
    if (part === '.') continue
    if (part === '..') {
      stack.pop()
      continue
    }
    stack.push(part)
  }
  return stack.join('/')
}

const resolveRelativePath = (base: string, target: string) => {
  const [pathPart] = target.split('#')
  if (pathPart.startsWith('/')) {
    return normalizePath(pathPart.slice(1))
  }
  const baseDir = base.split('/').slice(0, -1).join('/')
  const joined = baseDir ? `${baseDir}/${pathPart}` : pathPart
  return normalizePath(joined)
}

const slugify = (label: string) => {
  return label
    .trim()
    .toLowerCase()
    .replace(/\s+/g, '-')
    .replace(/[^\p{L}\p{N}-]/gu, '')
    .replace(/-+/g, '-')
    .replace(/^-|-$/g, '')
}
