import fs from 'node:fs/promises'

import type { FsPathMetadata } from '@electron/services/workspace/types.js'

export const readNodePathMetadata = async (
  relativePath: string,
  absolutePath: string,
): Promise<FsPathMetadata> => {
  const stat = await fs.stat(absolutePath)
  return {
    path: relativePath,
    absolute_path: absolutePath,
    kind: stat.isDirectory() ? 'folder' : 'file',
    size_bytes: stat.size,
    modified_ms: stat.mtimeMs,
    readonly: (stat.mode & 0o200) === 0,
  }
}
