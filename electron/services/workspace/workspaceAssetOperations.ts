import fs from 'node:fs'
import path from 'node:path'

import { guessMediaType, normalizeMarkdownTarget } from '@electron/services/workspace/markdown.js'
import {
  isExternalTarget,
  normalizeRelativePath,
  stripAssetQueryAndHash,
  toWorkspaceRelative,
  workspaceRootForAssets,
} from '@electron/services/workspace/path.js'
import type {
  FsMarkdownAssetImportResult,
  FsMarkdownAssetResolveResult,
  FsStateData,
} from '@electron/services/workspace/types.js'
import {
  decodeURIComponentSafe,
  pathExists,
  sanitizeFileStem,
} from '@electron/services/workspace/workspaceUtils.js'

export const preserveAssetPath = (
  sourcePath: string,
  documentAbs: string,
): FsMarkdownAssetImportResult => {
  const markdownTarget = normalizeMarkdownTarget(
    path.relative(path.dirname(documentAbs), sourcePath),
  )
  return {
    markdown_target: markdownTarget,
    relative_path: normalizeRelativePath(sourcePath),
    absolute_path: path.resolve(sourcePath),
    asset_dir: null,
    copied: false,
  }
}

export const copyAssetToDocumentAssets = async (
  state: FsStateData,
  sourcePath: string,
  documentAbs: string,
  title: string | null,
): Promise<FsMarkdownAssetImportResult> => {
  const assetDir = assetDirName(documentAbs, title)
  const assetDirAbs = path.join(path.dirname(documentAbs), assetDir)
  ensureInsideAssetRoot(state, assetDirAbs)
  await fs.promises.mkdir(assetDirAbs, { recursive: true })
  const targetAbs = await uniqueAssetTarget(assetDirAbs, path.basename(sourcePath))
  await fs.promises.copyFile(sourcePath, targetAbs)
  return copiedAssetResult(state, documentAbs, targetAbs, assetDir)
}

export const writeAssetBytes = async (
  state: FsStateData,
  fileName: string,
  bytes: Buffer,
  documentAbs: string,
  title: string | null,
): Promise<FsMarkdownAssetImportResult> => {
  const assetDir = assetDirName(documentAbs, title)
  const assetDirAbs = path.join(path.dirname(documentAbs), assetDir)
  ensureInsideAssetRoot(state, assetDirAbs)
  await fs.promises.mkdir(assetDirAbs, { recursive: true })
  const targetAbs = await uniqueAssetTarget(assetDirAbs, fileName)
  await fs.promises.writeFile(targetAbs, bytes)
  return copiedAssetResult(state, documentAbs, targetAbs, assetDir)
}

export const resolveMarkdownAssetTarget = async (
  state: FsStateData,
  documentPath: string,
  target: string,
  documentAbs: string,
): Promise<FsMarkdownAssetResolveResult> => {
  if (isExternalTarget(target)) {
    return {
      source_path: documentPath,
      target,
      absolute_path: null,
      relative_path: null,
      is_external: true,
      media_type: guessMediaType(target),
      exists: false,
    }
  }

  const localTarget = decodeURIComponentSafe(stripAssetQueryAndHash(target))
  const absolutePath = path.isAbsolute(localTarget)
    ? path.resolve(localTarget)
    : path.resolve(path.dirname(documentAbs), localTarget)
  return {
    source_path: documentPath,
    target,
    absolute_path: absolutePath,
    relative_path: toWorkspaceRelative(workspaceRootForAssets(state), absolutePath),
    is_external: false,
    media_type: guessMediaType(localTarget),
    exists: await pathExists(absolutePath),
  }
}

const copiedAssetResult = (
  state: FsStateData,
  documentAbs: string,
  targetAbs: string,
  assetDir: string,
): FsMarkdownAssetImportResult => {
  return {
    markdown_target: normalizeMarkdownTarget(path.relative(path.dirname(documentAbs), targetAbs)),
    relative_path:
      toWorkspaceRelative(workspaceRootForAssets(state), targetAbs) ??
      normalizeRelativePath(targetAbs),
    absolute_path: targetAbs,
    asset_dir: assetDir,
    copied: true,
  }
}

const assetDirName = (documentAbs: string, title: string | null): string => {
  const stem = path.parse(documentAbs).name || 'document'
  return `${sanitizeFileStem(title || stem) || 'document'}.assets`
}

const ensureInsideAssetRoot = (state: FsStateData, assetPath: string): void => {
  const root = path.resolve(workspaceRootForAssets(state))
  const relative = normalizeRelativePath(path.relative(root, path.resolve(assetPath)))
  if (relative === '..' || relative.startsWith('../') || path.isAbsolute(relative)) {
    throw new Error('Asset target must stay inside the current workspace')
  }
}

const uniqueAssetTarget = async (assetDirAbs: string, originalName: string): Promise<string> => {
  const parsed = path.parse(originalName)
  const stem = sanitizeFileStem(parsed.name) || 'asset'
  const ext = parsed.ext.replace(/[^.\da-z]/gi, '')
  for (let index = 0; ; index += 1) {
    const suffix = index === 0 ? '' : `-${index}`
    const candidate = path.join(assetDirAbs, `${stem}${suffix}${ext}`)
    if (!(await pathExists(candidate))) return candidate
  }
}
