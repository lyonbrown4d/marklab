import fs from 'node:fs'

import type {
  FsAssetCapability,
  FsMarkdownAssetImportResult,
  FsMarkdownAssetResolveResult,
  FsRootInfo,
  WorkspaceRootSwitchOptions,
} from '@electron/services/workspace/types'
import {
  WorkspaceAssetCapabilities,
  workspaceAssetIdentity,
} from '@electron/services/workspace/workspaceAssetCapabilities'
import type { WorkspaceOpenedAsset } from '@electron/services/workspace/workspaceOpenedAsset'
import {
  copyAssetToDocumentAssets,
  preserveAssetPath,
  resolveMarkdownAssetTarget,
  writeAssetBytes,
} from '@electron/services/workspace/workspaceAssetOperations'
import { WorkspaceAnalysisService } from '@electron/services/workspace/workspaceAnalysisService'
import { nullableStringArg, stringArg } from '@electron/services/workspace/workspaceUtils'
import { readWorkspaceExportAsset } from '@electron/services/workspace/workspaceExportAsset'

const MAX_IMPORTED_ASSET_BYTES = 32 * 1024 * 1024

export class WorkspaceAssetService extends WorkspaceAnalysisService {
  private readonly assetCapabilities = new WorkspaceAssetCapabilities(() => this.state)

  override dispose(): void {
    this.assetCapabilities.dispose()
    super.dispose()
  }

  override async setRoot(
    value: unknown,
    options: WorkspaceRootSwitchOptions = {},
  ): Promise<FsRootInfo> {
    const previousIdentity = workspaceAssetIdentity(this.state)
    const result = await super.setRoot(value, options)
    if (workspaceAssetIdentity(this.state) !== previousIdentity) {
      this.assetCapabilities.reset()
    }
    return result
  }

  override async setSingleFile(
    value: unknown,
    options: WorkspaceRootSwitchOptions = {},
  ): Promise<FsRootInfo> {
    const previousIdentity = workspaceAssetIdentity(this.state)
    const result = await super.setSingleFile(value, options)
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

  readMarkdownExportAsset(
    documentPath: string,
    target: string,
    maxBytes: number,
  ): Promise<Buffer | null> {
    return readWorkspaceExportAsset(
      this.state,
      documentPath,
      this.resolve(documentPath),
      target,
      maxBytes,
    )
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

  async importMarkdownAssetBytes(value: unknown): Promise<FsMarkdownAssetImportResult> {
    const fileName = stringArg(value, 'fileName')
    const documentPath = stringArg(value, 'documentPath')
    const title = nullableStringArg(value, 'title')
    const bytes = Buffer.from(binaryArg(value, 'bytes'))
    if (bytes.length === 0) throw new Error('Asset content must not be empty')
    if (bytes.length > MAX_IMPORTED_ASSET_BYTES) throw new Error('Asset content is too large')
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

const binaryArg = (value: unknown, key: string): ArrayBuffer => {
  if (!value || typeof value !== 'object' || !(key in value)) {
    throw new Error(`${key} must be binary data`)
  }
  const result = (value as Record<string, unknown>)[key]
  if (!(result instanceof ArrayBuffer)) throw new Error(`${key} must be binary data`)
  return result
}
