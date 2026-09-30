import type { FsStateData } from '@electron/services/workspace/types.js'
import { resolveMarkdownAssetTarget } from '@electron/services/workspace/workspaceAssetOperations.js'
import {
  openWorkspaceAsset,
  validateWorkspaceAssetTarget,
} from '@electron/services/workspace/workspaceOpenedAsset.js'

export const readWorkspaceExportAsset = async (
  state: FsStateData,
  documentPath: string,
  documentAbsolutePath: string,
  target: string,
  maxBytes: number,
): Promise<Buffer | null> => {
  const resolved = await resolveMarkdownAssetTarget(
    state,
    documentPath,
    target,
    documentAbsolutePath,
  )
  if (resolved.is_external || !resolved.relative_path) return null
  const validated = await validateWorkspaceAssetTarget(state, resolved.relative_path)
  const opened = validated ? await openWorkspaceAsset(validated) : null
  if (!opened) return null
  try {
    if (opened.sizeBytes <= 0 || opened.sizeBytes > maxBytes) return null
    const bytes = Buffer.allocUnsafe(opened.sizeBytes)
    let offset = 0
    while (offset < bytes.length) {
      const read = await opened.readChunk(bytes.subarray(offset), offset)
      if (read === 0) return null
      offset += read
    }
    return bytes
  } finally {
    await opened.close().catch(() => undefined)
  }
}
