import fs from 'node:fs'

import type {
  FsMarkdownAssetImportResult,
  FsMarkdownAssetResolveResult,
} from '@electron/services/workspace/types.js'
import {
  copyAssetToDocumentAssets,
  preserveAssetPath,
  resolveMarkdownAssetTarget,
  writeAssetBytes,
} from '@electron/services/workspace/workspaceAssetOperations.js'
import { WorkspaceAnalysisService } from '@electron/services/workspace/workspaceAnalysisService.js'
import { nullableStringArg, stringArg } from '@electron/services/workspace/workspaceUtils.js'

export class WorkspaceAssetService extends WorkspaceAnalysisService {
  async importMarkdownAsset(value: unknown): Promise<FsMarkdownAssetImportResult> {
    const sourcePath = stringArg(value, 'sourcePath')
    const documentPath = stringArg(value, 'documentPath')
    const strategy = stringArg(value, 'strategy')
    const title = nullableStringArg(value, 'title')
    const documentAbs = this.resolve(documentPath)
    const stat = await fs.promises.stat(sourcePath)
    if (!stat.isFile()) throw new Error('Source asset must be a file')

    if (strategy === 'preserve-path') {
      return preserveAssetPath(sourcePath, documentAbs)
    }
    if (strategy !== 'copy-to-document-assets' && strategy !== '') {
      throw new Error(`Unsupported Markdown asset strategy: ${strategy}`)
    }
    const result = await copyAssetToDocumentAssets(this.state, sourcePath, documentAbs, title)
    this.scheduleSnapshotChanged({ restartWatcher: true })
    return result
  }

  async importMarkdownAssetBase64(value: unknown): Promise<FsMarkdownAssetImportResult> {
    const fileName = stringArg(value, 'fileName')
    const base64Data = stringArg(value, 'base64Data')
    const documentPath = stringArg(value, 'documentPath')
    const title = nullableStringArg(value, 'title')
    const bytes = Buffer.from(base64Data, 'base64')
    if (bytes.length === 0) throw new Error('Asset content must not be empty')
    const result = await writeAssetBytes(
      this.state,
      fileName,
      bytes,
      this.resolve(documentPath),
      title,
    )
    this.scheduleSnapshotChanged({ restartWatcher: true })
    return result
  }

  async resolveMarkdownAsset(value: unknown): Promise<FsMarkdownAssetResolveResult> {
    const documentPath = stringArg(value, 'documentPath')
    const target = stringArg(value, 'target').trim()
    if (!target) throw new Error('Asset target must not be empty')
    return resolveMarkdownAssetTarget(this.state, documentPath, target, this.resolve(documentPath))
  }
}
