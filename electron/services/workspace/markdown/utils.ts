import path from 'node:path'

import { isMarkdownPath, normalizeRelativePath, stripAssetQueryAndHash } from '../path.js'

export const fileLabel = (filePath: string): string => {
  const base = path.posix.basename(normalizeRelativePath(filePath))
  return base.replace(/\.(md|markdown)$/i, '')
}

export const normalizeWorkspacePath = (value: string): string => {
  const normalized = normalizeRelativePath(value).replace(/^[a-zA-Z]:\//, '')
  const safe: string[] = []
  for (const component of normalized.split('/')) {
    if (!component || component === '.') continue
    if (component === '..') {
      safe.pop()
      continue
    }
    safe.push(component)
  }
  return safe.join('/')
}

export const resolveRelativeWorkspacePath = (sourcePath: string, targetPath: string): string => {
  const normalizedTarget = normalizeRelativePath(targetPath)
  if (normalizedTarget.startsWith('/')) return normalizeWorkspacePath(normalizedTarget.slice(1))

  const sourceDir = path.posix.dirname(normalizeRelativePath(sourcePath))
  const joined = sourceDir === '.' ? normalizedTarget : `${sourceDir}/${normalizedTarget}`
  return normalizeWorkspacePath(joined)
}

export const ensureMarkdownTarget = (targetPath: string): string => {
  const normalized = normalizeWorkspacePath(targetPath)
  if (!normalized) return normalized

  const ext = path.posix.extname(normalized).toLowerCase()
  if (!ext) return `${normalized}.md`
  return normalized
}

export const splitLinkTarget = (
  target: string,
): { pathPart: string; anchorPart: string | null } => {
  const hashIndex = target.indexOf('#')
  if (hashIndex < 0) return { pathPart: target, anchorPart: null }

  return {
    pathPart: target.slice(0, hashIndex),
    anchorPart: target.slice(hashIndex + 1),
  }
}

export const stripQuery = (target: string): string => {
  return target.split('?')[0] ?? target
}

export const unwrapLinkDestination = (target: string): string => {
  if (target.startsWith('<') && target.endsWith('>')) return target.slice(1, -1)
  return target
}

export const normalizeReferenceLabel = (value: string): string => {
  return value.trim().replace(/\s+/g, ' ').toLocaleLowerCase()
}

export const normalizeMarkdownTarget = (target: string): string => {
  return path.posix.normalize(normalizeRelativePath(target)) || '.'
}

export const targetIsMarkdown = (target: string): boolean => {
  return isMarkdownPath(stripAssetQueryAndHash(target))
}
