import fs from 'node:fs'

import type {
  FsAssetBytes,
  FsAssetCapability,
  FsMarkdownAssetImportResult,
  FsMarkdownAssetResolveResult,
  FsRootInfo,
} from '@electron/services/workspace/types.js'
import {
  WorkspaceAssetCapabilities,
  workspaceAssetIdentity,
} from '@electron/services/workspace/workspaceAssetCapabilities.js'
import type { WorkspaceOpenedAsset } from '@electron/services/workspace/workspaceOpenedAsset.js'
import { readWorkspaceAssetBytes } from '@electron/services/workspace/workspaceAssetBytes.js'
import {
  copyAssetToDocumentAssets,
  preserveAssetPath,
  resolveMarkdownAssetTarget,
  writeAssetBytes,
} from '@electron/services/workspace/workspaceAssetOperations.js'
import { WorkspaceAnalysisService } from '@electron/services/workspace/workspaceAnalysisService.js'
import { nullableStringArg, stringArg } from '@electron/services/workspace/workspaceUtils.js'

export class WorkspaceAssetService extends WorkspaceAnalysisService {
  private readonly assetCapabilities = new WorkspaceAssetCapabilities(() => this.state)

  override dispose(): void {
    this.assetCapabilities.dispose()
    super.dispose()
  }

  override async setRoot(value: unknown): Promise<FsRootInfo> {
    const previousIdentity = workspaceAssetIdentity(this.state)
    const result = await super.setRoot(value)
    if (workspaceAssetIdentity(this.state) !== previousIdentity) {
      this.assetCapabilities.reset()
    }
    return result
  }

  override async setSingleFile(value: unknown): Promise<FsRootInfo> {
    const previousIdentity = workspaceAssetIdentity(this.state)
    const result = await super.setSingleFile(value)
    if (workspaceAssetIdentity(this.state) !== previousIdentity) {
      this.assetCapabilities.reset()
    }
    return result
  }

  issueAssetCapability(value: unknown): Promise<FsAssetCapability> {
    return this.assetCapabilities.issue(value)
  }

  revokeAssetCapabilities(): void {
    this.assetCapabilities.revoke()
  }

  resolveAssetCapabilityToken(token: string): Promise<WorkspaceOpenedAsset | null> {
    return this.assetCapabilities.resolveToken(token)
  }

  readAssetBytes(value: unknown): Promise<FsAssetBytes> {
    return readWorkspaceAssetBytes(value, {
      resolveAssetUrl: (assetUrl) => this.assetCapabilities.resolveUrl(assetUrl),
    })
  }

  async importMarkdownAsset(value: unknown): Promise<FsMarkdownAssetImportResult> {
    const sourcePath = stringArg(value, 'sourcePath')
    const documentPath = stringArg(value, 'documentPath')
    const strategy = stringArg(value, 'strategy')
    const title = nullableStringArg(value, 'title')
    const documentAbs = this.resolve(documentPath)
    const stat = await fs.promises.stat(sourcePath)
    if (!stat.isFile()) throw new Error('Source asset must be a file')

    if (strategy === 'preserve-path') {
      return preserveAssetPath(this.state, sourcePath, documentAbs)
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
