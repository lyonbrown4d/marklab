import path from 'node:path'

import { isExternalTarget } from '../path.js'
import type { FsIndexedMarkdownFile, FsMarkdownAsset, FsMarkdownLink } from '../types.js'
import { guessMediaType } from './media.js'
import { headingAnchorSlug } from './slugs.js'
import { decodeURIComponentSafe, normalizeContext } from './text.js'
import {
  ensureMarkdownTarget,
  fileLabel,
  normalizeWorkspacePath,
  resolveRelativeWorkspacePath,
  splitLinkTarget,
  stripQuery,
  unwrapLinkDestination,
} from './utils.js'

export type ParsedLinkTarget = {
  targetPath: string | null
  anchor: string | null
  headingSlug: string | null
  external: boolean
}

export type LinkTargetKind = 'markdown' | 'asset'

export const createMarkdownLink = (
  sourcePath: string,
  text: string,
  target: string,
  type: 'markdown' | 'wiki',
  context: string,
  line: number,
  column: number,
): FsMarkdownLink => {
  const parsed = parseLinkTarget(sourcePath, target, type, 'markdown')

  return {
    source_path: sourcePath,
    text: text || target,
    target,
    link_type: type,
    target_path: parsed.targetPath,
    target_anchor: parsed.anchor,
    target_heading_slug: parsed.headingSlug,
    is_external: parsed.external,
    context: normalizeContext(context),
    line,
    column,
  }
}

export const createMarkdownAsset = (
  sourcePath: string,
  text: string,
  target: string,
  context: string,
  line: number,
  column: number,
): FsMarkdownAsset => {
  const parsed = parseLinkTarget(sourcePath, target, 'markdown', 'asset')
  const normalizedContext = normalizeContext([text, context].filter(Boolean).join(' '))

  return {
    source_path: sourcePath,
    text: text || null,
    target,
    target_path: parsed.targetPath,
    is_external: parsed.external,
    media_type: guessMediaType(target),
    context: normalizedContext,
    line,
    column,
  }
}

export const resolveIndexedLinkPath = (
  link: FsMarkdownLink,
  filesByPath: Map<string, FsIndexedMarkdownFile>,
  files: FsIndexedMarkdownFile[],
): string | null => {
  if (!link.target_path) return null
  if (filesByPath.has(link.target_path)) return link.target_path

  const markdownCandidate = resolveMarkdownPathCandidate(link.target_path, filesByPath)
  if (markdownCandidate) return markdownCandidate

  if (link.link_type === 'wiki') {
    const { pathPart } = splitLinkTarget(link.target)
    const wikiTarget = decodeURIComponentSafe(stripQuery(pathPart.trim()))
    const byLabel = findFileByLabel(wikiTarget, files)
    if (byLabel) return byLabel.path
  }

  return link.target_path
}

const parseLinkTarget = (
  sourcePath: string,
  target: string,
  type: 'markdown' | 'wiki',
  kind: LinkTargetKind,
): ParsedLinkTarget => {
  const trimmed = unwrapLinkDestination(target.trim())
  if (isExternalTarget(trimmed)) {
    return { targetPath: null, anchor: null, headingSlug: null, external: true }
  }

  const { pathPart, anchorPart } = splitLinkTarget(trimmed)
  const anchor = anchorPart ? decodeURIComponentSafe(anchorPart.trim()) : null
  const headingSlug = anchor ? headingAnchorSlug(anchor) : null
  const localPath = decodeURIComponentSafe(stripQuery(pathPart.trim()))
  let targetPath: string | null

  if (kind === 'asset') {
    targetPath = localPath ? resolveRelativeWorkspacePath(sourcePath, localPath) : null
  } else if (localPath) {
    targetPath =
      type === 'wiki'
        ? normalizeWorkspacePath(ensureMarkdownTarget(localPath))
        : ensureMarkdownTarget(resolveRelativeWorkspacePath(sourcePath, localPath))
  } else {
    targetPath = sourcePath
  }

  return { targetPath, anchor, headingSlug, external: false }
}

const resolveMarkdownPathCandidate = (
  targetPath: string,
  filesByPath: Map<string, FsIndexedMarkdownFile>,
): string | null => {
  if (filesByPath.has(targetPath)) return targetPath

  const ext = path.posix.extname(targetPath).toLowerCase()
  const withoutExt = ext ? targetPath.slice(0, -ext.length) : targetPath
  const candidates =
    ext === '.md'
      ? [`${withoutExt}.markdown`]
      : ext === '.markdown'
        ? [`${withoutExt}.md`]
        : [`${targetPath}.md`, `${targetPath}.markdown`]

  return candidates.find((candidate) => filesByPath.has(candidate)) ?? null
}

const findFileByLabel = (
  target: string,
  files: FsIndexedMarkdownFile[],
): FsIndexedMarkdownFile | null => {
  const normalized = fileLabel(target).toLowerCase()
  return files.find((file) => fileLabel(file.path).toLowerCase() === normalized) ?? null
}
