import fs from 'node:fs/promises'
import path from 'node:path'

import { isMarkdownPath } from '@electron/services/workspace/path'
import { normalizeAbsolutePath } from '@electron/services/workspace/workspaceUtils'

const pendingPreparations = new Map<string, Promise<void>>()

// Windows sharing the same default root join the current preparation, but later
// selections still recheck the filesystem after user edits or deletions.
export const ensureDefaultFile = (root: string): Promise<void> => {
  const key = normalizeAbsolutePath(root)
  const pending = pendingPreparations.get(key)
  if (pending) return pending
  const request = prepareDefaultRoot(root).finally(() => {
    if (pendingPreparations.get(key) === request) pendingPreparations.delete(key)
  })
  pendingPreparations.set(key, request)
  return request
}

const prepareDefaultRoot = async (root: string): Promise<void> => {
  await fs.mkdir(root, { recursive: true })
  const directories = [root]
  while (directories.length > 0) {
    const directory = directories.pop()
    if (!directory) break
    // A listing already supplies file types; do not stat each entry or follow symlinks.
    const entries = await fs.readdir(directory, { withFileTypes: true })
    for (const entry of entries) {
      if (entry.name.startsWith('.')) continue
      if (entry.isFile() && isMarkdownPath(entry.name)) return
      if (entry.isDirectory()) {
        directories.push(path.join(directory, entry.name))
      }
    }
  }
  try {
    await fs.writeFile(path.join(root, 'Untitled.md'), '', { flag: 'wx' })
  } catch (error) {
    // A concurrent editor or preparation may have published the file meanwhile.
    if (!isAlreadyExists(error)) throw error
  }
}

const isAlreadyExists = (error: unknown): boolean =>
  typeof error === 'object' && error !== null && 'code' in error && error.code === 'EEXIST'
