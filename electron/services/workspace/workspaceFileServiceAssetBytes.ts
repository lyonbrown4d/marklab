import { readWorkspaceAssetBytes } from '@electron/services/workspace/workspaceAssetBytes.js'

type WorkspaceAssetBytesHost = {
  isAssetPathAllowed: (absolutePath: string) => boolean
  resolveRelativePath: (relativePath: string) => string
}

export const readWorkspaceFileServiceAssetBytes = (
  host: WorkspaceAssetBytesHost,
  value: unknown,
) => {
  return readWorkspaceAssetBytes(value, {
    isAllowedPath: host.isAssetPathAllowed,
    resolveRelativePath: host.resolveRelativePath,
  })
}
